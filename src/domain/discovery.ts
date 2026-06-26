export interface Hotspot {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  summary: string | null;
}

export type HotspotSourceStatus = 'ok' | 'failed' | 'stale';

export interface HotspotSourceResult {
  sourceId: string;
  label: string;
  status: HotspotSourceStatus;
  items: Hotspot[];
  fetchedAt: number;
  error: string | null;
}

export interface AudienceSignal {
  text: string;
  kind: '问题' | '高赞' | '灵感';
  source: string;
  weight: number;
}

export function dedupeHotspots(items: Hotspot[]): Hotspot[] {
  const seen = new Set<string>();
  const out: Hotspot[] = [];
  for (const item of items) {
    const key =
      item.url.trim().length > 0
        ? item.url.trim().toLowerCase()
        : item.title.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
