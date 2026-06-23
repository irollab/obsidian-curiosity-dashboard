import type { MetricRow } from '@/domain/models';
import { parseReviewMetrics } from '@/domain/review-table';
import type { VaultGateway } from '@/ports/vault-gateway';

export interface ReviewResult {
  path: string | null;
  metrics: MetricRow[];
  commentEvidence: string[];
}

export class ReviewMetricsService {
  constructor(
    private readonly vault: VaultGateway,
    private readonly reviewDir: string,
  ) {}

  async load(explicitPath: string | null): Promise<ReviewResult> {
    const explicit = explicitPath === null ? null : this.eligiblePath(explicitPath);
    const path = explicit ?? this.latestDatedReview();
    if (path === null) return { path: null, metrics: [], commentEvidence: [] };

    const markdown = await this.vault.read(path);
    return {
      path,
      metrics: parseReviewMetrics(markdown),
      commentEvidence: extractCommentEvidence(markdown),
    };
  }

  private latestDatedReview(): string | null {
    return this.vault
      .listMarkdownPaths()
      .map((path) => this.eligiblePath(path))
      .filter((path): path is string => path !== null)
      .map((path) => ({ path, date: reviewDate(this.vault.getFrontmatter(path)) }))
      .filter((item): item is { path: string; date: number } => item.date !== null)
      .sort((left, right) => right.date - left.date || comparePath(left.path, right.path))[0]?.path ?? null;
  }

  private eligiblePath(path: string): string | null {
    const normalizedPath = normalizeVaultPath(path);
    const normalizedDirectory = normalizeVaultPath(this.reviewDir);
    if (
      normalizedPath === null ||
      normalizedDirectory === null ||
      !normalizedPath.toLowerCase().endsWith('.md') ||
      !isInsideDirectory(normalizedPath, normalizedDirectory) ||
      !this.vault.exists(normalizedPath)
    ) {
      return null;
    }
    return normalizedPath;
  }
}

function reviewDate(frontmatter: Record<string, unknown> | null): number | null {
  return parseDate(frontmatter?.created) ?? parseDate(frontmatter?.publish_date);
}

function parseDate(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:[Tt].+)?$/.test(normalized)) return null;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return null;

  const datePart = /^(\d{4})-(\d{2})-(\d{2})/.exec(normalized);
  if (datePart !== null) {
    const year = Number(datePart[1]);
    const month = Number(datePart[2]);
    const day = Number(datePart[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
  }
  return timestamp;
}

function normalizeVaultPath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (normalized.length === 0) return '';
  const segments = normalized.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    return null;
  }
  return segments.join('/');
}

function isInsideDirectory(path: string, directory: string): boolean {
  return directory.length === 0 ? true : path.startsWith(`${directory}/`);
}

function comparePath(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function extractCommentEvidence(markdown: string): string[] {
  const supportedHeadings = new Set(['评论区需求', '评论反馈', '评论样本']);
  const evidence: string[] = [];
  let active = false;

  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^\s*(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading !== null) {
      active = (heading[1]?.length ?? 0) >= 2 && supportedHeadings.has(heading[2]?.trim() ?? '');
      continue;
    }
    if (!active) continue;
    const bullet = /^\s*[-+*]\s+(.+?)\s*$/.exec(line)?.[1]?.trim();
    if (bullet !== undefined && bullet.length > 0) evidence.push(bullet);
  }

  return evidence;
}
