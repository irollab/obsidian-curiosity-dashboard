// src/data/hotspot-sources/rss-source.ts
import type { Hotspot } from '@/domain/discovery';
import type { HttpClient } from '@/ports/http-client';
import { parseRssItems, type HotspotSource } from './hotspot-source';

export class RssSource implements HotspotSource {
  constructor(
    readonly id: string,
    readonly label: string,
    private readonly feeds: string[],
    private readonly http: HttpClient,
  ) {}

  async fetch(): Promise<Hotspot[]> {
    if (this.feeds.length === 0) return [];
    const settled = await Promise.allSettled(this.feeds.map((url) => this.fetchFeed(url)));
    const ok = settled.filter(
      (r): r is PromiseFulfilledResult<Hotspot[]> => r.status === 'fulfilled',
    );
    if (ok.length === 0) {
      throw new Error(`${this.label}: 所有 RSS 源抓取失败`);
    }
    return ok.flatMap((r) => r.value);
  }

  private async fetchFeed(url: string): Promise<Hotspot[]> {
    const res = await this.http.get(url);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`${this.label} HTTP ${res.status}: ${url}`);
    }
    return parseRssItems(res.text, this.label);
  }
}
