// tests/data/hotspot-sources/rss-source.test.ts
import { describe, expect, it } from 'vitest';
import { RssSource } from '@/data/hotspot-sources/rss-source';
import type { HttpClient } from '@/ports/http-client';

const FEED_A = `<rss><channel><item><title>A1</title><link>https://a/1</link></item></channel></rss>`;
const FEED_B = `<rss><channel><item><title>B1</title><link>https://b/1</link></item></channel></rss>`;

function http(map: Record<string, { status: number; text: string }>): HttpClient {
  return { get: async (url) => map[url] ?? { status: 404, text: '' } };
}

describe('RssSource', () => {
  it('聚合多个 feed 的条目', async () => {
    const src = new RssSource('rss', '订阅 RSS', ['https://a/feed', 'https://b/feed'],
      http({ 'https://a/feed': { status: 200, text: FEED_A }, 'https://b/feed': { status: 200, text: FEED_B } }));
    const items = await src.fetch();
    expect(items.map((i) => i.title).sort()).toEqual(['A1', 'B1']);
  });

  it('单 feed 失败不影响其他 feed', async () => {
    const src = new RssSource('rss', '订阅 RSS', ['https://a/feed', 'https://bad/feed'],
      http({ 'https://a/feed': { status: 200, text: FEED_A } }));
    const items = await src.fetch();
    expect(items.map((i) => i.title)).toEqual(['A1']);
  });

  it('全部 feed 失败则抛错', async () => {
    const src = new RssSource('rss', '订阅 RSS', ['https://bad/feed'], http({}));
    await expect(src.fetch()).rejects.toThrow();
  });

  it('无 feed 配置返回空数组', async () => {
    const src = new RssSource('rss', '订阅 RSS', [], http({}));
    expect(await src.fetch()).toEqual([]);
  });
});
