// tests/mutations/hotspot-archive-builder.test.ts
import { describe, expect, it } from 'vitest';
import { buildHotspotArchive, hotspotArchivePath } from '@/mutations/hotspot-archive-builder';
import type { HotspotSourceResult } from '@/domain/discovery';

const results: HotspotSourceResult[] = [
  {
    sourceId: 'hn', label: 'Hacker News', status: 'ok', fetchedAt: 0, error: null,
    items: [{ title: 'A', url: 'https://a', source: 'Hacker News', publishedAt: '2026-06-26', summary: null }],
  },
  {
    sourceId: 'weibo', label: '微博热搜', status: 'failed', fetchedAt: 0, error: '超时',
    items: [],
  },
];

describe('buildHotspotArchive', () => {
  it('生成带 frontmatter + 按源分组的 markdown', () => {
    const md = buildHotspotArchive({ date: '2026-06-26', results });
    expect(md).toMatch(/^---\n/);
    expect(md).toContain('date: 2026-06-26');
    expect(md).toContain('## Hacker News');
    expect(md).toContain('- [A](https://a)');
    expect(md).toContain('微博热搜');     // 失败源也留痕
    expect(md).toContain('超时');
  });
});

describe('hotspotArchivePath', () => {
  it('默认文件名 = 目录/日期-热点.md', () => {
    const p = hotspotArchivePath('30-竞品热点/热点观察', '2026-06-26', () => false);
    expect(p).toBe('30-竞品热点/热点观察/2026-06-26-热点.md');
  });

  it('同日已存在则追加序号', () => {
    const exists = (path: string): boolean =>
      path === '30-竞品热点/热点观察/2026-06-26-热点.md' ||
      path === '30-竞品热点/热点观察/2026-06-26-热点-2.md';
    const p = hotspotArchivePath('30-竞品热点/热点观察', '2026-06-26', exists);
    expect(p).toBe('30-竞品热点/热点观察/2026-06-26-热点-3.md');
  });
});
