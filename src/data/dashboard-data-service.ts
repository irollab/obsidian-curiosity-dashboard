import { parseChecklistSection } from '@/domain/checklist';
import type { DashboardModel, FocusState, TopicRecord } from '@/domain/models';
import type { Frontmatter, VaultGateway } from '@/ports/vault-gateway';
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
      const startPaths = capturePaths(this.vault);
      const snapshotVault = new PathSnapshotVaultGateway(this.vault, startPaths);
      const before = selectionFingerprint(snapshotVault, settings, startPaths);
      try {
        const model = await this.loadOnce(snapshotVault, mobileReadOnly, settings);
        const endPaths = capturePaths(this.vault);
        const after = selectionFingerprint(this.vault, settings, endPaths);
        if (before === after) return model;
      } catch (error) {
        const endPaths = capturePaths(this.vault);
        const after = selectionFingerprint(this.vault, settings, endPaths);
        if (before === after) throw error;
      }
    }
    throw new DashboardSnapshotChangedError();
  }

  private async loadOnce(
    vault: VaultGateway,
    mobileReadOnly: boolean,
    settings: DashboardSettings,
  ): Promise<DashboardModel> {
    // These services intentionally live for one load. Repository snapshots are shared by all
    // projections in this model, while a later refresh observes the latest Vault state.
    const topics = new TopicRepository(vault, settings.topicDir);
    const resolver = new AssociationResolver(vault, settings);
    const reviewService = new ReviewMetricsService(vault, settings.reviewDir);

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
        : parseChecklistSection(await vault.read(focusTopic.path));
    const review = await reviewService.load(focusTopic?.reviewPath ?? null);
    const backgroundUrl =
      settings.backgroundPath.length === 0 ? null : vault.resourceUrl(settings.backgroundPath);

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

interface PathSnapshot {
  files: ReadonlySet<string>;
  markdown: ReadonlySet<string>;
  folders: ReadonlySet<string>;
}

function capturePaths(vault: VaultGateway): PathSnapshot {
  const files = normalizedSet(vault.listPaths());
  return {
    files,
    markdown: new Set([...files].filter((path) => path.endsWith('.md'))),
    folders: normalizedSet(vault.listFolders()),
  };
}

function selectionFingerprint(
  vault: VaultGateway,
  settings: DashboardSettings,
  paths: PathSnapshot,
): string {
  const markdownPaths = paths.markdown;
  const filePaths = paths.files;
  const folderPaths = paths.folders;
  const topicPaths = [...markdownPaths].filter((path) => isInside(path, settings.topicDir)).sort();
  const reviewDirectoryPaths = [...markdownPaths]
    .filter((path) => isInside(path, settings.reviewDir))
    .sort();
  const topicSnapshots = topicPaths
    .map((path): [string, Record<string, unknown> | null] => [path, safeFrontmatter(vault, path)])
    .filter(([path, frontmatter]) =>
      frontmatter?.type === '选题' && topicIssue(path, frontmatter) !== null,
    );
  const topicEntries: Array<[string, Record<string, unknown> | null]> = [];
  const explicitPaths = new Set<string>();
  const focusedTopics = topicSnapshots.filter(([, frontmatter]) =>
    isFocusedTopic(frontmatter),
  );
  const focusedTopic = focusedTopics.length === 1 ? focusedTopics[0] : undefined;
  const focusIssue = focusedTopic === undefined ? null : topicIssue(focusedTopic[0], focusedTopic[1]);

  for (const [path, frontmatter] of topicSnapshots) {
    topicEntries.push([path, pickFields(frontmatter, TOPIC_FINGERPRINT_FIELDS)]);
    if (focusedTopic?.[0] !== path) continue;
    for (const field of EXPLICIT_PATH_FIELDS) {
      const explicit = frontmatterPath(frontmatter?.[field]);
      if (explicit !== null) explicitPaths.add(explicit);
    }
  }

  const explicitReviewPath = frontmatterPath(focusedTopic?.[1]?.review_path);
  const explicitReviewPaths = explicitReviewPath === null ? [] : [explicitReviewPath];
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
    scriptCandidates: matchingIssuePaths(markdownPaths, settings.scriptDir, focusIssue),
    assetCandidates: matchingIssuePaths(
      new Set([...filePaths, ...folderPaths]),
      settings.assetDir,
      focusIssue,
    ),
    reviewCandidates: reviewDirectoryPaths,
    background: {
      path: settings.backgroundPath,
      file: filePaths.has(normalizePath(settings.backgroundPath)),
    },
  });
}

class PathSnapshotVaultGateway implements VaultGateway {
  constructor(
    private readonly source: VaultGateway,
    private readonly paths: PathSnapshot,
  ) {}

  listPaths(): string[] {
    return [...this.paths.files];
  }

  listMarkdownPaths(): string[] {
    return [...this.paths.markdown];
  }

  listFolders(): string[] {
    return [...this.paths.folders];
  }

  getFrontmatter(path: string): Frontmatter | null {
    return this.source.getFrontmatter(path);
  }

  read(path: string): Promise<string> {
    return this.source.read(path);
  }

  process(path: string, transform: (content: string) => string): Promise<void> {
    return this.source.process(path, transform);
  }

  updateFrontmatter(path: string, mutate: (frontmatter: Frontmatter) => void): Promise<void> {
    return this.source.updateFrontmatter(path, mutate);
  }

  create(path: string, content: string): Promise<void> {
    return this.source.create(path, content);
  }

  exists(path: string): boolean {
    const normalized = normalizePath(path);
    return this.paths.files.has(normalized) || this.paths.folders.has(normalized);
  }

  resourceUrl(path: string): string | null {
    return this.source.resourceUrl(path);
  }
}

function normalizedSet(paths: string[]): Set<string> {
  return new Set(paths.map(normalizePath));
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function frontmatterPath(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? normalizePath(value.trim())
    : null;
}

function isInside(path: string, directory: string): boolean {
  const normalizedDirectory = normalizePath(directory);
  return normalizedDirectory.length === 0 || path.startsWith(`${normalizedDirectory}/`);
}

function isFocusedTopic(frontmatter: Frontmatter | null): boolean {
  return frontmatter?.type === '选题' && frontmatter.homepage_focus === true;
}

function topicIssue(path: string, frontmatter: Frontmatter | null): number | null {
  if (
    typeof frontmatter?.issue === 'number' &&
    Number.isSafeInteger(frontmatter.issue) &&
    frontmatter.issue > 0
  ) {
    return frontmatter.issue;
  }
  const basename = path.split('/').at(-1)?.replace(/\.md$/i, '') ?? '';
  const issue = Number.parseInt(basename.match(/^(\d+)/)?.[1] ?? '', 10);
  return Number.isSafeInteger(issue) && issue > 0 ? issue : null;
}

function matchingIssuePaths(
  paths: ReadonlySet<string>,
  directory: string,
  issue: number | null,
): string[] {
  if (issue === null) return [];
  const issuePattern = new RegExp(`^(?:第)?0*${issue}(?:期|-|_|$)`);
  return [...paths]
    .filter((path) => isInside(path, directory))
    .filter((path) => issuePattern.test((path.split('/').at(-1) ?? '').replace(/\.[^.]+$/, '')))
    .sort();
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
