import { describe, expect, it } from 'vitest';
import { dedupeHotspots, type Hotspot } from '@/domain/discovery';

function spot(over: Partial<Hotspot>): Hotspot {
  return { title: 't', url: 'https://a', source: 's', publishedAt: null, summary: null, ...over };
}

describe('dedupeHotspots', () => {
  it('按 url 去重，保留首次出现', () => {
    const out = dedupeHotspots([
      spot({ title: 'A', url: 'https://x' }),
      spot({ title: 'A2', url: 'https://x' }),
      spot({ title: 'B', url: 'https://y' }),
    ]);
    expect(out.map((h) => h.title)).toEqual(['A', 'B']);
  });

  it('url 为空时按标题去重（trim+小写）', () => {
    const out = dedupeHotspots([
      spot({ title: ' Hello ', url: '' }),
      spot({ title: 'hello', url: '' }),
    ]);
    expect(out).toHaveLength(1);
  });
});
