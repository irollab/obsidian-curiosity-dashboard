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

interface MarkdownHeading {
  index: number;
  level: number;
  title: string;
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
  const listLevels: number[] = [];

  return lines.map((line) => {
    if (fence !== null) {
      if (isClosingFence(line, fence)) fence = null;
      return '';
    }

    const withoutComments = stripHtmlComments(line, commentState);
    if (parseHeading(withoutComments, 0) !== null) listLevels.length = 0;
    const listItem = parseListItem(withoutComments);
    const indentation = indentationWidth(/^([ \t]*)/.exec(withoutComments)?.[1] ?? '');
    if (indentation >= 4 && !isNestedListItem(listItem, listLevels)) return '';

    const opening = /^(?: {0,3})(`{3,}|~{3,})(.*)$/.exec(withoutComments);
    const sequence = opening?.[1];
    const suffix = opening?.[2] ?? '';
    if (sequence !== undefined && !(sequence.startsWith('`') && suffix.includes('`'))) {
      listLevels.length = 0;
      fence = {
        marker: sequence[0] as '`' | '~',
        length: sequence.length,
      };
      return '';
    }
    updateListLevels(withoutComments, listItem, listLevels);
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
  const currentHeading = nearestHeadingBefore(lines, table.startLine);
  const localBoundary = Math.max(previousTableEnd, currentHeading?.index ?? -1);

  for (let index = table.startLine - 1; index > localBoundary; index -= 1) {
    const platform = platformDeclaration(lines[index] ?? '');
    if (platform !== null) return platform;
  }

  return currentHeading === null
    ? null
    : platformFromPrecedingMetadataSection(lines, currentHeading);
}

function platformFromPrecedingMetadataSection(
  lines: string[],
  currentHeading: MarkdownHeading,
): string | null {
  if (!['数据快照', '数据记录'].includes(currentHeading.title)) return null;

  let previousHeading: MarkdownHeading | null = null;
  for (let index = currentHeading.index - 1; index >= 0; index -= 1) {
    const heading = parseHeading(lines[index] ?? '', index);
    if (heading === null) continue;
    if (heading.level < currentHeading.level) return null;
    if (heading.level === currentHeading.level) {
      previousHeading = heading;
      break;
    }
  }
  if (
    previousHeading === null ||
    !['作品信息', '发布信息'].includes(previousHeading.title)
  ) {
    return null;
  }

  const platforms = new Set<string>();
  for (let index = previousHeading.index + 1; index < currentHeading.index; index += 1) {
    const platform = platformDeclaration(lines[index] ?? '');
    if (platform !== null) platforms.add(platform);
  }
  return platforms.size === 1 ? ([...platforms][0] ?? null) : null;
}

function nearestHeadingBefore(lines: string[], lineNumber: number): MarkdownHeading | null {
  for (let index = lineNumber - 1; index >= 0; index -= 1) {
    const heading = parseHeading(lines[index] ?? '', index);
    if (heading !== null) return heading;
  }
  return null;
}

function parseHeading(line: string, index: number): MarkdownHeading | null {
  const match = /^ {0,3}(#{1,6})(?:\s+(.+?)\s*#*\s*|\s*)$/.exec(line);
  const marker = match?.[1];
  if (marker === undefined) return null;
  return { index, level: marker.length, title: match?.[2]?.trim() ?? '' };
}

function platformDeclaration(line: string): string | null {
  const platform = /^\s*(?:[-+*]\s+)?平台\s*[：:]\s*(\S.*?)\s*$/.exec(line)?.[1]?.trim();
  return platform === undefined || platform.length === 0 ? null : platform;
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

function parseListItem(line: string): { indentation: number } | null {
  const match = /^([ \t]*)(?:[-+*]|\d+[.)])\s+/.exec(line);
  return match === null ? null : { indentation: indentationWidth(match[1] ?? '') };
}

function indentationWidth(whitespace: string): number {
  let width = 0;
  for (const character of whitespace) {
    width = character === '\t' ? width + (4 - (width % 4)) : width + 1;
  }
  return width;
}

function isNestedListItem(
  item: { indentation: number } | null,
  listLevels: number[],
): boolean {
  return item !== null && listLevels.some((level) => level < item.indentation);
}

function updateListLevels(
  line: string,
  item: { indentation: number } | null,
  listLevels: number[],
): void {
  if (item !== null) {
    const ancestors = listLevels.filter((level) => level < item.indentation);
    listLevels.splice(0, listLevels.length, ...ancestors, item.indentation);
    return;
  }
  if (line.trim().length > 0 && indentationWidth(/^([ \t]*)/.exec(line)?.[1] ?? '') === 0) {
    listLevels.length = 0;
  }
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}
