import { describe, expect, it } from 'vitest';
import { HotspotFetchService, type HotspotCache } from '@/data/hotspot-fetch-service';
import type { Hotspot } from '@/domain/discovery';
import type { HotspotSource } from '@/data/hotspot-sources/hotspot-source';

function source(id: string, label: string, impl: () => Promise<Hotspot[]>): HotspotSource {
  return { id, label, fetch: impl };
}
const spot = (title: string): Hotspot => ({ title, url: `https://${title}`, source: 'x', publishedAt: null, summary: null });

describe('HotspotFetchService', () => {
  it('成功源 status=ok，并发抓取', async () => {
    const svc = new HotspotFetchService(
      [source('a', 'A', async () => [spot('a1')]), source('b', 'B', async () => [spot('b1')])],
      { now: () => 100 },
    );
    const results = await svc.fetchAll({});
    expect(results.map((r) => r.status)).toEqual(['ok', 'ok']);
    expect(results[0]?.fetchedAt).toBe(100);
  });

  it('单源失败 → status=failed，回落缓存为 stale 条目', async () => {
    const prev: HotspotCache = { b: { items: [spot('cachedB')], fetchedAt: 1, status: 'ok' } };
    const svc = new HotspotFetchService(
      [source('a', 'A', async () => [spot('a1')]), source('b', 'B', async () => { throw new Error('boom'); })],
      { now: () => 200 },
    );
    const results = await svc.fetchAll(prev);
    const b = results.find((r) => r.sourceId === 'b');
    expect(b?.status).toBe('failed');
    expect(b?.error).toContain('boom');
    expect(b?.items.map((i) => i.title)).toEqual(['cachedB']); // 降级到上次缓存
  });

  it('单源去重（同 url）', async () => {
    const svc = new HotspotFetchService(
      [source('a', 'A', async () => [spot('dup'), spot('dup')])], { now: () => 1 },
    );
    const results = await svc.fetchAll({});
    expect(results[0]?.items).toHaveLength(1);
  });

  it('超时按失败处理', async () => {
    const svc = new HotspotFetchService(
      [source('slow', 'Slow', () => new Promise((resolve) => setTimeout(() => resolve([]), 50)))],
      { now: () => 1, timeoutMs: 5 },
    );
    const results = await svc.fetchAll({});
    expect(results[0]?.status).toBe('failed');
    expect(results[0]?.error).toContain('超时');
  });
});
