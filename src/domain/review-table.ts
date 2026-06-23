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
  endLine: number;
}

export function parseReviewMetrics(markdown: string): MetricRow[] {
  const lines = visibleMarkdownLines(markdown);
  const tables = extractTables(lines);

  for (const table of tables) {
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
    const platform = nearestPlatform(lines, table, tables);
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

export function visibleMarkdownLines(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  let fence: { marker: '`' | '~'; length: number } | null = null;
  const commentState = { active: false };

  return lines.map((line) => {
    if (fence !== null) {
      if (isClosingFence(line, fence)) fence = null;
      return '';
    }

    const withoutComments = stripHtmlComments(line, commentState);
    if (/^(?: {4}|\t)/.test(withoutComments)) return '';

    const opening = /^(?: {0,3})(`{3,}|~{3,})(.*)$/.exec(withoutComments);
    const sequence = opening?.[1];
    const suffix = opening?.[2] ?? '';
    if (sequence !== undefined && !(sequence.startsWith('`') && suffix.includes('`'))) {
      fence = {
        marker: sequence[0] as '`' | '~',
        length: sequence.length,
      };
      return '';
    }
    return withoutComments;
  });
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

function nearestPlatform(
  lines: string[],
  table: MarkdownTable,
  tables: MarkdownTable[],
): string | null {
  const previousTableEnd = tables
    .filter((candidate) => candidate.endLine < table.startLine)
    .at(-1)?.endLine ?? -1;

  for (let index = table.startLine - 1; index > previousTableEnd; index -= 1) {
    if (/^ {0,3}#{1,6}(?:\s|$)/.test(lines[index] ?? '')) return null;
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
    tables.push({ headers, rows, startLine: index, endLine: Math.max(index + 1, rowIndex - 1) });
    index = rowIndex - 1;
  }

  return tables;
}

function isClosingFence(
  line: string,
  fence: { marker: '`' | '~'; length: number },
): boolean {
  const sequence = /^ {0,3}([`~]+)\s*$/.exec(line)?.[1];
  return (
    sequence !== undefined &&
    sequence[0] === fence.marker &&
    [...sequence].every((character) => character === fence.marker) &&
    sequence.length >= fence.length
  );
}

function stripHtmlComments(
  line: string,
  state: { active: boolean },
): string {
  let result = '';
  let cursor = 0;

  while (cursor < line.length) {
    if (state.active) {
      const end = line.indexOf('-->', cursor);
      if (end < 0) return result;
      state.active = false;
      cursor = end + 3;
      continue;
    }

    const start = line.indexOf('<!--', cursor);
    if (start < 0) return result + line.slice(cursor);
    result += line.slice(cursor, start);
    state.active = true;
    cursor = start + 4;
  }

  return result;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}
