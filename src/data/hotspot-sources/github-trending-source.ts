import type { Hotspot } from '@/domain/discovery';
import type { HttpClient } from '@/ports/http-client';
import type { HotspotSource } from './hotspot-source';

// 第三方 trending 代理（gitterapp 等）已陆续失效（404）。改用 GitHub 官方 Search API：
// 取最近一年内、star 上涨的仓库按 star 倒序，等价于「热门新项目」。官方、稳定、无需鉴权。
const DEFAULT_ENDPOINT =
  'https://api.github.com/search/repositories?q=stars:%3E500+pushed:%3E2025-01-01&sort=stars&order=desc&per_page=20';
const LABEL = 'GitHub Trending';

// 兼容两种结构：① 官方 Search API 的 { items: [...] }；② 旧第三方代理的顶层数组 [...]。
export function parseGithubTrending(body: string): Hotspot[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  const items = extractItems(data);
  const out: Hotspot[] = [];
  for (const repo of items) {
    if (typeof repo !== 'object' || repo === null) continue;
    const record = repo as Record<string, unknown>;
    // 官方字段 full_name / html_url；旧代理字段 author+name / url。
    const fullName = typeof record.full_name === 'string' ? record.full_name : '';
    const author = typeof record.author === 'string' ? record.author : '';
    const name = typeof record.name === 'string' ? record.name : '';
    const url =
      typeof record.html_url === 'string' ? record.html_url : typeof record.url === 'string' ? record.url : '';
    const title = fullName || (author.length > 0 ? `${author}/${name}` : name);
    if (title.length === 0 || url.length === 0) continue;
    out.push({
      title,
      url,
      source: LABEL,
      publishedAt: toIsoDate(record.pushed_at),
      summary: buildSummary(record),
    });
  }
  return out;
}

function extractItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (typeof data === 'object' && data !== null && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: unknown[] }).items;
  }
  return [];
}

function buildSummary(record: Record<string, unknown>): string | null {
  const description = typeof record.description === 'string' ? record.description : '';
  const stars = typeof record.stargazers_count === 'number' ? record.stargazers_count : null;
  const parts: string[] = [];
  if (description.length > 0) parts.push(description);
  if (stars !== null) parts.push(`★${stars}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString().slice(0, 10);
}

export class GithubTrendingSource implements HotspotSource {
  readonly id = 'github-trending';
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
    return parseGithubTrending(res.text);
  }
}
