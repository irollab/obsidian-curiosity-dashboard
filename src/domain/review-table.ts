import type { MetricRow } from './models';

const aliases = {
  platform: ['平台'],
  collectedAt: ['采集时间'],
  snapshotTime: ['采集时间', '时间点'],
  views: ['播放/观看', '播放/阅读', '播放', '观看'],
  likes: ['点赞'],
  favorites: ['收藏'],
  comments: ['评论'],
  shares: ['分享', '转发', '分享/转发'],
} as const;

interface MarkdownTable {
  headers: string[];
  rows: string[][];
  startLine: number;
}

export function parseReviewMetrics(markdown: string): MetricRow[] {
  const lines = markdown.split(/\r?\n/);

  for (const table of extractTables(lines)) {
    const platformColumn = column(table.headers, aliases.platform);
    const viewsColumn = column(table.headers, aliases.views);
    if (viewsColumn < 0) continue;

    if (platformColumn >= 0) {
      const metrics = table.rows
        .filter((row) => row.length <= table.headers.length)
        .map((row) => metric(valueAt(row, platformColumn) ?? '', table.headers, row))
        .filter((row) => row.platform.length > 0 && hasMetric(row));
      if (metrics.length > 0) return metrics;
      continue;
    }

    const snapshotTimeColumn = column(table.headers, aliases.snapshotTime);
    if (snapshotTimeColumn < 0) continue;
    const platform = nearestPlatform(lines, table.startLine);
    if (platform === null) continue;
    const latest = [...table.rows]
      .reverse()
      .filter((row) => row.length <= table.headers.length)
      .map((row) => metric(platform, table.headers, row))
      .find(hasMetric);
    if (latest !== undefined) return [latest];
  }

  return [];
}

function metric(platform: string, headers: string[], row: string[]): MetricRow {
  const value = (names: readonly string[]): string | null => {
    const index = column(headers, names);
    return index < 0 ? null : valueAt(row, index);
  };

  return {
    platform: platform.trim(),
    collectedAt: value(aliases.collectedAt),
    views: value(aliases.views),
    likes: value(aliases.likes),
    favorites: value(aliases.favorites),
    comments: value(aliases.comments),
    shares: value(aliases.shares),
  };
}

function hasMetric(row: MetricRow): boolean {
  return [row.views, row.likes, row.favorites, row.comments, row.shares].some(
    (value) => value !== null,
  );
}

function valueAt(row: string[], index: number): string | null {
  const value = row[index]?.trim();
  return value === undefined || value.length === 0 ? null : value;
}

function column(headers: string[], names: readonly string[]): number {
  for (const name of names) {
    const index = headers.findIndex((header) => header.trim() === name);
    if (index >= 0) return index;
  }
  return -1;
}

function nearestPlatform(lines: string[], tableStartLine: number): string | null {
  for (let index = tableStartLine - 1; index >= 0; index -= 1) {
    const match = /^\s*(?:[-+*]\s+)?平台\s*[：:]\s*(\S.*?)\s*$/.exec(lines[index] ?? '');
    const platform = match?.[1]?.trim();
    if (platform !== undefined && platform.length > 0) return platform;
  }
  return null;
}

function extractTables(lines: string[]): MarkdownTable[] {
  const tables: MarkdownTable[] = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerLine = lines[index] ?? '';
    const separatorLine = lines[index + 1] ?? '';
    if (!headerLine.includes('|') || !separatorLine.includes('|')) continue;
    const headers = splitRow(headerLine);
    const separators = splitRow(separatorLine);
    if (
      headers.length < 2 ||
      separators.length !== headers.length ||
      !separators.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      continue;
    }

    const rows: string[][] = [];
    let rowIndex = index + 2;
    while (rowIndex < lines.length) {
      const rowLine = lines[rowIndex] ?? '';
      if (rowLine.trim().length === 0 || !rowLine.includes('|')) break;
      rows.push(splitRow(rowLine));
      rowIndex += 1;
    }
    tables.push({ headers, rows, startLine: index });
    index = rowIndex - 1;
  }

  return tables;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}
