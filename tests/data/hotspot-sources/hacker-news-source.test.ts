import { describe, expect, it } from 'vitest';
import { HackerNewsSource, parseHackerNews } from '@/data/hotspot-sources/hacker-news-source';
import type { HttpClient } from '@/ports/http-client';

const JSON_SAMPLE = JSON.stringify({
  hits: [
    { title: 'Show HN: Cool Tool', url: 'https://t.co/cool', created_at: '2026-06-25T08:00:00Z', objectID: '1' },
    { title: 'No URL story', url: null, created_at: '2026-06-24T08:00:00Z', objectID: '2' },
  ],
});

describe('parseHackerNews', () => {
  it('解析 hits → Hotspot[]，无 url 用 HN item 链接兜底', () => {
    const items = parseHackerNews(JSON_SAMPLE);
    expect(items[0]).toMatchObject({ title: 'Show HN: Cool Tool', url: 'https://t.co/cool', source: 'Hacker News', publishedAt: '2026-06-25' });
    expect(items[1]?.url).toBe('https://news.ycombinator.com/item?id=2');
  });

  it('坏 JSON 返回空数组', () => {
    expect(parseHackerNews('{bad')).toEqual([]);
  });
});

describe('HackerNewsSource', () => {
  it('fetch 调 HttpClient 并解析', async () => {
    const http: HttpClient = { get: async () => ({ status: 200, text: JSON_SAMPLE }) };
    const items = await new HackerNewsSource(http).fetch();
    expect(items).toHaveLength(2);
  });

  it('非 200 抛错（交编排层隔离）', async () => {
    const http: HttpClient = { get: async () => ({ status: 503, text: '' }) };
    await expect(new HackerNewsSource(http).fetch()).rejects.toThrow();
  });
});
