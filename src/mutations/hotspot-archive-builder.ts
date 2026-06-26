// src/mutations/hotspot-archive-builder.ts
import type { Hotspot, HotspotSourceResult } from '@/domain/discovery';

export interface HotspotArchiveInput {
  date: string;
  results: HotspotSourceResult[];
}

export function buildHotspotArchive(input: HotspotArchiveInput): string {
  const total = input.results.reduce((sum, r) => sum + r.items.length, 0);
  const sourceLabels = input.results.map((r) => r.label).join('、');
  const front = [
    '---',
    `date: ${input.date}`,
    `sources: ${sourceLabels}`,
    `count: ${total}`,
    '---',
  ].join('\n');

  const blocks = input.results.map((r) => renderSource(r)).join('\n\n');
  return `${front}\n\n# ${input.date} 热点观察\n\n${blocks}\n`;
}

function renderSource(result: HotspotSourceResult): string {
  const header = `## ${result.label}`;
  if (result.status === 'failed') {
    return `${header}\n\n> ⚠️ 抓取失败：${result.error ?? '未知错误'}`;
  }
  if (result.items.length === 0) {
    return `${header}\n\n> （本次无条目）`;
  }
  return `${header}\n\n${result.items.map(renderItem).join('\n')}`;
}

function renderItem(item: Hotspot): string {
  const date = item.publishedAt === null ? '' : ` · ${item.publishedAt}`;
  const link = item.url.trim().length > 0 ? `[${item.title}](${item.url})` : item.title;
  return `- ${link}${date}`;
}

export function hotspotArchivePath(
  dir: string,
  date: string,
  exists: (path: string) => boolean,
): string {
  const base = dir.replace(/\\/g, '/').replace(/\/+$/, '');
  const first = `${base}/${date}-热点.md`;
  if (!exists(first)) return first;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}/${date}-热点-${n}.md`;
    if (!exists(candidate)) return candidate;
  }
  return `${base}/${date}-热点-${Date.now()}.md`;
}
