import { describe, expect, it } from 'vitest';
import { GithubTrendingSource, parseGithubTrending } from '@/data/hotspot-sources/github-trending-source';
import type { HttpClient } from '@/ports/http-client';

const SAMPLE = JSON.stringify([
  { author: 'acme', name: 'agent-kit', url: 'https://github.com/acme/agent-kit', description: 'AI agent toolkit', language: 'TypeScript' },
  { author: 'x', name: 'y', url: 'https://github.com/x/y', description: null },
]);

describe('parseGithubTrending', () => {
  it('解析仓库为 Hotspot（标题=author/name）', () => {
    const items = parseGithubTrending(SAMPLE);
    expect(items[0]).toMatchObject({
      title: 'acme/agent-kit', url: 'https://github.com/acme/agent-kit',
      source: 'GitHub Trending', summary: 'AI agent toolkit',
    });
    expect(items[1]?.summary).toBeNull();
  });

  it('坏 JSON 返回空数组', () => {
    expect(parseGithubTrending('nope')).toEqual([]);
  });

  it('解析官方 GitHub Search API 的 { items: [...] } 结构（full_name/html_url/stars）', () => {
    const official = JSON.stringify({
      items: [
        {
          full_name: 'acme/agent-kit',
          html_url: 'https://github.com/acme/agent-kit',
          description: 'AI agent toolkit',
          stargazers_count: 1234,
          pushed_at: '2026-06-20T08:00:00Z',
        },
      ],
    });
    const items = parseGithubTrending(official);
    expect(items[0]).toMatchObject({
      title: 'acme/agent-kit',
      url: 'https://github.com/acme/agent-kit',
      source: 'GitHub Trending',
      publishedAt: '2026-06-20',
    });
    expect(items[0]?.summary).toContain('AI agent toolkit');
    expect(items[0]?.summary).toContain('★1234');
  });
});

describe('GithubTrendingSource', () => {
  it('fetch 解析；非 2xx 抛错', async () => {
    const okHttp: HttpClient = { get: async () => ({ status: 200, text: SAMPLE }) };
    expect(await new GithubTrendingSource(okHttp).fetch()).toHaveLength(2);
    const badHttp: HttpClient = { get: async () => ({ status: 500, text: '' }) };
    await expect(new GithubTrendingSource(badHttp).fetch()).rejects.toThrow();
  });
});
