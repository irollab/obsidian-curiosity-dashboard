import type { Hotspot } from '@/domain/discovery';

export interface HotspotSource {
  id: string;
  label: string;
  fetch(): Promise<Hotspot[]>;
}

const ITEM = /<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi;

export function parseRssItems(xml: string, source: string): Hotspot[] {
  const blocks = xml.match(ITEM);
  if (blocks === null) return [];
  const out: Hotspot[] = [];
  for (const block of blocks) {
    const title = tag(block, 'title');
    if (title === null) continue;
    out.push({
      title,
      url: tag(block, 'link') ?? linkHref(block) ?? '',
      source,
      publishedAt: toIsoDate(tag(block, 'pubDate') ?? tag(block, 'updated') ?? tag(block, 'published')),
      summary: tag(block, 'description') ?? tag(block, 'summary'),
    });
  }
  return out;
}

function tag(block: string, name: string): string | null {
  const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  if (match === null) return null;
  const raw = (match[1] ?? '').trim();
  const text = stripCdata(raw).replace(/<[^>]+>/g, '').trim();
  return text.length === 0 ? null : decodeEntities(text);
}

// Atom <link href="..."/>
function linkHref(block: string): string | null {
  const match = /<link\b[^>]*href="([^"]+)"/i.exec(block);
  return match === null ? null : match[1] ?? null;
}

function stripCdata(value: string): string {
  const match = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(value.trim());
  return match === null ? value : match[1] ?? '';
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function toIsoDate(value: string | null): string | null {
  if (value === null) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}
