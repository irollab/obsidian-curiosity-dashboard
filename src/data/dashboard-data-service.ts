import { parseChecklistSection } from '@/domain/checklist';
import type { DashboardModel, FocusState, TopicRecord } from '@/domain/models';
import type { VaultGateway } from '@/ports/vault-gateway';
import type { DashboardSettings } from '@/settings';

import { AssociationResolver } from './association-resolver';
import { resolveFocus } from './focus-resolver';
import { ReviewMetricsService } from './review-metrics-service';
import { TopicRepository } from './topic-repository';

export class DashboardDataService {
  constructor(
    private readonly vault: VaultGateway,
    private readonly settings: DashboardSettings,
  ) {}

  async load(mobileReadOnly: boolean): Promise<DashboardModel> {
    const settings = { ...this.settings };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const before = selectionFingerprint(this.vault, settings);
      try {
        const model = await this.loadOnce(mobileReadOnly, settings);
        const after = selectionFingerprint(this.vault, settings);
        if (before === after) return model;
      } catch (error) {
        const after = selectionFingerprint(this.vault, settings);
        if (before === after) throw error;
      }
    }
    throw new DashboardSnapshotChangedError();
  }

  private async loadOnce(
    mobileReadOnly: boolean,
    settings: DashboardSettings,
  ): Promise<DashboardModel> {
    // These services intentionally live for one load. Repository snapshots are shared by all
    // projections in this model, while a later refresh observes the latest Vault state.
    const topics = new TopicRepository(this.vault, settings.topicDir);
    const resolver = new AssociationResolver(this.vault, settings);
    const reviewService = new ReviewMetricsService(this.vault, settings.reviewDir);

    const focus = resolveAssociations(resolveFocus(topics.all()), resolver);
    const focusTopic = topicFromFocus(focus);
    const associationCandidates =
      focusTopic === null
        ? emptyAssociationCandidates()
        : {
            scriptPath:
              focusTopic.scriptPath === null
                ? resolver.candidates(settings.scriptDir, focusTopic.issue)
                : [],
            assetPath:
              focusTopic.assetPath === null
                ? resolver.candidates(settings.assetDir, focusTopic.issue, true)
                : [],
            reviewPath:
              focusTopic.reviewPath === null
                ? resolver.candidates(settings.reviewDir, focusTopic.issue)
                : [],
          };
    const tasks =
      focusTopic === null
        ? []
        : parseChecklistSection(await this.vault.read(focusTopic.path));
    const review = await reviewService.load(focusTopic?.reviewPath ?? null);
    const backgroundUrl =
      settings.backgroundPath.length === 0 ? null : this.vault.resourceUrl(settings.backgroundPath);

    return {
      focus,
      tasks,
      thisWeek: topics.thisWeek(),
      queue: topics.productionQueue(),
      metrics: review.metrics,
      reviewPath: review.path,
      commentEvidence: review.commentEvidence,
      backgroundUrl,
      mobileReadOnly,
      associationCandidates,
    };
  }
}

class DashboardSnapshotChangedError extends Error {
  constructor() {
    super('Dashboard snapshot changed repeatedly during load; refresh and try again');
    this.name = 'DashboardSnapshotChangedError';
  }
}

const TOPIC_FINGERPRINT_FIELDS = [
  'type',
  'title',
  'status',
  'stage',
  'priority',
  'due_date',
  'next_action',
  'homepage_focus',
  'issue',
  'script_path',
  'asset_path',
  'review_path',
] as const;
const REVIEW_FINGERPRINT_FIELDS = ['type', 'created', 'publish_date'] as const;
const EXPLICIT_PATH_FIELDS = ['script_path', 'asset_path', 'review_path'] as const;

function selectionFingerprint(vault: VaultGateway, settings: DashboardSettings): string {
  const markdownPaths = normalizedSet(vault.listMarkdownPaths());
  const filePaths = normalizedSet(vault.listPaths());
  const folderPaths = normalizedSet(vault.listFolders());
  const topicPaths = [...markdownPaths].filter((path) => isInside(path, settings.topicDir)).sort();
  const reviewDirectoryPaths = [...markdownPaths]
    .filter((path) => isInside(path, settings.reviewDir))
    .sort();
  const topicSnapshots = topicPaths.map(
    (path): [string, Record<string, unknown> | null] => [path, safeFrontmatter(vault, path)],
  );
  const topicEntries: Array<[string, Record<string, unknown> | null]> = [];
  const explicitPaths = new Set<string>();

  for (const [path, frontmatter] of topicSnapshots) {
    topicEntries.push([path, pickFields(frontmatter, TOPIC_FINGERPRINT_FIELDS)]);
    for (const field of EXPLICIT_PATH_FIELDS) {
      const explicit = frontmatter?.[field];
      if (typeof explicit === 'string' && explicit.trim().length > 0) {
        explicitPaths.add(normalizePath(explicit));
      }
    }
  }

  const explicitReviewPaths = topicSnapshots
    .map(([, frontmatter]) => frontmatter?.review_path)
    .filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
    .map(normalizePath);
  const reviewPaths = [...new Set([...reviewDirectoryPaths, ...explicitReviewPaths])].sort();
  const reviewEntries = reviewPaths.map((path) => [
    path,
    markdownPaths.has(path)
      ? pickFields(safeFrontmatter(vault, path), REVIEW_FINGERPRINT_FIELDS)
      : null,
  ]);
  const explicitStatuses = [...explicitPaths]
    .sort()
    .map((path) => [
      path,
      {
        file: filePaths.has(path),
        folder: folderPaths.has(path),
        markdown: markdownPaths.has(path),
      },
    ]);

  return stableSerialize({
    topicEntries,
    reviewEntries,
    explicitStatuses,
    scriptCandidates: [...markdownPaths]
      .filter((path) => isInside(path, settings.scriptDir))
      .sort(),
    assetCandidates: [...filePaths, ...folderPaths]
      .filter((path) => isInside(path, settings.assetDir))
      .sort(),
    reviewCandidates: reviewDirectoryPaths,
    background: {
      path: settings.backgroundPath,
      file: filePaths.has(normalizePath(settings.backgroundPath)),
    },
  });
}

function normalizedSet(paths: string[]): Set<string> {
  return new Set(paths.map(normalizePath));
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function isInside(path: string, directory: string): boolean {
  const normalizedDirectory = normalizePath(directory);
  return normalizedDirectory.length === 0 || path.startsWith(`${normalizedDirectory}/`);
}

function safeFrontmatter(vault: VaultGateway, path: string): Record<string, unknown> | null {
  try {
    return vault.getFrontmatter(path);
  } catch {
    return null;
  }
}

function pickFields(
  frontmatter: Record<string, unknown> | null,
  fields: readonly string[],
): Record<string, unknown> | null {
  if (frontmatter === null) return null;
  return Object.fromEntries(fields.map((field) => [field, frontmatter[field] ?? null]));
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

function resolveAssociations(focus: FocusState, resolver: AssociationResolver): FocusState {
  if (focus.kind === 'ready') {
    const topic = { ...resolver.resolve(focus.topic), stage: focus.topic.stage };
    return { kind: 'ready', topic };
  }
  if (focus.kind === 'invalid-stage') {
    const topic = { ...resolver.resolve(focus.topic), stage: focus.topic.stage };
    return { kind: 'invalid-stage', topic };
  }
  return focus;
}

function topicFromFocus(focus: FocusState): TopicRecord | null {
  return focus.kind === 'ready' || focus.kind === 'invalid-stage' ? focus.topic : null;
}

function emptyAssociationCandidates(): DashboardModel['associationCandidates'] {
  return { scriptPath: [], assetPath: [], reviewPath: [] };
}
