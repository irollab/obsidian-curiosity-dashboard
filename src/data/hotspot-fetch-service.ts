import { dedupeHotspots, type Hotspot, type HotspotSourceResult, type HotspotSourceStatus } from '@/domain/discovery';
import type { HotspotSource } from '@/data/hotspot-sources/hotspot-source';

export interface HotspotCacheEntry {
  items: Hotspot[];
  fetchedAt: number;
  status: HotspotSourceStatus;
}
export type HotspotCache = Record<string, HotspotCacheEntry>;

export interface HotspotFetchOptions {
  timeoutMs?: number;
  now?: () => number;
}

export class HotspotFetchService {
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(
    private readonly sources: HotspotSource[],
    options: HotspotFetchOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.now = options.now ?? (() => Date.now());
  }

  async fetchAll(previous: HotspotCache): Promise<HotspotSourceResult[]> {
    return Promise.all(this.sources.map((source) => this.fetchOne(source, previous)));
  }

  private async fetchOne(source: HotspotSource, previous: HotspotCache): Promise<HotspotSourceResult> {
    const fetchedAt = this.now();
    try {
      const items = dedupeHotspots(await this.withTimeout(source.fetch()));
      return { sourceId: source.id, label: source.label, status: 'ok', items, fetchedAt, error: null };
    } catch (error) {
      const cached = previous[source.id];
      return {
        sourceId: source.id,
        label: source.label,
        status: 'failed',
        items: cached?.items ?? [],
        fetchedAt,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  private withTimeout(promise: Promise<Hotspot[]>): Promise<Hotspot[]> {
    return new Promise<Hotspot[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`抓取超时（${this.timeoutMs}ms）`)), this.timeoutMs);
      promise.then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error) => { clearTimeout(timer); reject(error); },
      );
    });
  }
}

export function resultsToCache(results: HotspotSourceResult[]): HotspotCache {
  const cache: HotspotCache = {};
  for (const r of results) {
    cache[r.sourceId] = { items: r.items, fetchedAt: r.fetchedAt, status: r.status };
  }
  return cache;
}

export function cacheToResults(
  cache: HotspotCache,
  sources: ReadonlyArray<{ id: string; label: string }>,
): HotspotSourceResult[] {
  return sources.map((source) => {
    const entry = cache[source.id];
    return {
      sourceId: source.id,
      label: source.label,
      status: entry?.status ?? 'stale',
      items: entry?.items ?? [],
      fetchedAt: entry?.fetchedAt ?? 0,
      error: null,
    };
  });
}
