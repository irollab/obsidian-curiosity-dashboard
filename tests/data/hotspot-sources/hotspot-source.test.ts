import { describe, expect, it } from 'vitest';
import { parseRssItems } from '@/data/hotspot-sources/hotspot-source';

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title>Hello World</title><link>https://example.com/a</link><pubDate>Wed, 25 Jun 2026 10:00:00 GMT</pubDate><description>desc one</description></item>
<item><title><![CDATA[CDATA 标题]]></title><link>https://example.com/b</link></item>
</channel></rss>`;

describe('parseRssItems', () => {
  it('解析 title/link/pubDate/description', () => {
    const items = parseRssItems(RSS, '测试源');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'Hello World', url: 'https://example.com/a', source: '测试源', publishedAt: '2026-06-25',
    });
    expect(items[0]?.summary).toBe('desc one');
  });

  it('支持 CDATA 标题，缺失字段降级为 null', () => {
    const items = parseRssItems(RSS, '测试源');
    expect(items[1]?.title).toBe('CDATA 标题');
    expect(items[1]?.publishedAt).toBeNull();
    expect(items[1]?.summary).toBeNull();
  });

  it('非法输入返回空数组而非抛错', () => {
    expect(parseRssItems('not xml', '源')).toEqual([]);
  });
});
