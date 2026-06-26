import type { Hotspot } from '@/domain/discovery';
import type { HttpClient } from '@/ports/http-client';
import type { HotspotSource } from './hotspot-source';

const DEFAULT_ENDPOINT = 'https://api.vvhan.com/api/hotlist/all';
const LABEL = '国内热榜';

export function parseDomesticTrending(body: string): Hotspot[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  const platforms = (data as { data?: unknown }).data;
  if (!Array.isArray(platforms)) return [];
  const out: Hotspot[] = [];
  for (const platform of platforms) {
    if (typeof platform !== 'object' || platform === null) continue;
    const record = platform as Record<string, unknown>;
    const name = typeof record.name === 'string' ? `${record.name}热榜` : LABEL;
    const entries = record.data;
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null) continue;
      const item = entry as Record<string, unknown>;
      const title = typeof item.title === 'string' ? item.title : null;
      if (title === null) continue;
      out.push({
        title,
        url: typeof item.url === 'string' ? item.url : '',
        source: name,
        publishedAt: null,
        summary: typeof item.hot === 'string' ? `热度 ${item.hot}` : null,
      });
    }
  }
  return out;
}

export class DomesticTrendingSource implements HotspotSource {
  readonly id = 'domestic-trending';
  readonly label = LABEL;

  constructor(
    private readonly http: HttpClient,
    private readonly endpoint: string = DEFAULT_ENDPOINT,
  ) {}

  async fetch(): Promise<Hotspot[]> {
    const res = await this.http.get(this.endpoint);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`${LABEL} HTTP ${res.status}`);
    }
    return parseDomesticTrending(res.text);
  }
}
