# Curiosity Dashboard 「发现」灵感发现 tab 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Git 策略（用户硬性要求，覆盖 skill 默认）**：未经用户明确许可，不得执行任何 git 操作（commit/branch/push）。下列任务中的「Commit」步骤为**可选检查点**——执行时若用户未开启提交，请跳过 git 命令，仅在工作区留存改动，由用户自行提交。

**Goal:** 在 `curiosity-dashboard` 插件新增「发现」tab：内置抓取外部热点 × 聚合 vault 内受众反馈 → 拼「生成选题卡」提示词复制进 Codex → Codex 写卡到 `10-选题池/待评估`，并支持「归档本次热点」。

**Architecture:** 沿用现有 Clean Architecture。网络是唯一新「脏」依赖，锁在新增 `ports/http-client.ts` + `adapters/obsidian-http-client.ts`（包 Obsidian `requestUrl`）与 `data/hotspot-sources/*` 内；各热点源实现统一 `HotspotSource` 接口（DIP/OCP）。纯逻辑（prompt builder、archive builder、各源 parse 函数、fetch 编排）为可测纯函数/可注入依赖。热点缓存落 `data.json`（`settings.hotspotCache`），经模型反应式渲染（沿用 idea-list 复选模式）。`writeClipboard`/`vault.create` 留 view 层，不进数据端口（沿用 ISP 修正）。

**Tech Stack:** TypeScript, Obsidian API (`requestUrl`), esbuild, vitest, 现有 FakeVaultGateway 测试桩。

**关键全局类型（后续任务一致引用，定义见 Task A1/A2/B1/B7）：**
- `Hotspot { title; url; source; publishedAt: string|null; summary: string|null }`
- `HotspotSourceStatus = 'ok' | 'failed' | 'stale'`
- `HotspotSourceResult { sourceId; label; status; items: Hotspot[]; fetchedAt: number; error: string|null }`
- `AudienceSignal { text; kind: '问题'|'高赞'|'灵感'; source: string; weight: number }`
- `HttpResponse { status: number; text: string }` / `HttpClient { get(url, options?): Promise<HttpResponse> }`
- `HotspotSource { id: string; label: string; fetch(): Promise<Hotspot[]> }`
- `HotspotCacheEntry { items: Hotspot[]; fetchedAt: number; status: HotspotSourceStatus }` / `HotspotCache = Record<string, HotspotCacheEntry>`

---

## 阶段 A — 地基：domain 类型 + 网络端口 + 纯逻辑 builder

### Task A1: discovery 领域类型与去重

**Files:**
- Create: `src/domain/discovery.ts`
- Test: `tests/domain/discovery.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/domain/discovery.test.ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/domain/discovery.test.ts`
Expected: FAIL（`dedupeHotspots` 未定义）

- [ ] **Step 3: 写最小实现**

```ts
// src/domain/discovery.ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/domain/discovery.test.ts`
Expected: PASS

- [ ] **Step 5: Commit（可选，遵守 git 策略）**

```bash
git add src/domain/discovery.ts tests/domain/discovery.test.ts
git commit -m "feat(discovery): add discovery domain types and hotspot dedupe"
```

---

### Task A2: HttpClient 端口 + Obsidian requestUrl 适配器

**Files:**
- Create: `src/ports/http-client.ts`
- Create: `src/adapters/obsidian-http-client.ts`
- Test: `tests/adapters/obsidian-http-client.test.ts`

说明：端口为接口无逻辑不单测。适配器把 Obsidian `requestUrl` 包成端口；为可测，适配器构造函数注入一个 `requestUrl` 兼容函数（生产由 `main.ts` 传入真实 `requestUrl`）。

- [ ] **Step 1: 写失败测试**

```ts
// tests/adapters/obsidian-http-client.test.ts
import { describe, expect, it } from 'vitest';
import { ObsidianHttpClient, type RequestUrlFn } from '@/adapters/obsidian-http-client';

describe('ObsidianHttpClient', () => {
  it('转发 url 并返回 status/text', async () => {
    const calls: string[] = [];
    const fn: RequestUrlFn = async (param) => {
      calls.push(typeof param === 'string' ? param : param.url);
      return { status: 200, text: 'hello' };
    };
    const client = new ObsidianHttpClient(fn);
    const res = await client.get('https://a');
    expect(res).toEqual({ status: 200, text: 'hello' });
    expect(calls).toEqual(['https://a']);
  });

  it('throw=false 让 4xx/5xx 也回传而非抛错', async () => {
    let received: unknown = null;
    const fn: RequestUrlFn = async (param) => {
      received = param;
      return { status: 404, text: 'nope' };
    };
    const res = await new ObsidianHttpClient(fn).get('https://a');
    expect(res.status).toBe(404);
    expect((received as { throw?: boolean }).throw).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/adapters/obsidian-http-client.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写最小实现**

```ts
// src/ports/http-client.ts
export interface HttpResponse {
  status: number;
  text: string;
}

export interface HttpRequestOptions {
  timeoutMs?: number;
}

export interface HttpClient {
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}
```

```ts
// src/adapters/obsidian-http-client.ts
import type { HttpClient, HttpRequestOptions, HttpResponse } from '@/ports/http-client';

export interface RequestUrlParam {
  url: string;
  method?: string;
  throw?: boolean;
}

export type RequestUrlFn = (
  param: RequestUrlParam,
) => Promise<{ status: number; text: string }>;

export class ObsidianHttpClient implements HttpClient {
  constructor(private readonly requestUrl: RequestUrlFn) {}

  async get(url: string, _options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const res = await this.requestUrl({ url, method: 'GET', throw: false });
    return { status: res.status, text: res.text };
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/adapters/obsidian-http-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit（可选）**

```bash
git add src/ports/http-client.ts src/adapters/obsidian-http-client.ts tests/adapters/obsidian-http-client.test.ts
git commit -m "feat(discovery): add HttpClient port and Obsidian requestUrl adapter"
```

---

### Task A3: 扩展 PromptContext 占位符（hotspots/audience_signals/existing_titles）

**Files:**
- Modify: `src/domain/workflow.ts:25-38`（`PromptContext` 接口）, `:50-70`（`tokenValues`）
- Test: `tests/domain/workflow.test.ts`（追加）

- [ ] **Step 1: 追加失败测试**

```ts
// 追加到 tests/domain/workflow.test.ts
import { fillPlaceholders, type PromptContext } from '@/domain/workflow';

function baseContext(over: Partial<PromptContext> = {}): PromptContext {
  return {
    focus: null, inboxDir: '', topicDir: '', scriptDraftDir: '', assetDir: '',
    reviewDir: '', topicTemplate: '', scriptTemplate: '', reviewTemplate: '',
    date: '', week: '', ideas: '', hotspots: '', audienceSignals: '', existingTitles: '',
    ...over,
  };
}

describe('fillPlaceholders 发现占位符', () => {
  it('填充 hotspots/audience_signals/existing_titles', () => {
    const body = '热点:\n{{hotspots}}\n受众:\n{{audience_signals}}\n已有:\n{{existing_titles}}';
    const out = fillPlaceholders(body, baseContext({
      hotspots: '1. A', audienceSignals: '- 怎么用', existingTitles: '- 旧选题',
    }));
    expect(out).toContain('1. A');
    expect(out).toContain('- 怎么用');
    expect(out).toContain('- 旧选题');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/domain/workflow.test.ts`
Expected: FAIL（`PromptContext` 缺三字段，类型错误 / 占位符未替换）

- [ ] **Step 3: 改实现**

在 `src/domain/workflow.ts` 的 `PromptContext` 接口 `ideas: string;` 之后追加：

```ts
  hotspots: string;
  audienceSignals: string;
  existingTitles: string;
```

在 `tokenValues` 返回对象 `ideas: context.ideas,` 之后追加：

```ts
    hotspots: context.hotspots,
    audience_signals: context.audienceSignals,
    existing_titles: context.existingTitles,
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/domain/workflow.test.ts`
Expected: PASS

注意：`prompt-builder-service.ts` 的 `buildPrompt` 构造 `PromptContext` 时现未带这三字段，会类型报错。在 `src/mutations/prompt-builder-service.ts` 的 context 对象 `ideas: formatIdeas(...)` 之后追加 `hotspots: '', audienceSignals: '', existingTitles: '',` 以保持既有调用合法。

- [ ] **Step 5: 跑全量 typecheck**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 6: Commit（可选）**

```bash
git add src/domain/workflow.ts src/mutations/prompt-builder-service.ts tests/domain/workflow.test.ts
git commit -m "feat(discovery): extend PromptContext with hotspot/audience placeholders"
```

---

### Task A4: discovery-prompt-builder（纯逻辑：拼提示词）

**Files:**
- Create: `src/mutations/discovery-prompt-builder.ts`
- Test: `tests/mutations/discovery-prompt-builder.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/mutations/discovery-prompt-builder.test.ts
import { describe, expect, it } from 'vitest';
import { buildDiscoveryPrompt } from '@/mutations/discovery-prompt-builder';
import type { WorkflowAction } from '@/domain/workflow';
import type { Hotspot, AudienceSignal } from '@/domain/discovery';
import { DEFAULT_SETTINGS } from '@/settings';

const action: WorkflowAction = {
  id: 'spark-topics', label: '从热点+受众生成选题卡', description: '', group: '选题',
  order: 3, needsFocus: false, output: '10-选题池/待评估',
  body: '把这些拼成选题卡，放到 {{inbox_dir}}，用 {{topic_template}}。\n热点:\n{{hotspots}}\n受众:\n{{audience_signals}}\n避免与已有重复:\n{{existing_titles}}',
  sourcePath: 'p/11.md',
};

const hotspots: Hotspot[] = [
  { title: 'Claude 4.8 发布', url: 'https://a', source: '官方', publishedAt: '2026-06-25', summary: null },
];
const signals: AudienceSignal[] = [
  { text: '怎么本地跑', kind: '问题', source: '评论档', weight: 3 },
];

describe('buildDiscoveryPrompt', () => {
  it('把热点/受众/去重标题格式化进提示词', () => {
    const out = buildDiscoveryPrompt({
      action, hotspots, signals, existingTitles: ['旧选题A'], settings: DEFAULT_SETTINGS,
    });
    expect(out.label).toBe('从热点+受众生成选题卡');
    expect(out.output).toBe('10-选题池/待评估');
    expect(out.text).toContain('10-选题池/待评估');
    expect(out.text).toContain('Claude 4.8 发布');
    expect(out.text).toContain('https://a');
    expect(out.text).toContain('怎么本地跑');
    expect(out.text).toContain('旧选题A');
  });

  it('空列表给出占位文案而非空白', () => {
    const out = buildDiscoveryPrompt({
      action, hotspots: [], signals: [], existingTitles: [], settings: DEFAULT_SETTINGS,
    });
    expect(out.text).toContain('（无）');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/mutations/discovery-prompt-builder.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写最小实现**

```ts
// src/mutations/discovery-prompt-builder.ts
import type { AudienceSignal, Hotspot } from '@/domain/discovery';
import { fillPlaceholders, type PromptContext, type WorkflowAction } from '@/domain/workflow';
import type { PromptBuildResult } from '@/mutations/prompt-builder-service';
import type { DashboardSettings } from '@/settings';

export interface DiscoveryPromptInput {
  action: WorkflowAction;
  hotspots: Hotspot[];
  signals: AudienceSignal[];
  existingTitles: string[];
  settings: DashboardSettings;
}

const EMPTY = '（无）';

export function buildDiscoveryPrompt(input: DiscoveryPromptInput): PromptBuildResult {
  const context: PromptContext = {
    focus: null,
    inboxDir: input.settings.topicInboxDir,
    topicDir: input.settings.topicDir,
    scriptDraftDir: input.settings.scriptDraftDir,
    assetDir: input.settings.assetDir,
    reviewDir: input.settings.reviewDir,
    topicTemplate: input.settings.topicTemplate,
    scriptTemplate: input.settings.scriptTemplate,
    reviewTemplate: input.settings.reviewTemplate,
    date: '',
    week: '',
    ideas: '',
    hotspots: formatHotspots(input.hotspots),
    audienceSignals: formatSignals(input.signals),
    existingTitles: formatTitles(input.existingTitles),
  };
  return {
    label: input.action.label,
    text: fillPlaceholders(input.action.body, context),
    output: input.action.output,
  };
}

function formatHotspots(items: Hotspot[]): string {
  if (items.length === 0) return EMPTY;
  return items
    .map((h, i) => {
      const date = h.publishedAt === null ? '' : `（${h.publishedAt}）`;
      const url = h.url.trim().length > 0 ? ` ${h.url}` : '';
      return `${i + 1}. [${h.source}] ${h.title}${date}${url}`;
    })
    .join('\n');
}

function formatSignals(items: AudienceSignal[]): string {
  if (items.length === 0) return EMPTY;
  return items.map((s) => `- (${s.kind}) ${s.text} — ${s.source}`).join('\n');
}

function formatTitles(titles: string[]): string {
  const cleaned = titles.map((t) => t.trim()).filter((t) => t.length > 0);
  if (cleaned.length === 0) return EMPTY;
  return cleaned.map((t) => `- ${t}`).join('\n');
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/mutations/discovery-prompt-builder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit（可选）**

```bash
git add src/mutations/discovery-prompt-builder.ts tests/mutations/discovery-prompt-builder.test.ts
git commit -m "feat(discovery): add discovery prompt builder"
```

---

### Task A5: hotspot-archive-builder（纯逻辑：归档 markdown + 同日序号）

**Files:**
- Create: `src/mutations/hotspot-archive-builder.ts`
- Test: `tests/mutations/hotspot-archive-builder.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/mutations/hotspot-archive-builder.test.ts
import { describe, expect, it } from 'vitest';
import { buildHotspotArchive, hotspotArchivePath } from '@/mutations/hotspot-archive-builder';
import type { HotspotSourceResult } from '@/domain/discovery';

const results: HotspotSourceResult[] = [
  {
    sourceId: 'hn', label: 'Hacker News', status: 'ok', fetchedAt: 0, error: null,
    items: [{ title: 'A', url: 'https://a', source: 'Hacker News', publishedAt: '2026-06-26', summary: null }],
  },
  {
    sourceId: 'weibo', label: '微博热搜', status: 'failed', fetchedAt: 0, error: '超时',
    items: [],
  },
];

describe('buildHotspotArchive', () => {
  it('生成带 frontmatter + 按源分组的 markdown', () => {
    const md = buildHotspotArchive({ date: '2026-06-26', results });
    expect(md).toMatch(/^---\n/);
    expect(md).toContain('date: 2026-06-26');
    expect(md).toContain('## Hacker News');
    expect(md).toContain('- [A](https://a)');
    expect(md).toContain('微博热搜');     // 失败源也留痕
    expect(md).toContain('超时');
  });
});

describe('hotspotArchivePath', () => {
  it('默认文件名 = 目录/日期-热点.md', () => {
    const p = hotspotArchivePath('30-竞品热点/热点观察', '2026-06-26', () => false);
    expect(p).toBe('30-竞品热点/热点观察/2026-06-26-热点.md');
  });

  it('同日已存在则追加序号', () => {
    const exists = (path: string): boolean =>
      path === '30-竞品热点/热点观察/2026-06-26-热点.md' ||
      path === '30-竞品热点/热点观察/2026-06-26-热点-2.md';
    const p = hotspotArchivePath('30-竞品热点/热点观察', '2026-06-26', exists);
    expect(p).toBe('30-竞品热点/热点观察/2026-06-26-热点-3.md');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/mutations/hotspot-archive-builder.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写最小实现**

```ts
// src/mutations/hotspot-archive-builder.ts
import type { Hotspot, HotspotSourceResult } from '@/domain/discovery';

export interface HotspotArchiveInput {
  date: string;
  results: HotspotSourceResult[];
}

export function buildHotspotArchive(input: HotspotArchiveInput): string {
  const total = input.results.reduce((sum, r) => sum + r.items.length, 0);
  const sourceLabels = input.results.map((r) => r.label).join('、');
  const front = [
    '---',
    `date: ${input.date}`,
    `sources: ${sourceLabels}`,
    `count: ${total}`,
    '---',
  ].join('\n');

  const blocks = input.results.map((r) => renderSource(r)).join('\n\n');
  return `${front}\n\n# ${input.date} 热点观察\n\n${blocks}\n`;
}

function renderSource(result: HotspotSourceResult): string {
  const header = `## ${result.label}`;
  if (result.status === 'failed') {
    return `${header}\n\n> ⚠️ 抓取失败：${result.error ?? '未知错误'}`;
  }
  if (result.items.length === 0) {
    return `${header}\n\n> （本次无条目）`;
  }
  return `${header}\n\n${result.items.map(renderItem).join('\n')}`;
}

function renderItem(item: Hotspot): string {
  const date = item.publishedAt === null ? '' : ` · ${item.publishedAt}`;
  const link = item.url.trim().length > 0 ? `[${item.title}](${item.url})` : item.title;
  return `- ${link}${date}`;
}

export function hotspotArchivePath(
  dir: string,
  date: string,
  exists: (path: string) => boolean,
): string {
  const base = dir.replace(/\\/g, '/').replace(/\/+$/, '');
  const first = `${base}/${date}-热点.md`;
  if (!exists(first)) return first;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}/${date}-热点-${n}.md`;
    if (!exists(candidate)) return candidate;
  }
  return `${base}/${date}-热点-${Date.now()}.md`;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/mutations/hotspot-archive-builder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit（可选）**

```bash
git add src/mutations/hotspot-archive-builder.ts tests/mutations/hotspot-archive-builder.test.ts
git commit -m "feat(discovery): add hotspot archive markdown builder"
```

---

## 阶段 B — 数据层：热点源适配器 + 抓取编排 + 受众信号仓库

### Task B1: HotspotSource 接口 + 共享 parse 辅助

**Files:**
- Create: `src/data/hotspot-sources/hotspot-source.ts`
- Test: `tests/data/hotspot-sources/hotspot-source.test.ts`

说明：本任务定义接口与一个通用「RSS/Atom XML → Hotspot[]」纯解析函数（被 RSS 源与官方发布源复用，DRY）。

- [ ] **Step 1: 写失败测试**

```ts
// tests/data/hotspot-sources/hotspot-source.test.ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/data/hotspot-sources/hotspot-source.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写最小实现**

```ts
// src/data/hotspot-sources/hotspot-source.ts
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/data/hotspot-sources/hotspot-source.test.ts`
Expected: PASS

- [ ] **Step 5: Commit（可选）**

```bash
git add src/data/hotspot-sources/hotspot-source.ts tests/data/hotspot-sources/hotspot-source.test.ts
git commit -m "feat(discovery): add HotspotSource interface and shared RSS parser"
```

---

### Task B2: Hacker News 源（Algolia JSON）

**Files:**
- Create: `src/data/hotspot-sources/hacker-news-source.ts`
- Test: `tests/data/hotspot-sources/hacker-news-source.test.ts`

说明：用 Algolia HN API `https://hn.algolia.com/api/v1/search?tags=front_page` —— 稳定 JSON、无需鉴权。解析函数与 `fetch()` 拆开，前者纯测，后者注入 FakeHttpClient。

- [ ] **Step 1: 写失败测试**

```ts
// tests/data/hotspot-sources/hacker-news-source.test.ts
import { describe, expect, it } from 'vitest';
import { HackerNewsSource, parseHackerNews } from '@/data/hotspot-sources/hacker-news-source';
import type { HttpClient } from '@/ports/http-client';

const JSON_SAMPLE = JSON.stringify({
  hits: [
    { title: 'Show HN: Cool Tool', url: 'https://t.co/cool', created_at: '2026-06-25T08:00:00Z', objectID: '1' },
    { title: 'No URL story', url: null, created_at: '2026-06-24T08:00:00Z', objectID: '2' },
  ],
});

describe('parseHackerNews', () => {
  it('解析 hits → Hotspot[]，无 url 用 HN item 链接兜底', () => {
    const items = parseHackerNews(JSON_SAMPLE);
    expect(items[0]).toMatchObject({ title: 'Show HN: Cool Tool', url: 'https://t.co/cool', source: 'Hacker News', publishedAt: '2026-06-25' });
    expect(items[1]?.url).toBe('https://news.ycombinator.com/item?id=2');
  });

  it('坏 JSON 返回空数组', () => {
    expect(parseHackerNews('{bad')).toEqual([]);
  });
});

describe('HackerNewsSource', () => {
  it('fetch 调 HttpClient 并解析', async () => {
    const http: HttpClient = { get: async () => ({ status: 200, text: JSON_SAMPLE }) };
    const items = await new HackerNewsSource(http).fetch();
    expect(items).toHaveLength(2);
  });

  it('非 200 抛错（交编排层隔离）', async () => {
    const http: HttpClient = { get: async () => ({ status: 503, text: '' }) };
    await expect(new HackerNewsSource(http).fetch()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/data/hotspot-sources/hacker-news-source.test.ts`
Expected: FAIL

- [ ] **Step 3: 写最小实现**

```ts
// src/data/hotspot-sources/hacker-news-source.ts
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/data/hotspot-sources/hacker-news-source.test.ts`
Expected: PASS

- [ ] **Step 5: Commit（可选）**

```bash
git add src/data/hotspot-sources/hacker-news-source.ts tests/data/hotspot-sources/hacker-news-source.test.ts
git commit -m "feat(discovery): add Hacker News hotspot source"
```

---

### Task B3: RSS 源（用户自配 + 官方发布源复用）

**Files:**
- Create: `src/data/hotspot-sources/rss-source.ts`
- Test: `tests/data/hotspot-sources/rss-source.test.ts`

说明：`RssSource` 接收一组 RSS URL（用户自配 → "订阅型 RSS"；预置 Anthropic/OpenAI changelog 的 Atom/RSS → "官方发布源"）。逐 feed 抓取，失败的 feed 跳过其余继续，全部失败才抛错。

- [ ] **Step 1: 写失败测试**

```ts
// tests/data/hotspot-sources/rss-source.test.ts
import { describe, expect, it } from 'vitest';
import { RssSource } from '@/data/hotspot-sources/rss-source';
import type { HttpClient } from '@/ports/http-client';

const FEED_A = `<rss><channel><item><title>A1</title><link>https://a/1</link></item></channel></rss>`;
const FEED_B = `<rss><channel><item><title>B1</title><link>https://b/1</link></item></channel></rss>`;

function http(map: Record<string, { status: number; text: string }>): HttpClient {
  return { get: async (url) => map[url] ?? { status: 404, text: '' } };
}

describe('RssSource', () => {
  it('聚合多个 feed 的条目', async () => {
    const src = new RssSource('rss', '订阅 RSS', ['https://a/feed', 'https://b/feed'],
      http({ 'https://a/feed': { status: 200, text: FEED_A }, 'https://b/feed': { status: 200, text: FEED_B } }));
    const items = await src.fetch();
    expect(items.map((i) => i.title).sort()).toEqual(['A1', 'B1']);
  });

  it('单 feed 失败不影响其他 feed', async () => {
    const src = new RssSource('rss', '订阅 RSS', ['https://a/feed', 'https://bad/feed'],
      http({ 'https://a/feed': { status: 200, text: FEED_A } }));
    const items = await src.fetch();
    expect(items.map((i) => i.title)).toEqual(['A1']);
  });

  it('全部 feed 失败则抛错', async () => {
    const src = new RssSource('rss', '订阅 RSS', ['https://bad/feed'], http({}));
    await expect(src.fetch()).rejects.toThrow();
  });

  it('无 feed 配置返回空数组', async () => {
    const src = new RssSource('rss', '订阅 RSS', [], http({}));
    expect(await src.fetch()).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/data/hotspot-sources/rss-source.test.ts`
Expected: FAIL

- [ ] **Step 3: 写最小实现**

```ts
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/data/hotspot-sources/rss-source.test.ts`
Expected: PASS

- [ ] **Step 5: Commit（可选）**

```bash
git add src/data/hotspot-sources/rss-source.ts tests/data/hotspot-sources/rss-source.test.ts
git commit -m "feat(discovery): add RSS hotspot source (user feeds + official releases)"
```

---

### Task B4: GitHub Trending 源（JSON 代理）

**Files:**
- Create: `src/data/hotspot-sources/github-trending-source.ts`
- Test: `tests/data/hotspot-sources/github-trending-source.test.ts`

说明：GitHub 无官方 trending API，用社区 JSON 代理（端点可在构造时配置，默认 `https://api.gitterapp.com/repositories?language=&since=daily`，返回数组）。解析函数纯测。

- [ ] **Step 1: 写失败测试**

```ts
// tests/data/hotspot-sources/github-trending-source.test.ts
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
});

describe('GithubTrendingSource', () => {
  it('fetch 解析；非 2xx 抛错', async () => {
    const okHttp: HttpClient = { get: async () => ({ status: 200, text: SAMPLE }) };
    expect(await new GithubTrendingSource(okHttp).fetch()).toHaveLength(2);
    const badHttp: HttpClient = { get: async () => ({ status: 500, text: '' }) };
    await expect(new GithubTrendingSource(badHttp).fetch()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/data/hotspot-sources/github-trending-source.test.ts`
Expected: FAIL

- [ ] **Step 3: 写最小实现**

```ts
// src/data/hotspot-sources/github-trending-source.ts
import type { Hotspot } from '@/domain/discovery';
import type { HttpClient } from '@/ports/http-client';
import type { HotspotSource } from './hotspot-source';

const DEFAULT_ENDPOINT = 'https://api.gitterapp.com/repositories?since=daily';
const LABEL = 'GitHub Trending';

export function parseGithubTrending(body: string): Hotspot[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: Hotspot[] = [];
  for (const repo of data) {
    if (typeof repo !== 'object' || repo === null) continue;
    const record = repo as Record<string, unknown>;
    const author = typeof record.author === 'string' ? record.author : '';
    const name = typeof record.name === 'string' ? record.name : '';
    const url = typeof record.url === 'string' ? record.url : '';
    if (name.length === 0 || url.length === 0) continue;
    out.push({
      title: author.length > 0 ? `${author}/${name}` : name,
      url,
      source: LABEL,
      publishedAt: null,
      summary: typeof record.description === 'string' && record.description.length > 0 ? record.description : null,
    });
  }
  return out;
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/data/hotspot-sources/github-trending-source.test.ts`
Expected: PASS

- [ ] **Step 5: Commit（可选）**

```bash
git add src/data/hotspot-sources/github-trending-source.ts tests/data/hotspot-sources/github-trending-source.test.ts
git commit -m "feat(discovery): add GitHub Trending hotspot source"
```

---

### Task B5: 国内平台热榜源（P1·聚合 API）

**Files:**
- Create: `src/data/hotspot-sources/domestic-trending-source.ts`
- Test: `tests/data/hotspot-sources/domestic-trending-source.test.ts`

说明：**P1 可选源**——依赖第三方聚合 API（默认 vvhan：`https://api.vvhan.com/api/hotlist/all` 形态 `{ data: [{ name, data: [{ title, url, hot }] }] }`），稳定性/合规弱于其他源；默认**不启用**（见 Task C1 `enabledHotspotSources` 默认值不含它）。解析函数纯测。

- [ ] **Step 1: 写失败测试**

```ts
// tests/data/hotspot-sources/domestic-trending-source.test.ts
import { describe, expect, it } from 'vitest';
import { DomesticTrendingSource, parseDomesticTrending } from '@/data/hotspot-sources/domestic-trending-source';
import type { HttpClient } from '@/ports/http-client';

const SAMPLE = JSON.stringify({
  data: [
    { name: '微博', data: [{ title: '某热搜', url: 'https://weibo/1', hot: '120万' }] },
    { name: '知乎', data: [{ title: '某问题', url: 'https://zhihu/2' }] },
  ],
});

describe('parseDomesticTrending', () => {
  it('展平各平台条目，source 标平台名', () => {
    const items = parseDomesticTrending(SAMPLE);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: '某热搜', url: 'https://weibo/1', source: '微博热榜' });
  });

  it('坏 JSON 返回空数组', () => {
    expect(parseDomesticTrending('x')).toEqual([]);
  });
});

describe('DomesticTrendingSource', () => {
  it('fetch 解析；非 2xx 抛错', async () => {
    const ok: HttpClient = { get: async () => ({ status: 200, text: SAMPLE }) };
    expect(await new DomesticTrendingSource(ok).fetch()).toHaveLength(2);
    const bad: HttpClient = { get: async () => ({ status: 502, text: '' }) };
    await expect(new DomesticTrendingSource(bad).fetch()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/data/hotspot-sources/domestic-trending-source.test.ts`
Expected: FAIL

- [ ] **Step 3: 写最小实现**

```ts
// src/data/hotspot-sources/domestic-trending-source.ts
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/data/hotspot-sources/domestic-trending-source.test.ts`
Expected: PASS

- [ ] **Step 5: Commit（可选）**

```bash
git add src/data/hotspot-sources/domestic-trending-source.ts tests/data/hotspot-sources/domestic-trending-source.test.ts
git commit -m "feat(discovery): add domestic trending hotspot source (P1, opt-in)"
```

---

### Task B6: HotspotFetchService（编排：allSettled + 超时 + 降级缓存）

**Files:**
- Create: `src/data/hotspot-fetch-service.ts`
- Test: `tests/data/hotspot-fetch-service.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/data/hotspot-fetch-service.test.ts
import { describe, expect, it } from 'vitest';
import { HotspotFetchService, type HotspotCache } from '@/data/hotspot-fetch-service';
import type { Hotspot } from '@/domain/discovery';
import type { HotspotSource } from '@/data/hotspot-sources/hotspot-source';

function source(id: string, label: string, impl: () => Promise<Hotspot[]>): HotspotSource {
  return { id, label, fetch: impl };
}
const spot = (title: string): Hotspot => ({ title, url: `https://${title}`, source: 'x', publishedAt: null, summary: null });

describe('HotspotFetchService', () => {
  it('成功源 status=ok，并发抓取', async () => {
    const svc = new HotspotFetchService(
      [source('a', 'A', async () => [spot('a1')]), source('b', 'B', async () => [spot('b1')])],
      { now: () => 100 },
    );
    const results = await svc.fetchAll({});
    expect(results.map((r) => r.status)).toEqual(['ok', 'ok']);
    expect(results[0]?.fetchedAt).toBe(100);
  });

  it('单源失败 → status=failed，回落缓存为 stale 条目', async () => {
    const prev: HotspotCache = { b: { items: [spot('cachedB')], fetchedAt: 1, status: 'ok' } };
    const svc = new HotspotFetchService(
      [source('a', 'A', async () => [spot('a1')]), source('b', 'B', async () => { throw new Error('boom'); })],
      { now: () => 200 },
    );
    const results = await svc.fetchAll(prev);
    const b = results.find((r) => r.sourceId === 'b');
    expect(b?.status).toBe('failed');
    expect(b?.error).toContain('boom');
    expect(b?.items.map((i) => i.title)).toEqual(['cachedB']); // 降级到上次缓存
  });

  it('单源去重（同 url）', async () => {
    const svc = new HotspotFetchService(
      [source('a', 'A', async () => [spot('dup'), spot('dup')])], { now: () => 1 },
    );
    const results = await svc.fetchAll({});
    expect(results[0]?.items).toHaveLength(1);
  });

  it('超时按失败处理', async () => {
    const svc = new HotspotFetchService(
      [source('slow', 'Slow', () => new Promise((resolve) => setTimeout(() => resolve([]), 50)))],
      { now: () => 1, timeoutMs: 5 },
    );
    const results = await svc.fetchAll({});
    expect(results[0]?.status).toBe('failed');
    expect(results[0]?.error).toContain('超时');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/data/hotspot-fetch-service.test.ts`
Expected: FAIL

- [ ] **Step 3: 写最小实现**

```ts
// src/data/hotspot-fetch-service.ts
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/data/hotspot-fetch-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit（可选）**

```bash
git add src/data/hotspot-fetch-service.ts tests/data/hotspot-fetch-service.test.ts
git commit -m "feat(discovery): add hotspot fetch orchestration with timeout + cache fallback"
```

---

### Task B7: AudienceSignalRepository（读 vault 三类受众信号）

**Files:**
- Create: `src/data/audience-signal-repository.ts`
- Test: `tests/data/audience-signal-repository.test.ts`

说明：复用现有 `parseIdeaInbox`。读三类：① `灵感收集箱.md`（kind=灵感）+ `待评估/*.md` 选题卡 frontmatter `title`（kind=灵感）；② `reviewDir/*.md` frontmatter `audience_questions: string[]`（kind=问题）；③ `commentDocPath` 列表项（kind=问题）。

- [ ] **Step 1: 写失败测试**

```ts
// tests/data/audience-signal-repository.test.ts
import { describe, expect, it } from 'vitest';
import { AudienceSignalRepository } from '@/data/audience-signal-repository';
import { DEFAULT_SETTINGS } from '@/settings';
import { FakeVaultGateway } from '../support/fake-vault-gateway';

function settings() {
  return { ...DEFAULT_SETTINGS, topicInboxDir: '10-选题池/待评估', reviewDir: '60-发布复盘', commentDocPath: '20-素材库/受众问题.md' };
}

describe('AudienceSignalRepository', () => {
  it('读灵感收集箱 + 待评估卡 + 复盘高问点 + 评论档', async () => {
    const g = new FakeVaultGateway();
    g.files.set('10-选题池/待评估/灵感收集箱.md', '# 箱\n- 2026-06-01 10:00 想做个 Codex 教程\n- 另一个点子');
    g.files.set('10-选题池/待评估/18-某选题.md', '正文');
    g.metadata.set('10-选题池/待评估/18-某选题.md', { type: '选题', title: '某选题标题' });
    g.files.set('60-发布复盘/第1期-复盘.md', '正文');
    g.metadata.set('60-发布复盘/第1期-复盘.md', { type: '复盘', audience_questions: ['评论里都在问 A', '还有人问 B'] });
    g.files.set('20-素材库/受众问题.md', '# 受众问题\n- 私信问 C\n- 私信问 D');

    const signals = await new AudienceSignalRepository(g, settings()).collect();
    const texts = signals.map((s) => s.text);
    expect(texts).toContain('想做个 Codex 教程');
    expect(texts).toContain('某选题标题');
    expect(texts).toContain('评论里都在问 A');
    expect(texts).toContain('私信问 C');
    expect(signals.find((s) => s.text === '评论里都在问 A')?.kind).toBe('问题');
    expect(signals.find((s) => s.text === '某选题标题')?.kind).toBe('灵感');
  });

  it('缺失文件/无 audience_questions 字段安全跳过', async () => {
    const g = new FakeVaultGateway();
    g.files.set('60-发布复盘/旧复盘.md', '正文');
    g.metadata.set('60-发布复盘/旧复盘.md', { type: '复盘' });
    const signals = await new AudienceSignalRepository(g, settings()).collect();
    expect(signals).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/data/audience-signal-repository.test.ts`
Expected: FAIL

- [ ] **Step 3: 写最小实现**

```ts
// src/data/audience-signal-repository.ts
import type { AudienceSignal } from '@/domain/discovery';
import type { Frontmatter, VaultGateway } from '@/ports/vault-gateway';
import type { DashboardSettings } from '@/settings';
import { ideaInboxPath, parseIdeaInbox } from './idea-inbox';

const LIST_ITEM = /^-\s+(?:\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?\s+)?(.+?)\s*$/;

export class AudienceSignalRepository {
  constructor(
    private readonly vault: VaultGateway,
    private readonly settings: DashboardSettings,
  ) {}

  async collect(): Promise<AudienceSignal[]> {
    const signals: AudienceSignal[] = [];
    signals.push(...(await this.fromIdeaInbox()));
    signals.push(...this.fromTopicCards());
    signals.push(...(await this.fromReviews()));
    signals.push(...(await this.fromCommentDoc()));
    return signals;
  }

  private async fromIdeaInbox(): Promise<AudienceSignal[]> {
    const path = ideaInboxPath(this.settings.topicInboxDir);
    if (!this.vault.exists(path)) return [];
    const ideas = parseIdeaInbox(await this.safeRead(path));
    return ideas.map((idea) => ({ text: idea.text, kind: '灵感', source: '灵感收集箱', weight: 1 }));
  }

  private fromTopicCards(): AudienceSignal[] {
    const dir = normalize(this.settings.topicInboxDir);
    const out: AudienceSignal[] = [];
    for (const path of this.vault.listMarkdownPaths().map(normalize)) {
      if (!isInside(path, dir) || path.endsWith('/灵感收集箱.md')) continue;
      const fm = this.safeFrontmatter(path);
      const title = typeof fm?.title === 'string' ? fm.title.trim() : '';
      if (fm?.type !== '选题' || title.length === 0) continue;
      out.push({ text: title, kind: '灵感', source: '待评估选题', weight: 1 });
    }
    return out;
  }

  private async fromReviews(): Promise<AudienceSignal[]> {
    const dir = normalize(this.settings.reviewDir);
    const out: AudienceSignal[] = [];
    for (const path of this.vault.listMarkdownPaths().map(normalize)) {
      if (!isInside(path, dir)) continue;
      const fm = this.safeFrontmatter(path);
      const questions = fm?.audience_questions;
      if (!Array.isArray(questions)) continue;
      for (const q of questions) {
        if (typeof q !== 'string' || q.trim().length === 0) continue;
        out.push({ text: q.trim(), kind: '问题', source: '复盘高问点', weight: 1 });
      }
    }
    return out;
  }

  private async fromCommentDoc(): Promise<AudienceSignal[]> {
    const path = normalize(this.settings.commentDocPath);
    if (path.length === 0 || !this.vault.exists(path)) return [];
    const out: AudienceSignal[] = [];
    for (const line of (await this.safeRead(path)).split(/\r?\n/)) {
      const match = LIST_ITEM.exec(line);
      const text = (match?.[1] ?? '').trim();
      if (text.length === 0) continue;
      out.push({ text, kind: '问题', source: '评论收集档', weight: 1 });
    }
    return out;
  }

  private async safeRead(path: string): Promise<string> {
    try {
      return await this.vault.read(path);
    } catch {
      return '';
    }
  }

  private safeFrontmatter(path: string): Frontmatter | null {
    try {
      return this.vault.getFrontmatter(path);
    } catch {
      return null;
    }
  }
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function isInside(path: string, dir: string): boolean {
  return dir.length === 0 || path.startsWith(`${dir}/`);
}
```

注：测试用到 `settings()` 含 `commentDocPath`，该字段在 Task C1 加入 `DashboardSettings`。**本任务先于 C1 执行时**，`DEFAULT_SETTINGS` 还没有 `commentDocPath`，TS 会报错。因此执行顺序上**先做 Task C1 再做本任务**，或在本任务内同时落地 C1 的设置字段。推荐：按计划顺序到此处时先跳到 C1 完成设置扩展，再回来。为避免顺序耦合，下面 Task C1 标注为「应在 B7 之前完成」。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/data/audience-signal-repository.test.ts`
Expected: PASS

- [ ] **Step 5: Commit（可选）**

```bash
git add src/data/audience-signal-repository.ts tests/data/audience-signal-repository.test.ts
git commit -m "feat(discovery): add audience signal repository"
```

---

## 阶段 C — 设置 + 种子模板 + 模型集成

> **执行顺序提醒**：Task C1 应在 Task B7 之前完成（B7 依赖 `commentDocPath` 设置字段）。

### Task C1: 扩展 DashboardSettings（发现相关字段 + discover tab）

**Files:**
- Modify: `src/settings.ts`（接口、DEFAULT_SETTINGS、DEFAULT_TABS、parseSettings、defaultTab 联合类型）
- Test: `tests/settings.test.ts`（追加）

- [ ] **Step 1: 追加失败测试**

```ts
// 追加到 tests/settings.test.ts
import { parseSettings, DEFAULT_SETTINGS } from '@/settings';

describe('发现 tab 设置', () => {
  it('默认值：rssSources=[]、commentDocPath、ttl=6、enabledHotspotSources 不含国内热榜、hotspotCache={}', () => {
    expect(DEFAULT_SETTINGS.rssSources).toEqual([]);
    expect(DEFAULT_SETTINGS.commentDocPath).toBe('20-素材库/受众问题.md');
    expect(DEFAULT_SETTINGS.hotspotCacheTtlHours).toBe(6);
    expect(DEFAULT_SETTINGS.hotspotArchiveDir).toBe('30-竞品热点/热点观察');
    expect(DEFAULT_SETTINGS.enabledHotspotSources).toEqual(['hacker-news', 'github-trending', 'rss', 'official-rss']);
    expect(DEFAULT_SETTINGS.hotspotCache).toEqual({});
  });

  it('discover 是合法 defaultTab', () => {
    expect(parseSettings({ defaultTab: 'discover' }).defaultTab).toBe('discover');
  });

  it('坏 rssSources/ttl 被纠正', () => {
    const s = parseSettings({ rssSources: ['https://a', 123, ''], hotspotCacheTtlHours: -3 });
    expect(s.rssSources).toEqual(['https://a']);
    expect(s.hotspotCacheTtlHours).toBe(6);
  });

  it('hotspotCache 非法结构归零为空对象', () => {
    expect(parseSettings({ hotspotCache: 'bad' }).hotspotCache).toEqual({});
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/settings.test.ts`
Expected: FAIL

- [ ] **Step 3: 改实现**

在 `src/settings.ts` 顶部 import 后加类型 import：

```ts
import type { HotspotCache } from '@/data/hotspot-fetch-service';
```

`DashboardSettings` 接口中 `defaultTab` 改为：

```ts
  defaultTab: 'overview' | 'tasks' | 'workflow' | 'discover' | 'data';
```

接口 `focusHistory: FocusHistoryEntry[];` 之后追加：

```ts
  rssSources: string[];
  commentDocPath: string;
  hotspotArchiveDir: string;
  hotspotCacheTtlHours: number;
  enabledHotspotSources: string[];
  hotspotCache: HotspotCache;
```

`DEFAULT_SETTINGS` 中 `focusHistory: [],` 之后追加：

```ts
  rssSources: [],
  commentDocPath: '20-素材库/受众问题.md',
  hotspotArchiveDir: '30-竞品热点/热点观察',
  hotspotCacheTtlHours: 6,
  enabledHotspotSources: ['hacker-news', 'github-trending', 'rss', 'official-rss'],
  hotspotCache: {},
```

`DEFAULT_TABS` 改为：

```ts
const DEFAULT_TABS: ReadonlySet<string> = new Set(['overview', 'tasks', 'workflow', 'discover', 'data']);
```

`parseSettings` 返回对象 `focusHistory: parseFocusHistory(values.focusHistory),` 之后追加：

```ts
    rssSources: parseStringArray(values.rssSources),
    commentDocPath: nonEmptyStringOr(values.commentDocPath, DEFAULT_SETTINGS.commentDocPath),
    hotspotArchiveDir: nonEmptyStringOr(values.hotspotArchiveDir, DEFAULT_SETTINGS.hotspotArchiveDir),
    hotspotCacheTtlHours: parsePositiveInt(values.hotspotCacheTtlHours, DEFAULT_SETTINGS.hotspotCacheTtlHours),
    enabledHotspotSources:
      parseStringArray(values.enabledHotspotSources).length > 0
        ? parseStringArray(values.enabledHotspotSources)
        : [...DEFAULT_SETTINGS.enabledHotspotSources],
    hotspotCache: parseHotspotCache(values.hotspotCache),
```

文件末尾追加辅助函数：

```ts
function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim());
}

function parsePositiveInt(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : fallback;
}

function parseHotspotCache(raw: unknown): HotspotCache {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const cache: HotspotCache = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null) continue;
    const entry = value as Record<string, unknown>;
    if (!Array.isArray(entry.items)) continue;
    const status = entry.status;
    cache[key] = {
      items: entry.items as HotspotCache[string]['items'],
      fetchedAt: typeof entry.fetchedAt === 'number' ? entry.fetchedAt : 0,
      status: status === 'ok' || status === 'failed' || status === 'stale' ? status : 'stale',
    };
  }
  return cache;
}
```

`HotspotCache` 的 `import type` 引入了 `src/data/hotspot-fetch-service.ts` → `src/domain/discovery.ts`，无循环依赖（settings 不被 discovery 反向引用）。

- [ ] **Step 4: 运行确认通过 + typecheck**

Run: `npx vitest run tests/settings.test.ts && npm run typecheck`
Expected: 测试 PASS；typecheck 报 `dashboard-renderer.ts`/`settings.ts` 等处 `DashboardTab` 联合类型尚未含 discover 的相关错误（将在阶段 D 修复）。若仅本文件错误为 0 即可继续。

- [ ] **Step 5: Commit（可选）**

```bash
git add src/settings.ts tests/settings.test.ts
git commit -m "feat(discovery): add discovery settings fields and discover tab"
```

---

### Task C2: 种子模板「11-从热点+受众生成选题卡」

**Files:**
- Modify: `src/mutations/prompt-seed-service.ts`（`TEMPLATES` 数组追加一项）
- Test: `tests/mutations/prompt-seed-service.test.ts`（追加）

- [ ] **Step 1: 追加失败测试**

```ts
// 追加到 tests/mutations/prompt-seed-service.test.ts
it('包含发现模板 spark-topics（含三类占位符）', async () => {
  const gateway = new FakeVaultGateway();
  await new PromptSeedService(gateway).seed(DIR);
  const spark = gateway.files.get(`${DIR}/11-从热点+受众生成选题卡.md`);
  expect(spark).toBeDefined();
  expect(spark).toContain('id: spark-topics');
  expect(spark).toContain('{{hotspots}}');
  expect(spark).toContain('{{audience_signals}}');
  expect(spark).toContain('{{existing_titles}}');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/mutations/prompt-seed-service.test.ts`
Expected: FAIL

- [ ] **Step 3: 改实现**

在 `src/mutations/prompt-seed-service.ts` 的 `TEMPLATES` 数组末尾（`10-周复盘` 之后）追加：

```ts
  {
    filename: '11-从热点+受众生成选题卡.md',
    frontmatter: { id: 'spark-topics', label: '🔥 从热点+受众生成选题卡', stage: '选题', order: 3, needs_focus: false, output: '10-选题池/待评估', description: '热点×受众反馈拼成选题卡' },
    body: '请把下面的热点和受众反馈，整理成 Obsidian 选题卡，放到 {{inbox_dir}}。\n每个选题用 {{topic_template}} 的结构；只做选题判断，不写完整脚本。\n要求：优先选「热点时机」与「受众真实问过的问题」有交集的角度；避免与「已有选题」重复。\n\n热点：\n{{hotspots}}\n\n受众反馈：\n{{audience_signals}}\n\n已有选题（不要重复）：\n{{existing_titles}}',
  },
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/mutations/prompt-seed-service.test.ts`
Expected: PASS（含原「写入≥10」改为≥11——若原断言写死 10，更新为 `toBeGreaterThanOrEqual(11)`）

- [ ] **Step 5: Commit（可选）**

```bash
git add src/mutations/prompt-seed-service.ts tests/mutations/prompt-seed-service.test.ts
git commit -m "feat(discovery): seed spark-topics prompt template"
```

---

### Task C3: 模型集成（audienceSignals + hotspots 进 DashboardModel）

**Files:**
- Modify: `src/domain/models.ts`（`DashboardModel` 追加两字段）
- Modify: `src/data/dashboard-data-service.ts`（loadOnce 填充两字段）
- Test: `tests/data/dashboard-data-service.test.ts`（追加）

- [ ] **Step 1: 追加失败测试**

```ts
// 追加到 tests/data/dashboard-data-service.test.ts（沿用该文件已有的 gateway 构造与 load 调用方式）
it('模型带 audienceSignals 与 hotspots（来自缓存）', async () => {
  const gateway = new FakeVaultGateway();
  gateway.files.set('10-选题池/待评估/灵感收集箱.md', '- 点子一');
  const settings = {
    ...DEFAULT_SETTINGS,
    hotspotCache: { 'hacker-news': { items: [{ title: 'HN A', url: 'https://a', source: 'Hacker News', publishedAt: null, summary: null }], fetchedAt: 1, status: 'ok' as const } },
  };
  const model = await new DashboardDataService(gateway, settings).load(false);
  expect(model.audienceSignals.map((s) => s.text)).toContain('点子一');
  const hn = model.hotspots.find((r) => r.sourceId === 'hacker-news');
  expect(hn?.items[0]?.title).toBe('HN A');
});
```

（若 `dashboard-data-service.test.ts` 顶部未 import `DEFAULT_SETTINGS`，补 `import { DEFAULT_SETTINGS } from '@/settings';`）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/data/dashboard-data-service.test.ts`
Expected: FAIL

- [ ] **Step 3: 改实现**

`src/domain/models.ts`：顶部加 import：

```ts
import type { AudienceSignal, HotspotSourceResult } from './discovery';
```

`DashboardModel` 接口 `ideas: IdeaEntry[];` 之后追加：

```ts
  audienceSignals: AudienceSignal[];
  hotspots: HotspotSourceResult[];
```

`src/data/dashboard-data-service.ts`：顶部加 import：

```ts
import { AudienceSignalRepository } from './audience-signal-repository';
import { cacheToResults } from './hotspot-fetch-service';
```

在 `loadOnce` 内 `const ideas = ...` 之后追加：

```ts
    const audienceSignals = await new AudienceSignalRepository(vault, settings).collect();
    const hotspots = cacheToResults(
      settings.hotspotCache,
      Object.entries(settings.hotspotCache).map(([id]) => ({ id, label: hotspotLabel(id) })),
    );
```

`return { ... }` 对象 `ideas,` 之后追加：

```ts
      audienceSignals,
      hotspots,
```

文件末尾追加标签映射（缓存里不存 label，用 id→中文名映射；与各 source 的 label 对齐）：

```ts
function hotspotLabel(id: string): string {
  const labels: Record<string, string> = {
    'hacker-news': 'Hacker News',
    'github-trending': 'GitHub Trending',
    rss: '订阅 RSS',
    'official-rss': '官方发布',
    'domestic-trending': '国内热榜',
  };
  return labels[id] ?? id;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/data/dashboard-data-service.test.ts`
Expected: PASS

注：`tests/domain/models.test.ts` 等若有「构造完整 DashboardModel」的工厂，需补这两个字段（`audienceSignals: [], hotspots: []`）。运行 `npx vitest run tests/domain/models.test.ts` 修正编译错误。

- [ ] **Step 5: Commit（可选）**

```bash
git add src/domain/models.ts src/data/dashboard-data-service.ts tests/data/dashboard-data-service.test.ts
git commit -m "feat(discovery): surface audience signals and cached hotspots in model"
```

---

## 阶段 D — UI 接线：discover tab + deck + 处理器 + i18n + 设置面板

### Task D1: i18n 文案键

**Files:**
- Modify: `src/i18n/translations.ts`（zh + en 两套补键）
- Test: `tests/i18n/translations.test.ts`（既有「zh/en 键集一致」测试会强制对齐）

- [ ] **Step 1: 先加键，跑既有一致性测试**

在 `src/i18n/translations.ts` 的 zh 与 en 对象分别补齐以下键（值见下；en 用对应英文）：

zh：
```ts
  'tab.discover': '发现',
  'discover.title': '灵感发现',
  'discover.refresh': '刷新热点',
  'discover.refreshing': '抓取中…',
  'discover.archive': '归档本次热点',
  'discover.archived': '已归档到 {path}',
  'discover.archiveEmpty': '没有可归档的热点',
  'discover.hotspotsHeading': '热点',
  'discover.signalsHeading': '受众反馈',
  'discover.empty': '还没有热点，点「刷新热点」开始',
  'discover.signalsEmpty': '暂无受众信号（去复盘补 audience_questions，或填评论收集档）',
  'discover.sourceFailed': '⚠️ {label} 抓取失败，显示上次缓存',
  'discover.copyButton': '生成选题提示词',
  'discover.copied': '已复制「{label}」，去 Codex 粘贴执行，输出到 {output}',
  'discover.selectHint': '勾选热点与受众信号后生成提示词',
  'discover.noTemplate': '缺少发现模板，请先到「工作流」tab 生成默认提示词模板',
  'discover.fetchFailed': '热点抓取失败：{detail}',
  'discover.staleAt': '数据时间：{time}',
```

en：
```ts
  'tab.discover': 'Discover',
  'discover.title': 'Idea Discovery',
  'discover.refresh': 'Refresh hotspots',
  'discover.refreshing': 'Fetching…',
  'discover.archive': 'Archive hotspots',
  'discover.archived': 'Archived to {path}',
  'discover.archiveEmpty': 'No hotspots to archive',
  'discover.hotspotsHeading': 'Hotspots',
  'discover.signalsHeading': 'Audience feedback',
  'discover.empty': 'No hotspots yet — click “Refresh hotspots”',
  'discover.signalsEmpty': 'No audience signals yet',
  'discover.sourceFailed': '⚠️ {label} fetch failed, showing cache',
  'discover.copyButton': 'Build topic prompt',
  'discover.copied': 'Copied “{label}”, paste into Codex; output to {output}',
  'discover.selectHint': 'Select hotspots and signals to build a prompt',
  'discover.noTemplate': 'Discovery template missing — seed default prompts in the Workflow tab first',
  'discover.fetchFailed': 'Hotspot fetch failed: {detail}',
  'discover.staleAt': 'Data time: {time}',
```

- [ ] **Step 2: 运行 i18n 测试**

Run: `npx vitest run tests/i18n/translations.test.ts`
Expected: PASS（键集 zh/en 对齐）。若 `TranslationKey` 联合类型由该文件推导，新增键自动可用。

- [ ] **Step 3: Commit（可选）**

```bash
git add src/i18n/translations.ts
git commit -m "feat(discovery): add discover i18n keys"
```

---

### Task D2: dashboard-renderer 接入 discover tab

**Files:**
- Modify: `src/ui/dashboard-renderer.ts`（`DashboardTab` 类型、handlers 接口、tabsConfig、panel 分支）
- Test: `tests/ui/dashboard-renderer.test.ts`（追加）

- [ ] **Step 1: 追加失败测试**

```ts
// 追加到 tests/ui/dashboard-renderer.test.ts（沿用该文件既有的 fake-dom + model 工厂 + handlers stub）
it('discover tab 渲染发现面板标题', () => {
  const { container, model, handlers, t } = setup(); // 复用文件内既有 setup 工厂
  new DashboardRenderer().render(container, model, handlers, 'discover', t);
  expect(container.querySelector('.curiosity-tab-panel--discover')).not.toBeNull();
  expect(container.textContent).toContain('灵感发现');
});
```

（若该测试文件没有 `setup` 工厂，则参照文件中既有用例构造 `container`(fake-dom)、`model`(完整 DashboardModel，含新字段 `audienceSignals: []`, `hotspots: []`)、`handlers`(各方法 `async () => {}`，含 Task D3 将新增的三个 handler stub)、`t`(createTranslator('zh'))。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/ui/dashboard-renderer.test.ts`
Expected: FAIL

- [ ] **Step 3: 改实现**

`src/ui/dashboard-renderer.ts`：

1) `DashboardTab` 类型改为：
```ts
export type DashboardTab = 'overview' | 'tasks' | 'workflow' | 'discover' | 'data';
```

2) `DashboardHandlers` 接口追加（实现见 Task D3）：
```ts
  refreshHotspots(): Promise<void>;
  archiveHotspots(): Promise<void>;
  copyDiscoveryPrompt(hotspots: Hotspot[], signals: AudienceSignal[]): Promise<void>;
```
并在文件顶部 import：
```ts
import type { Hotspot, AudienceSignal } from '@/domain/discovery';
```

3) 顶部 import 渲染器：
```ts
import { renderDiscoverDeck } from './renderers/discover-deck';
```

4) `tabsConfig` 在 workflow 与 data 之间插入：
```ts
      { id: 'discover', label: t.t('tab.discover') },
```

5) panel 分支：在 `} else if (id === 'workflow') { ... }` 之后追加：
```ts
      } else if (id === 'discover') {
        renderDiscoverDeck(panel, model, handlers, t);
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/ui/dashboard-renderer.test.ts`
Expected: PASS（依赖 Task D3 的 `renderDiscoverDeck`；若先行编译报缺模块，先做 Task D3 再回跑。建议 D2、D3 连续实现，一次跑通。）

- [ ] **Step 5: Commit（可选）**

```bash
git add src/ui/dashboard-renderer.ts tests/ui/dashboard-renderer.test.ts
git commit -m "feat(discovery): wire discover tab into dashboard renderer"
```

---

### Task D3: discover-deck 渲染器（热点/信号/勾选/按钮）

**Files:**
- Create: `src/ui/renderers/discover-deck.ts`
- Test: `tests/ui/dashboard-modules.test.ts`（追加，沿用既有模块渲染测试风格）

- [ ] **Step 1: 追加失败测试**

```ts
// 追加到 tests/ui/dashboard-modules.test.ts
import { renderDiscoverDeck } from '@/ui/renderers/discover-deck';
// 复用文件内的 fakeElement/model 工厂；下面演示最小构造
import { createTranslator } from '@/i18n/translator';
import type { DashboardModel } from '@/domain/models';

function discoverModel(over: Partial<DashboardModel>): DashboardModel {
  return { ...baseModel(), ...over }; // baseModel: 该测试文件已有的完整模型工厂
}

describe('renderDiscoverDeck', () => {
  const t = createTranslator('zh');

  it('有热点时渲染条目与生成按钮', () => {
    const root = fakeRoot(); // 该文件已有的 fake-dom 根
    const model = discoverModel({
      hotspots: [{ sourceId: 'hn', label: 'Hacker News', status: 'ok', fetchedAt: 1, error: null,
        items: [{ title: 'HN A', url: 'https://a', source: 'Hacker News', publishedAt: null, summary: null }] }],
      audienceSignals: [{ text: '怎么用', kind: '问题', source: '评论档', weight: 1 }],
    });
    let copied = false;
    const handlers = { ...stubHandlers(), copyDiscoveryPrompt: async () => { copied = true; } };
    renderDiscoverDeck(root, model, handlers, t);
    expect(root.textContent).toContain('HN A');
    expect(root.textContent).toContain('怎么用');
    const copy = root.querySelector('.curiosity-discover-copy') as { click?: () => void } | null;
    expect(copy).not.toBeNull();
    copy?.click?.();
    expect(copied).toBe(true);
  });

  it('无热点时渲染空态与刷新按钮', () => {
    const root = fakeRoot();
    renderDiscoverDeck(root, discoverModel({ hotspots: [], audienceSignals: [] }), stubHandlers(), t);
    expect(root.textContent).toContain('还没有热点');
  });

  it('失败源显示告警', () => {
    const root = fakeRoot();
    const model = discoverModel({
      hotspots: [{ sourceId: 'weibo', label: '微博热榜', status: 'failed', fetchedAt: 1, error: 'x', items: [] }],
    });
    renderDiscoverDeck(root, model, stubHandlers(), t);
    expect(root.textContent).toContain('抓取失败');
  });
});
```

（`stubHandlers()` 须含全部 `DashboardHandlers` 方法，新增三个为 `async () => {}`。沿用本测试文件既有 stub 工厂并补这三项。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/ui/dashboard-modules.test.ts`
Expected: FAIL

- [ ] **Step 3: 写实现**

```ts
// src/ui/renderers/discover-deck.ts
import type { AudienceSignal, Hotspot, HotspotSourceResult } from '@/domain/discovery';
import type { DashboardModel } from '@/domain/models';
import type { Translator } from '@/i18n/translator';

import type { DashboardHandlers } from '../dashboard-renderer';
import { renderWindowTitlebar } from './window-frame';

export function renderDiscoverDeck(
  parent: HTMLElement,
  model: DashboardModel,
  handlers: DashboardHandlers,
  t: Translator,
): void {
  const section = parent.createEl('section', { cls: 'curiosity-section curiosity-discover' });
  renderWindowTitlebar(section, t.t('discover.title'), '');

  const toolbar = section.createDiv({ cls: 'curiosity-discover-toolbar' });
  const refresh = toolbar.createEl('button', {
    cls: 'curiosity-write-action curiosity-discover-refresh',
    text: t.t('discover.refresh'), type: 'button',
  });
  refresh.addEventListener('click', () => void handlers.refreshHotspots());

  const archive = toolbar.createEl('button', {
    cls: 'curiosity-discover-archive', text: t.t('discover.archive'), type: 'button',
  });
  archive.addEventListener('click', () => void handlers.archiveHotspots());

  const grid = section.createDiv({ cls: 'curiosity-discover-grid' });
  const hotspotChecks: Array<{ item: Hotspot; input: HTMLInputElement }> = [];
  const signalChecks: Array<{ item: AudienceSignal; input: HTMLInputElement }> = [];

  renderHotspotColumn(grid, model.hotspots, hotspotChecks, t);
  renderSignalColumn(grid, model.audienceSignals, signalChecks, t);

  const actions = section.createDiv({ cls: 'curiosity-discover-actions' });
  actions.createEl('p', { cls: 'curiosity-discover-hint', text: t.t('discover.selectHint') });
  const copy = actions.createEl('button', {
    cls: 'curiosity-write-action curiosity-discover-copy',
    text: t.t('discover.copyButton'), type: 'button',
  });
  copy.addEventListener('click', () => {
    const hotspots = selected(hotspotChecks);
    const signals = selected(signalChecks);
    void handlers.copyDiscoveryPrompt(hotspots, signals);
  });
}

function renderHotspotColumn(
  grid: HTMLElement,
  results: HotspotSourceResult[],
  checks: Array<{ item: Hotspot; input: HTMLInputElement }>,
  t: Translator,
): void {
  const col = grid.createDiv({ cls: 'curiosity-discover-col curiosity-discover-hotspots' });
  col.createEl('h3', { text: t.t('discover.hotspotsHeading') });

  const hasAny = results.some((r) => r.items.length > 0);
  if (!hasAny) {
    col.createEl('p', { cls: 'curiosity-discover-empty', text: t.t('discover.empty') });
    return;
  }

  for (const result of results) {
    if (result.status === 'failed') {
      col.createEl('p', {
        cls: 'curiosity-discover-source-failed', attr: { role: 'status' },
        text: t.t('discover.sourceFailed', { label: result.label }),
      });
    }
    if (result.items.length === 0) continue;
    const group = col.createDiv({ cls: 'curiosity-discover-source' });
    group.createEl('h4', { text: result.label });
    const list = group.createDiv({ cls: 'curiosity-discover-list' });
    for (const item of result.items) {
      const row = list.createDiv({ cls: 'curiosity-discover-row' });
      const input = row.createEl('input', {
        cls: 'curiosity-discover-check', attr: { type: 'checkbox', 'aria-label': item.title },
      });
      checks.push({ item, input });
      const body = row.createDiv({ cls: 'curiosity-discover-body' });
      body.createSpan({ cls: 'curiosity-discover-text', text: item.title });
      if (item.publishedAt !== null) {
        body.createSpan({ cls: 'curiosity-discover-date', text: item.publishedAt });
      }
    }
  }
}

function renderSignalColumn(
  grid: HTMLElement,
  signals: AudienceSignal[],
  checks: Array<{ item: AudienceSignal; input: HTMLInputElement }>,
  t: Translator,
): void {
  const col = grid.createDiv({ cls: 'curiosity-discover-col curiosity-discover-signals' });
  col.createEl('h3', { text: t.t('discover.signalsHeading') });

  if (signals.length === 0) {
    col.createEl('p', { cls: 'curiosity-discover-empty', text: t.t('discover.signalsEmpty') });
    return;
  }

  const sorted = [...signals].sort((a, b) => b.weight - a.weight);
  const list = col.createDiv({ cls: 'curiosity-discover-list' });
  for (const item of sorted) {
    const row = list.createDiv({ cls: 'curiosity-discover-row' });
    const input = row.createEl('input', {
      cls: 'curiosity-discover-check', attr: { type: 'checkbox', 'aria-label': item.text },
    });
    checks.push({ item, input });
    const body = row.createDiv({ cls: 'curiosity-discover-body' });
    body.createSpan({ cls: 'curiosity-discover-text', text: item.text });
    body.createSpan({ cls: 'curiosity-discover-kind', text: `${item.kind} · ${item.source}` });
  }
}

function selected<T>(checks: Array<{ item: T; input: HTMLInputElement }>): T[] {
  return checks.filter((c) => c.input.checked).map((c) => c.item);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/ui/dashboard-modules.test.ts tests/ui/dashboard-renderer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit（可选）**

```bash
git add src/ui/renderers/discover-deck.ts tests/ui/dashboard-modules.test.ts
git commit -m "feat(discovery): add discover deck renderer"
```

---

### Task D4: view 处理器（刷新/归档/拼提示词）+ 网络源装配

**Files:**
- Modify: `src/curiosity-dashboard-view.ts`（renderModel handlers 接线 + 三个新方法）
- Modify: `src/main.ts`（新增 `hotspotFetchService()` 装配 HttpClient + 各源 + 传入 `requestUrl`）
- Test: `tests/curiosity-dashboard-view.test.ts`（追加，沿用既有 view 测试桩）

- [ ] **Step 1: main.ts 装配热点源工厂（先实现，便于 view 调用）**

`src/main.ts` 顶部 import：
```ts
import { requestUrl } from 'obsidian';
import { ObsidianHttpClient } from '@/adapters/obsidian-http-client';
import { HotspotFetchService } from '@/data/hotspot-fetch-service';
import { HackerNewsSource } from '@/data/hotspot-sources/hacker-news-source';
import { GithubTrendingSource } from '@/data/hotspot-sources/github-trending-source';
import { RssSource } from '@/data/hotspot-sources/rss-source';
import { DomesticTrendingSource } from '@/data/hotspot-sources/domestic-trending-source';
import type { HotspotSource } from '@/data/hotspot-sources/hotspot-source';
```
（`Notice, Plugin, type WorkspaceLeaf` 那行已存在，`requestUrl` 单独 import 即可。）

在类内（`dataService()` 附近）追加方法：
```ts
  hotspotFetchService(): HotspotFetchService {
    const http = new ObsidianHttpClient((param) => requestUrl(param));
    const enabled = new Set(this.settings.enabledHotspotSources);
    const sources: HotspotSource[] = [];
    if (enabled.has('hacker-news')) sources.push(new HackerNewsSource(http));
    if (enabled.has('github-trending')) sources.push(new GithubTrendingSource(http));
    if (enabled.has('rss')) sources.push(new RssSource('rss', '订阅 RSS', this.settings.rssSources, http));
    if (enabled.has('official-rss')) sources.push(new RssSource('official-rss', '官方发布', OFFICIAL_FEEDS, http));
    if (enabled.has('domestic-trending')) sources.push(new DomesticTrendingSource(http));
    return new HotspotFetchService(sources, { timeoutMs: 8000 });
  }
```
文件末尾（class 外）加官方源预置 feed：
```ts
const OFFICIAL_FEEDS = [
  'https://www.anthropic.com/rss.xml',
  'https://openai.com/blog/rss.xml',
];
```

- [ ] **Step 2: 追加 view 失败测试**

```ts
// 追加到 tests/curiosity-dashboard-view.test.ts（沿用文件既有的 fake plugin/app 构造）
it('refreshHotspots 抓取后写入缓存并刷新', async () => {
  const { view, plugin, calls } = makeView(); // 文件既有工厂
  // plugin.hotspotFetchService() 由桩返回 fetchAll → [{sourceId:'hacker-news',...,status:'ok',items:[...]}]
  await (view as unknown as { refreshHotspots(): Promise<void> }).refreshHotspots();
  expect(plugin.settings.hotspotCache['hacker-news']).toBeDefined();
  expect(calls.saved).toBe(true);     // saveSettings 调过
  expect(calls.refreshed).toBeGreaterThan(0);
});
```
（具体桩字段对齐该测试文件已有风格；关键断言：抓取结果经 `resultsToCache` 落 `settings.hotspotCache`，随后 `saveSettings()`+`refresh()`。）

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run tests/curiosity-dashboard-view.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现 view 处理器**

`src/curiosity-dashboard-view.ts`：

顶部 import：
```ts
import type { Hotspot, AudienceSignal } from '@/domain/discovery';
import { buildDiscoveryPrompt } from '@/mutations/discovery-prompt-builder';
import { buildHotspotArchive, hotspotArchivePath } from '@/mutations/hotspot-archive-builder';
import { resultsToCache } from '@/data/hotspot-fetch-service';
```

`renderModel` 的 handlers 对象 `openWorkflowIdeas: () => this.openWorkflowIdeas(),` 之后追加：
```ts
      refreshHotspots: () => this.refreshHotspots(),
      archiveHotspots: () => this.archiveHotspots(),
      copyDiscoveryPrompt: (hotspots, signals) => this.copyDiscoveryPrompt(hotspots, signals),
```

类内新增三个方法（放在 `copyPrompt` 附近）：
```ts
  private async refreshHotspots(): Promise<void> {
    if (this.rejectReadOnlyWrite()) return;
    try {
      const results = await this.plugin.hotspotFetchService().fetchAll(this.plugin.settings.hotspotCache);
      this.plugin.settings.hotspotCache = resultsToCache(results);
      await this.plugin.saveSettings();
      await this.refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : this.t.t('common.unknownError');
      new Notice(this.t.t('discover.fetchFailed', { detail }));
    }
  }

  private async archiveHotspots(): Promise<void> {
    if (this.rejectReadOnlyWrite()) return;
    const results = this.lastModel?.hotspots ?? [];
    if (results.every((r) => r.items.length === 0)) {
      new Notice(this.t.t('discover.archiveEmpty'));
      return;
    }
    const date = formatToday();
    const path = hotspotArchivePath(
      this.plugin.settings.hotspotArchiveDir, date,
      (candidate) => this.plugin.gateway.exists(candidate),
    );
    try {
      const dir = this.plugin.settings.hotspotArchiveDir;
      if (this.app.vault.getAbstractFileByPath(dir) === null) {
        await this.app.vault.createFolder(dir);
      }
      await this.plugin.gateway.create(path, buildHotspotArchive({ date, results }));
      new Notice(this.t.t('discover.archived', { path }));
      await this.openPath(path);
    } catch (error) {
      this.showActionError('view.createFailed', error);
    }
  }

  private async copyDiscoveryPrompt(hotspots: Hotspot[], signals: AudienceSignal[]): Promise<void> {
    if (this.lastModel === null) {
      new Notice(this.t.t('view.notLoadedCreate'));
      return;
    }
    const action = this.lastModel.workflowActions.find((a) => a.id === 'spark-topics');
    if (action === undefined) {
      new Notice(this.t.t('discover.noTemplate'));
      return;
    }
    const result = buildDiscoveryPrompt({
      action, hotspots, signals,
      existingTitles: existingTopicTitles(this.lastModel),
      settings: this.plugin.settings,
    });
    try {
      await navigator.clipboard.writeText(result.text);
      new Notice(this.t.t('discover.copied', {
        label: result.label, output: result.output ?? this.t.t('workflow.readonlyOutput'),
      }));
    } catch {
      const tempPath = `${this.plugin.settings.promptDir}/_临时-${Date.now()}.md`;
      try {
        await this.plugin.gateway.create(tempPath, result.text);
        await this.app.workspace.openLinkText(tempPath, '', false);
        new Notice(this.t.t('workflow.copyFailed', { path: tempPath }));
      } catch (error) {
        this.showActionError('view.createFailed', error);
      }
    }
  }
```

文件末尾辅助函数区追加：
```ts
function formatToday(): string {
  const d = new Date();
  const y = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function existingTopicTitles(model: DashboardModel): string[] {
  const titles = new Set<string>();
  for (const topic of [...model.thisWeek, ...model.queue, ...model.pickableTopics]) {
    if (topic.title.trim().length > 0) titles.add(topic.title.trim());
  }
  return [...titles];
}
```

- [ ] **Step 5: 运行确认通过 + typecheck**

Run: `npx vitest run tests/curiosity-dashboard-view.test.ts && npm run typecheck`
Expected: PASS；typecheck 无错误

- [ ] **Step 6: Commit（可选）**

```bash
git add src/curiosity-dashboard-view.ts src/main.ts tests/curiosity-dashboard-view.test.ts
git commit -m "feat(discovery): wire hotspot fetch/archive/prompt handlers and source assembly"
```

---

### Task D5: 设置面板控件 + defaultTab 下拉 + 样式

**Files:**
- Modify: `src/settings.ts`（`DashboardSettingTab.display` 加控件、defaultTab 下拉加 discover、TextSettingKey）
- Modify: `styles.css`（`.curiosity-discover-*` 样式）
- Test: `tests/styles.test.ts`（若该测试校验关键类存在则追加断言）

- [ ] **Step 1: 设置面板控件**

`src/settings.ts` 的 `display()` 中，`this.addText(t('settings.promptDir'), 'promptDir');` 之后追加：
```ts
    this.addText(t('settings.commentDocPath'), 'commentDocPath');
    this.addText(t('settings.hotspotArchiveDir'), 'hotspotArchiveDir');
```
并在 `TextSettingKey` 联合类型加入 `| 'commentDocPath' | 'hotspotArchiveDir'`。

defaultTab 下拉 `addOptions({...})` 加入：
```ts
          discover: t('tab.discover'),
```
（顺序放在 workflow 与 data 之间。）

RSS 列表用多行文本（一行一个 URL）：在 promptDir 文本框后追加：
```ts
    new Setting(this.containerEl).setName(t('settings.rssSources')).addTextArea((area) =>
      area
        .setValue(this.plugin.settings.rssSources.join('\n'))
        .onChange((value) => {
          const list = value.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
          this.updateSetting('rssSources', list);
        }),
    );
```

补 i18n 键（zh/en 同步，Task D1 文件）：`settings.commentDocPath`、`settings.hotspotArchiveDir`、`settings.rssSources`。

- [ ] **Step 2: 样式**

`styles.css` 末尾追加（贴合既有 `.curiosity-workflow-*` 风格，复用现有变量）：
```css
.curiosity-discover-toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.curiosity-discover-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.curiosity-discover-col { min-width: 0; }
.curiosity-discover-row { display: flex; align-items: flex-start; gap: 8px; padding: 4px 0; }
.curiosity-discover-body { display: flex; flex-direction: column; min-width: 0; }
.curiosity-discover-text { word-break: break-word; }
.curiosity-discover-date,
.curiosity-discover-kind { font-size: 0.8em; opacity: 0.65; }
.curiosity-discover-source-failed { color: var(--text-warning); font-size: 0.85em; }
.curiosity-discover-empty { opacity: 0.7; }
.curiosity-discover-actions { margin-top: 12px; }
.curiosity-discover-hint { font-size: 0.85em; opacity: 0.7; margin-bottom: 6px; }
@media (max-width: 640px) {
  .curiosity-discover-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: 跑相关测试**

Run: `npx vitest run tests/settings.test.ts tests/styles.test.ts tests/i18n/translations.test.ts`
Expected: PASS（如 styles.test 校验类名，按其断言风格补 `.curiosity-discover-grid` 等）

- [ ] **Step 4: Commit（可选）**

```bash
git add src/settings.ts styles.css src/i18n/translations.ts tests/styles.test.ts
git commit -m "feat(discovery): add discovery settings controls and styles"
```

---

### Task D6: 全量验证 + 构建 + 部署到 vault 插件目录

**Files:** 无新增（验证与部署）

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: 全绿（既有 ~380 + 本次新增用例）。逐一修正因模型/handlers/tab 联合类型变更而失败的既有测试（补 `audienceSignals: []`/`hotspots: []` 字段、补三个 handler stub、tab 计数）。

- [ ] **Step 2: typecheck + 构建**

Run: `npm run build`
Expected: typecheck 0 错误，esbuild 产出 `main.js`、`styles.css`

- [ ] **Step 3: 部署到 vault 插件目录**

按既有部署方式把产物拷到 vault 插件目录（与 workflow-cockpit 部署一致）：
```bash
cp main.js styles.css "<vault>/.obsidian/plugins/<plugin-id>/"
```
（确认插件 id 与既有部署路径；用户 git 策略下不提交，改动留工作区。）

- [ ] **Step 4: 冷启动验证清单（手动）**
  - 打开「发现」tab：首次无缓存显示空态 + 「刷新热点」按钮
  - 点「刷新热点」：HN/GitHub/RSS/官方源抓取，失败源显示告警且不白屏
  - 勾选热点 + 受众信号 →「生成选题提示词」→ 剪贴板有内容、Notice 提示输出位置
  - 若 `spark-topics` 模板缺失 → 提示去「工作流」tab 生成默认模板（点生成后回「发现」可正常拼词）
  - 点「归档本次热点」→ `30-竞品热点/热点观察/YYYY-MM-DD-热点.md` 生成，同日再点追加 `-2`

- [ ] **Step 5: Commit（可选）**

```bash
git add -A
git commit -m "chore(discovery): build and deploy discovery deck"
```

---

## 自检对照（spec → 计划覆盖）

- 内置抓取（突破不联网）→ A2 HttpClient 端口 + 适配器，main.ts 传 `requestUrl`：✅
- 4 类热点源可插拔 → B2 HN / B3 RSS（订阅 + 官方）/ B4 GitHub / B5 国内热榜(P1)，统一 `HotspotSource` 接口：✅
- 受众反馈 3 类源 → B7 AudienceSignalRepository（灵感箱+待评估卡 / 复盘 audience_questions / 评论档）：✅
- 插件只拼提示词、Codex 写卡 → A4 discovery-prompt-builder + D4 copyDiscoveryPrompt（剪贴板）：✅
- 归档本次热点（正式功能）→ A5 archive-builder + D4 archiveHotspots（vault.create）：✅
- 独立「发现」tab，序在 workflow 后 → C1 tab 集合 + D2 renderer + D3 deck：✅
- 错误隔离/超时/降级缓存 → B6 HotspotFetchService（allSettled 语义 + 8s 超时 + 缓存回落）：✅
- 缓存落 data.json + 手动刷新 + TTL → C1 hotspotCache/hotspotCacheTtlHours + D4 refreshHotspots：✅
- 新 settings 4+2 项 → C1：✅
- 新提示词模板 11 → C2：✅
- 测试策略（纯逻辑高覆盖 + 编排 mock + 仓库 in-memory + 适配器薄封装）→ 各任务 TDD：✅

> **TTL 说明**：spec 第 5 节「进入 tab 时缓存 < TTL 直接用缓存」——本计划用「手动刷新 + 缓存常驻渲染」实现等价效果（不自动抓取即等于始终用缓存）。`hotspotCacheTtlHours` 字段已落地，若后续要做「打开 tab 自动判断 TTL 决定是否抓取」，在 D4 的 `onOpen`/`refreshHotspots` 加一处时间比较即可，属增量、不改架构。
