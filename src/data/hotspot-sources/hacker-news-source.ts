import type { Hotspot } from '@/domain/discovery';
import type { HttpClient } from '@/ports/http-client';
import type { HotspotSource } from './hotspot-source';

const ENDPOINT = 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=20';
const LABEL = 'Hacker News';

export function parseHackerNews(body: string): Hotspot[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  const hits = (data as { hits?: unknown }).hits;
  if (!Array.isArray(hits)) return [];
  const out: Hotspot[] = [];
  for (const hit of hits) {
    if (typeof hit !== 'object' || hit === null) continue;
    const record = hit as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title : null;
    if (title === null) continue;
    const id = typeof record.objectID === 'string' ? record.objectID : '';
    const url =
      typeof record.url === 'string' && record.url.length > 0
        ? record.url
        : `https://news.ycombinator.com/item?id=${id}`;
    out.push({
      title,
      url,
      source: LABEL,
      publishedAt: toIsoDate(record.created_at),
      summary: null,
    });
  }
  return out;
}

function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString().slice(0, 10);
}

export class HackerNewsSource implements HotspotSource {
  readonly id = 'hacker-news';
  readonly label = LABEL;

  constructor(private readonly http: HttpClient) {}

  async fetch(): Promise<Hotspot[]> {
    const res = await this.http.get(ENDPOINT);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`${LABEL} HTTP ${res.status}`);
    }
    return parseHackerNews(res.text);
  }
}
