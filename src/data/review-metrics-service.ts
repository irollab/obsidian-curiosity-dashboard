import type { MetricRow } from '@/domain/models';
import { parseReviewMetrics, visibleMarkdownLines } from '@/domain/review-table';
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
    const markdownPaths = this.markdownPaths();
    const explicit =
      explicitPath === null ? null : this.safeMarkdownPath(explicitPath, markdownPaths);
    const path = explicit ?? this.latestDatedReview(markdownPaths);
    if (path === null) return { path: null, metrics: [], commentEvidence: [] };

    const markdown = await this.vault.read(path);
    return {
      path,
      metrics: parseReviewMetrics(markdown),
      commentEvidence: extractCommentEvidence(markdown),
    };
  }

  private latestDatedReview(markdownPaths: Set<string>): string | null {
    return [...markdownPaths]
      .map((path) => this.eligibleLatestPath(path, markdownPaths))
      .filter((path): path is string => path !== null)
      .map((path) => ({ path, date: reviewDate(this.vault.getFrontmatter(path)) }))
      .filter((item): item is { path: string; date: number } => item.date !== null)
      .sort((left, right) => right.date - left.date || comparePath(left.path, right.path))[0]?.path ?? null;
  }

  private eligibleLatestPath(path: string, markdownPaths: Set<string>): string | null {
    const normalizedPath = this.safeMarkdownPath(path, markdownPaths);
    const normalizedDirectory = normalizeVaultPath(this.reviewDir);
    if (
      normalizedPath === null ||
      normalizedDirectory === null ||
      !isInsideDirectory(normalizedPath, normalizedDirectory)
    ) {
      return null;
    }
    return normalizedPath;
  }

  private safeMarkdownPath(path: string, markdownPaths: Set<string>): string | null {
    const normalizedPath = normalizeVaultPath(path);
    if (
      normalizedPath === null ||
      !normalizedPath.toLowerCase().endsWith('.md') ||
      !markdownPaths.has(normalizedPath) ||
      !this.vault.exists(normalizedPath)
    ) {
      return null;
    }
    return normalizedPath;
  }

  private markdownPaths(): Set<string> {
    return new Set(
      this.vault
        .listMarkdownPaths()
        .map(normalizeVaultPath)
        .filter((path): path is string => path !== null && path.toLowerCase().endsWith('.md')),
    );
  }
}

function reviewDate(frontmatter: Record<string, unknown> | null): number | null {
  return parseDate(frontmatter?.created) ?? parseDate(frontmatter?.publish_date);
}

function parseDate(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  const dateTimePattern =
    /^(\d{4})-(\d{2})-(\d{2})(?:([ Tt])(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:(Z)|([+-])(\d{2}):?(\d{2}))?)?$/;
  const match = dateTimePattern.exec(normalized);
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const separator = match[4];
  const hour = Number(match[5] ?? 0);
  const minute = Number(match[6] ?? 0);
  const second = Number(match[7] ?? 0);
  const fraction = match[8];
  const isZulu = match[9] !== undefined;
  const offsetSign = match[10];
  const offsetHour = Number(match[11] ?? 0);
  const offsetMinute = Number(match[12] ?? 0);
  if (
    !validCalendarDate(year, month, day) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0) ||
    (separator === ' ' && (fraction !== undefined || isZulu || offsetSign !== undefined))
  ) {
    return null;
  }

  const millisecond = Number((fraction ?? '').padEnd(3, '0').slice(0, 3));
  const base = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  if (isZulu || offsetSign === undefined) return base;
  const offset = (offsetHour * 60 + offsetMinute) * 60_000;
  return offsetSign === '+' ? base - offset : base + offset;
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeVaultPath(path: string): string | null {
  if (/^[\\/]/.test(path) || /^[A-Za-z]:[\\/]/.test(path)) return null;
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
  let activeLevel: number | null = null;

  for (const line of visibleMarkdownLines(markdown)) {
    const heading = /^\s*(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading !== null) {
      const level = heading[1]?.length ?? 0;
      const isSupported = level >= 2 && supportedHeadings.has(heading[2]?.trim() ?? '');
      if (isSupported) activeLevel = level;
      else if (activeLevel !== null && level <= activeLevel) activeLevel = null;
      continue;
    }
    if (activeLevel === null) continue;
    const bullet = /^\s*[-+*]\s+(.+?)\s*$/.exec(line)?.[1]?.trim();
    if (bullet !== undefined && bullet.length > 0) evidence.push(bullet);
  }

  return evidence;
}
