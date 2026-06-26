import { describe, expect, it } from 'vitest';
import { DomesticTrendingSource, parseDomesticTrending } from '@/data/hotspot-sources/domestic-trending-source';
import type { HttpClient } from '@/ports/http-client';

const SAMPLE = JSON.stringify({
  data: [
    { name: '微博', data: [{ title: '某热搜', url: 'https://weibo/1', hot: '120万' }] },
    { name: '知乎', data: [{ title: '某问题', url: 'https://zhihu/2' }] },
  ],
});

describe('parseDomesticTrending', () => {
  it('展平各平台条目，source 标平台名', () => {
    const items = parseDomesticTrending(SAMPLE);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: '某热搜', url: 'https://weibo/1', source: '微博热榜' });
  });

  it('坏 JSON 返回空数组', () => {
    expect(parseDomesticTrending('x')).toEqual([]);
  });
});

describe('DomesticTrendingSource', () => {
  it('fetch 解析；非 2xx 抛错', async () => {
    const ok: HttpClient = { get: async () => ({ status: 200, text: SAMPLE }) };
    expect(await new DomesticTrendingSource(ok).fetch()).toHaveLength(2);
    const bad: HttpClient = { get: async () => ({ status: 502, text: '' }) };
    await expect(new DomesticTrendingSource(bad).fetch()).rejects.toThrow();
  });
});
