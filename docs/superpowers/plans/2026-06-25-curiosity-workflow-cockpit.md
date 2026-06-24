# Curiosity Dashboard 工作流驾驶舱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Curiosity Dashboard 新增「工作流」tab，把 Codex 日常工作流（评估选题/生成脚本/联网核验等）变成按阶段分组、上下文自动填充的一键复制提示词动作 + 跳转输出位置的轻闭环。

**Architecture:** 沿用现有整洁架构。提示词模板存于 vault `99-模板/codex-提示词/*.md`（带 `{{占位符}}` + frontmatter 元数据），由 `prompt-template-repository` 解析为 `WorkflowAction[]` 并注入 `DashboardModel`；`prompt-builder-service` 用模型上下文填充占位符产出可复制文本；新 `workflow-deck` 渲染器按 5 阶段+通用分组展示；剪贴板写入与跳转输出在 view 层用 Obsidian 原生 API 完成（不污染 `VaultGateway` 数据端口）。冷启动由 `prompt-seed-service` 幂等生成默认模板。

**Tech Stack:** TypeScript + Obsidian Plugin API + esbuild + vitest。路径别名 `@/` → `src/`。测试用 `tests/support/fake-vault-gateway.ts` 与 `tests/support/fake-dom.ts`。

**关键契约（先读后写）：**
- `Stage = '选题'|'策划'|'制作'|'发布'|'复盘'`（`src/domain/stages.ts`）。
- `DashboardModel`（`src/domain/models.ts`）渲染器只吃 model + handlers + Translator。
- 占位符填充复用现有思路（`template-creation-service.ts` 的 `KNOWN_TEMPLATE_TOKEN`），但工作流用独立的宽松填充（未知 token 原样保留）。
- 翻译：`TranslationKey` 联合类型 + `TRANSLATIONS`/`STAGE_LABELS`（`src/i18n/translations.ts`），`t(key, params)` 用 `{name}` 占位。
- view 已有 `openPath` 用 `app.workspace.openLinkText`；可参照 `openSettings` 的 `app` 守卫式 any-cast 访问 file-explorer。

---

## File Structure

- Create `src/domain/workflow.ts` — `WorkflowAction`/`PromptContext` 类型 + `fillPlaceholders` 纯函数 + token 名常量。
- Create `src/data/prompt-template-repository.ts` — 读 prompt 目录，解析 frontmatter+body → `WorkflowAction[]`，坏文件跳过。
- Create `src/mutations/prompt-builder-service.ts` — 由 `DashboardModel`+`DashboardSettings` 组 `PromptContext`，产出 `{ label, text, outputPath }`。
- Create `src/mutations/prompt-seed-service.ts` — 幂等写入 10 个默认模板文件。
- Create `src/ui/renderers/workflow-deck.ts` — 工作流 tab 渲染（分组、按钮、禁用/只读/空态）。
- Modify `src/domain/models.ts` — `DashboardModel` 增 `workflowActions` + `promptTemplatesPresent`。
- Modify `src/settings.ts` — 增 `promptDir` 设置；`defaultTab` 联合与 `DEFAULT_TABS` 增 `workflow`；设置面板下拉增项 + promptDir 文本项。
- Modify `src/data/dashboard-data-service.ts` — `loadOnce` 注入 workflow 字段。
- Modify `src/i18n/translations.ts` — 新增 `workflow.*` + `tab.workflow` 键。
- Modify `src/ui/dashboard-renderer.ts` — `DashboardTab` 增 `workflow`；tabsConfig 增项；panel 渲染 workflow-deck；`DashboardHandlers` 增 `copyPrompt`/`openOutput`/`seedPromptTemplates`。
- Modify `src/curiosity-dashboard-view.ts` — 实现三个新 handler（剪贴板/跳转/种子）。
- Modify `styles.css` — 工作流卡片样式。
- Tests: 每个新模块一份 `tests/...` 文件 + 扩展 `tests/ui/dashboard-modules.test.ts`、`tests/settings.test.ts`、`tests/i18n/translations.test.ts`。

---

## Task 1: 领域层 `workflow.ts`（类型 + 占位符填充纯函数）

**Files:**
- Create: `src/domain/workflow.ts`
- Test: `tests/domain/workflow.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/domain/workflow.test.ts
import { describe, expect, it } from 'vitest';

import { fillPlaceholders, type PromptContext } from '@/domain/workflow';

function context(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    focus: { title: '示例', issue: 39, topicPath: '10-选题池/已立项/39.md', scriptPath: null, reviewPath: null },
    inboxDir: '10-选题池/待评估',
    topicDir: '10-选题池',
    scriptDraftDir: '40-脚本大纲/草稿',
    assetDir: '20-素材库',
    reviewDir: '60-发布复盘',
    topicTemplate: '99-模板/选题卡模板.md',
    scriptTemplate: '99-模板/脚本大纲模板.md',
    reviewTemplate: '99-模板/发布复盘模板.md',
    date: '2026-06-25',
    week: '2026-W26',
    ...overrides,
  };
}

describe('fillPlaceholders', () => {
  it('替换已知占位符', () => {
    const out = fillPlaceholders('评估 {{inbox_dir}} 焦点 {{focus_title}} 第{{focus_issue}}期 {{date}}', context());
    expect(out).toBe('评估 10-选题池/待评估 焦点 示例 第39期 2026-06-25');
  });

  it('未知占位符原样保留', () => {
    expect(fillPlaceholders('保留 {{unknown_token}}', context())).toBe('保留 {{unknown_token}}');
  });

  it('无焦点时焦点占位符填为空串', () => {
    const out = fillPlaceholders('script={{focus_script}} title={{focus_title}}', context({ focus: null }));
    expect(out).toBe('script= title=');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/domain/workflow.test.ts`
Expected: FAIL（模块不存在 / `fillPlaceholders` 未定义）

- [ ] **Step 3: 实现**

```ts
// src/domain/workflow.ts
import type { Stage } from './stages';

export type WorkflowGroup = Stage | 'general';

export interface WorkflowAction {
  id: string;
  label: string;
  description: string;
  group: WorkflowGroup;
  order: number;
  needsFocus: boolean;
  output: string | null;
  body: string;
  sourcePath: string;
}

export interface PromptFocusContext {
  title: string;
  issue: number;
  topicPath: string;
  scriptPath: string | null;
  reviewPath: string | null;
}

export interface PromptContext {
  focus: PromptFocusContext | null;
  inboxDir: string;
  topicDir: string;
  scriptDraftDir: string;
  assetDir: string;
  reviewDir: string;
  topicTemplate: string;
  scriptTemplate: string;
  reviewTemplate: string;
  date: string;
  week: string;
}

const TOKEN = /\{\{(\w+)\}\}/g;

export function fillPlaceholders(body: string, context: PromptContext): string {
  const values = tokenValues(context);
  return body.replace(TOKEN, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : match);
}

function tokenValues(context: PromptContext): Record<string, string> {
  const focus = context.focus;
  return {
    focus_title: focus?.title ?? '',
    focus_issue: focus === null ? '' : String(focus.issue),
    focus_topic: focus?.topicPath ?? '',
    focus_script: focus?.scriptPath ?? '',
    focus_review: focus?.reviewPath ?? '',
    inbox_dir: context.inboxDir,
    topic_dir: context.topicDir,
    script_draft_dir: context.scriptDraftDir,
    asset_dir: context.assetDir,
    review_dir: context.reviewDir,
    topic_template: context.topicTemplate,
    script_template: context.scriptTemplate,
    review_template: context.reviewTemplate,
    date: context.date,
    week: context.week,
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/domain/workflow.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck**

Run: `npx tsc --noEmit`
Expected: 无错误

---

## Task 2: 数据层 `prompt-template-repository.ts`（解析模板目录）

**Files:**
- Create: `src/data/prompt-template-repository.ts`
- Test: `tests/data/prompt-template-repository.test.ts`

说明：自带极简 YAML frontmatter 解析（只支持 `key: value` 单行，引号可选），不依赖 metadataCache，便于测试。

- [ ] **Step 1: 写失败测试**

```ts
// tests/data/prompt-template-repository.test.ts
import { describe, expect, it } from 'vitest';

import { PromptTemplateRepository } from '@/data/prompt-template-repository';

import { FakeVaultGateway } from '../support/fake-vault-gateway';

const DIR = '99-模板/codex-提示词';

function gatewayWith(files: Record<string, string>): FakeVaultGateway {
  const gateway = new FakeVaultGateway();
  for (const [path, content] of Object.entries(files)) gateway.files.set(path, content);
  return gateway;
}

const VALID = `---
id: evaluate-topics
label: 批量评估待评估选题
stage: 选题
order: 2
needs_focus: false
output: "10-选题池/待评估"
description: 给结论不改文件
---
目标：评估 {{inbox_dir}}`;

describe('PromptTemplateRepository', () => {
  it('解析合法模板并按 group+order 排序', () => {
    const gateway = gatewayWith({
      [`${DIR}/2-评估.md`]: VALID,
      [`${DIR}/1-收集.md`]: `---\nid: collect\nlabel: 收集灵感\nstage: 选题\norder: 1\nneeds_focus: false\noutput: "10-选题池/待评估"\n---\n正文`,
    });
    const actions = new PromptTemplateRepository(gateway, DIR).all();
    expect(actions.map((a) => a.id)).toEqual(['collect', 'evaluate-topics']);
    const evaluate = actions[1];
    expect(evaluate.group).toBe('选题');
    expect(evaluate.needsFocus).toBe(false);
    expect(evaluate.output).toBe('10-选题池/待评估');
    expect(evaluate.body.trim()).toBe('目标：评估 {{inbox_dir}}');
  });

  it('stage 非法或为 general 归入通用组', () => {
    const gateway = gatewayWith({
      [`${DIR}/x.md`]: `---\nid: verify\nlabel: 联网核验\nstage: general\norder: 1\nneeds_focus: false\noutput: "30-竞品热点/热点观察"\n---\n正文`,
    });
    expect(new PromptTemplateRepository(gateway, DIR).all()[0].group).toBe('general');
  });

  it('缺 id 或 label 的文件被跳过并记入 skipped', () => {
    const gateway = gatewayWith({
      [`${DIR}/bad.md`]: `---\nlabel: 没有id\n---\n正文`,
      [`${DIR}/ok.md`]: VALID,
    });
    const repo = new PromptTemplateRepository(gateway, DIR);
    expect(repo.all()).toHaveLength(1);
    expect(repo.skipped()).toEqual(['99-模板/codex-提示词/bad.md']);
  });

  it('output 留空时为 null（只读类）', () => {
    const gateway = gatewayWith({
      [`${DIR}/r.md`]: `---\nid: eval\nlabel: 评估\nstage: 选题\norder: 1\nneeds_focus: false\n---\n正文`,
    });
    expect(new PromptTemplateRepository(gateway, DIR).all()[0].output).toBeNull();
  });

  it('目录不存在时 all() 为空、present() 为 false', () => {
    const repo = new PromptTemplateRepository(new FakeVaultGateway(), DIR);
    expect(repo.all()).toEqual([]);
    expect(repo.present()).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/data/prompt-template-repository.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// src/data/prompt-template-repository.ts
import type { WorkflowAction, WorkflowGroup } from '@/domain/workflow';
import { normalizeStage } from '@/domain/stages';
import type { VaultGateway } from '@/ports/vault-gateway';

interface ParsedTemplate {
  frontmatter: Record<string, string>;
  body: string;
}

export class PromptTemplateRepository {
  private readonly actions: WorkflowAction[];
  private readonly skippedPaths: string[];

  constructor(vault: VaultGateway, promptDir: string) {
    const dir = normalize(promptDir);
    const paths = vault
      .listMarkdownPaths()
      .map(normalize)
      .filter((path) => dir.length > 0 && path.startsWith(`${dir}/`))
      .sort();

    const actions: WorkflowAction[] = [];
    const skipped: string[] = [];
    for (const path of paths) {
      const action = this.toAction(readSync(vault, path), path);
      if (action === null) skipped.push(path);
      else actions.push(action);
    }
    actions.sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.order - b.order || a.label.localeCompare(b.label));
    this.actions = actions;
    this.skippedPaths = skipped;
  }

  all(): WorkflowAction[] {
    return this.actions;
  }

  skipped(): string[] {
    return this.skippedPaths;
  }

  present(): boolean {
    return this.actions.length > 0;
  }

  private toAction(content: string | null, path: string): WorkflowAction | null {
    if (content === null) return null;
    const parsed = parseTemplate(content);
    const id = parsed.frontmatter.id?.trim() ?? '';
    const label = parsed.frontmatter.label?.trim() ?? '';
    if (id.length === 0 || label.length === 0) return null;
    const output = parsed.frontmatter.output?.trim() ?? '';
    return {
      id,
      label,
      description: parsed.frontmatter.description?.trim() ?? '',
      group: toGroup(parsed.frontmatter.stage),
      order: toOrder(parsed.frontmatter.order),
      needsFocus: parsed.frontmatter.needs_focus?.trim() === 'true',
      output: output.length === 0 ? null : normalize(output),
      body: parsed.body,
      sourcePath: path,
    };
  }
}

function toGroup(value: string | undefined): WorkflowGroup {
  return normalizeStage(value?.trim()) ?? 'general';
}

function toOrder(value: string | undefined): number {
  const parsed = Number.parseInt(value?.trim() ?? '', 10);
  return Number.isSafeInteger(parsed) ? parsed : 999;
}

function groupRank(group: WorkflowGroup): number {
  const order: Record<WorkflowGroup, number> = {
    选题: 0, 策划: 1, 制作: 2, 发布: 3, 复盘: 4, general: 5,
  };
  return order[group];
}

function parseTemplate(content: string): ParsedTemplate {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (match === null) return { frontmatter: {}, body: content };
  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
    if (pair === null) continue;
    frontmatter[pair[1]] = unquote(pair[2]);
  }
  return { frontmatter, body: match[2] };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

// VaultGateway.read 是异步，但仓库构造需同步快照。改为：构造仅采集路径，read 在外部预取。
// 见下方调整说明——本仓库改用「预读内容映射」入参。
function readSync(_vault: VaultGateway, _path: string): string | null {
  throw new Error('replaced-by-prefetch');
}
```

> ⚠️ 调整说明：`VaultGateway.read` 是 `Promise`，仓库构造函数不能同步读取。Step 3 的 `readSync` 是占位错误。正确实现见 Step 3b：把仓库改成接收「已预读的内容映射」，由调用方（data-service）先 `await` 读好。

- [ ] **Step 3b: 改为预读内容映射（替换 Step 3 的读取部分）**

把 `constructor(vault, promptDir)` 改为接收预读内容，并新增静态异步工厂 `load`：

```ts
// 替换 src/data/prompt-template-repository.ts 的 class 头与 readSync
export class PromptTemplateRepository {
  private readonly actions: WorkflowAction[];
  private readonly skippedPaths: string[];

  private constructor(entries: Array<{ path: string; content: string }>) {
    const actions: WorkflowAction[] = [];
    const skipped: string[] = [];
    for (const { path, content } of entries) {
      const action = toAction(content, path);
      if (action === null) skipped.push(path);
      else actions.push(action);
    }
    actions.sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.order - b.order || a.label.localeCompare(b.label));
    this.actions = actions;
    this.skippedPaths = skipped;
  }

  static async load(vault: VaultGateway, promptDir: string): Promise<PromptTemplateRepository> {
    const dir = normalize(promptDir);
    const paths = vault
      .listMarkdownPaths()
      .map(normalize)
      .filter((path) => dir.length > 0 && path.startsWith(`${dir}/`))
      .sort();
    const entries: Array<{ path: string; content: string }> = [];
    for (const path of paths) {
      try {
        entries.push({ path, content: await vault.read(path) });
      } catch {
        // 读失败的文件直接忽略（不计入 skipped，因为根本没读到）
      }
    }
    return new PromptTemplateRepository(entries);
  }

  all(): WorkflowAction[] { return this.actions; }
  skipped(): string[] { return this.skippedPaths; }
  present(): boolean { return this.actions.length > 0; }
}
```

把 `toAction` 从方法改为模块级函数（签名 `function toAction(content: string, path: string): WorkflowAction | null`，body 同 Step 3 的 `this.toAction` 去掉 `null` 入参分支）。删除 `readSync`。

同步更新测试为异步工厂（替换 Task 2 Step 1 中所有 `new PromptTemplateRepository(gateway, DIR)` 为 `await PromptTemplateRepository.load(gateway, DIR)`，并给相关 `it` 回调加 `async`）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/data/prompt-template-repository.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck + commit**

```bash
npx tsc --noEmit
git add src/domain/workflow.ts src/data/prompt-template-repository.ts tests/domain/workflow.test.ts tests/data/prompt-template-repository.test.ts
git commit -m "feat: add workflow domain types and prompt template repository"
```

---

## Task 3: `prompt-builder-service.ts`（由模型+设置产出可复制文本）

**Files:**
- Create: `src/mutations/prompt-builder-service.ts`
- Test: `tests/mutations/prompt-builder-service.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/mutations/prompt-builder-service.test.ts
import { describe, expect, it } from 'vitest';

import type { DashboardModel } from '@/domain/models';
import type { WorkflowAction } from '@/domain/workflow';
import { buildPrompt, type PromptBuildResult } from '@/mutations/prompt-builder-service';
import { DEFAULT_SETTINGS } from '@/settings';

const action: WorkflowAction = {
  id: 'evaluate-topics', label: '批量评估', description: '', group: '选题', order: 2,
  needsFocus: false, output: '10-选题池/待评估', body: '评估 {{inbox_dir}} 焦点 {{focus_title}}',
  sourcePath: '99-模板/codex-提示词/评估.md',
};

function model(overrides: Partial<DashboardModel> = {}): DashboardModel {
  return {
    associationCandidates: { assetPath: [], reviewPath: [], scriptPath: [] },
    backgroundUrl: null, commentEvidence: [], focus: { kind: 'none' },
    focusCandidates: [], pickableTopics: [], tasks: [], thisWeek: [], queue: [],
    metrics: [], reviewPath: null, mobileReadOnly: false,
    workflowActions: [action], promptTemplatesPresent: true, promptTemplatesSkipped: [],
    ...overrides,
  };
}

describe('buildPrompt', () => {
  it('用设置目录填充占位符并回传输出位置', () => {
    const result: PromptBuildResult = buildPrompt(action, model(), DEFAULT_SETTINGS, () => new Date('2026-06-25T00:00:00'));
    expect(result.text).toBe('评估 10-选题池/待评估 焦点 ');
    expect(result.output).toBe('10-选题池/待评估');
    expect(result.label).toBe('批量评估');
  });

  it('有焦点时填充焦点字段', () => {
    const focused = model({
      focus: { kind: 'ready', topic: {
        path: '10-选题池/已立项/39.md', basename: '39', title: 'Codex首页', issue: 39,
        status: '已立项', stage: '策划', priority: null, dueDate: null, nextAction: null,
        homepageFocus: true, scriptPath: null, assetPath: null, reviewPath: null,
      } },
    });
    const result = buildPrompt({ ...action, body: '焦点 {{focus_title}} 第{{focus_issue}}期' }, focused, DEFAULT_SETTINGS, () => new Date('2026-06-25T00:00:00'));
    expect(result.text).toBe('焦点 Codex首页 第39期');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/mutations/prompt-builder-service.test.ts`
Expected: FAIL（`workflowActions`/`promptTemplatesPresent` 还不在 `DashboardModel` 上 → 同时也会有 TS 报错；先在 Task 4 加字段。这里允许测试因类型缺失而失败）

> 注：本 Task 的测试依赖 Task 4 对 `DashboardModel` 的字段扩展。执行顺序上，可先做 Task 4 的 Step 3（仅加 model 字段），再回到本 Task。为保持线性，下面 Step 3 同时给出本服务实现，Task 4 负责模型字段；两者都落地后测试转绿。

- [ ] **Step 3: 实现**

```ts
// src/mutations/prompt-builder-service.ts
import type { DashboardModel } from '@/domain/models';
import { fillPlaceholders, type PromptContext, type WorkflowAction } from '@/domain/workflow';
import type { DashboardSettings } from '@/settings';

export interface PromptBuildResult {
  label: string;
  text: string;
  output: string | null;
}

export function buildPrompt(
  action: WorkflowAction,
  model: DashboardModel,
  settings: DashboardSettings,
  now: () => Date = () => new Date(),
): PromptBuildResult {
  const date = now();
  const context: PromptContext = {
    focus: focusContext(model),
    inboxDir: settings.topicInboxDir,
    topicDir: settings.topicDir,
    scriptDraftDir: settings.scriptDraftDir,
    assetDir: settings.assetDir,
    reviewDir: settings.reviewDir,
    topicTemplate: settings.topicTemplate,
    scriptTemplate: settings.scriptTemplate,
    reviewTemplate: settings.reviewTemplate,
    date: formatDate(date),
    week: formatWeek(date),
  };
  return { label: action.label, text: fillPlaceholders(action.body, context), output: action.output };
}

function focusContext(model: DashboardModel): PromptContext['focus'] {
  if (model.focus.kind !== 'ready' && model.focus.kind !== 'invalid-stage') return null;
  const topic = model.focus.topic;
  return {
    title: topic.title, issue: topic.issue, topicPath: topic.path,
    scriptPath: topic.scriptPath, reviewPath: topic.reviewPath,
  };
}

function formatDate(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatWeek(date: Date): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
```

- [ ] **Step 4: 跑测试确认通过**（需先完成 Task 4 的 model 字段）

Run: `npx vitest run tests/mutations/prompt-builder-service.test.ts`
Expected: PASS

- [ ] **Step 5: commit**

```bash
npx tsc --noEmit
git add src/mutations/prompt-builder-service.ts tests/mutations/prompt-builder-service.test.ts
git commit -m "feat: add prompt builder service"
```

---

## Task 4: 模型与数据服务注入 workflow 字段

**Files:**
- Modify: `src/domain/models.ts`（在 `DashboardModel` 末尾加字段）
- Modify: `src/data/dashboard-data-service.ts`（`loadOnce` 注入）
- Test: `tests/data/dashboard-data-service.test.ts`（扩展）

- [ ] **Step 1: 加模型字段**

在 `src/domain/models.ts` 顶部加导入并在 `DashboardModel` 接口 `associationCandidates` 之后加字段：

```ts
import type { WorkflowAction } from './workflow';
```
```ts
  // ...existing fields...
  workflowActions: WorkflowAction[];
  promptTemplatesPresent: boolean;
  promptTemplatesSkipped: string[];
```

- [ ] **Step 2: 写失败测试（数据服务注入）**

在 `tests/data/dashboard-data-service.test.ts` 末尾新增（沿用该文件已有的 gateway 构造方式；若无 helper，用 `FakeVaultGateway` 直接塞文件）：

```ts
import { PromptTemplateRepository } from '@/data/prompt-template-repository';

it('注入 workflowActions 与 promptTemplatesPresent', async () => {
  const gateway = new FakeVaultGateway();
  gateway.files.set('99-模板/codex-提示词/评估.md',
    '---\nid: eval\nlabel: 批量评估\nstage: 选题\norder: 1\nneeds_focus: false\noutput: "10-选题池/待评估"\n---\n评估 {{inbox_dir}}');
  const service = new DashboardDataService(gateway, DEFAULT_SETTINGS);
  const model = await service.load(false);
  expect(model.promptTemplatesPresent).toBe(true);
  expect(model.workflowActions.map((a) => a.id)).toEqual(['eval']);
});
```

> 该测试文件顶部若未导入 `DEFAULT_SETTINGS`/`FakeVaultGateway`/`DashboardDataService`，按文件现有导入风格补齐。

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run tests/data/dashboard-data-service.test.ts`
Expected: FAIL（`promptTemplatesPresent` 为 undefined / 字段缺失）

- [ ] **Step 4: 实现注入**

`src/data/dashboard-data-service.ts` 顶部加导入：
```ts
import { PromptTemplateRepository } from './prompt-template-repository';
```
在 `loadOnce` 内、`return {` 之前加：
```ts
    const promptRepo = await PromptTemplateRepository.load(vault, settings.promptDir);
```
在返回对象里加两字段（放 `associationCandidates` 之后）：
```ts
      workflowActions: promptRepo.all(),
      promptTemplatesPresent: promptRepo.present(),
      promptTemplatesSkipped: promptRepo.skipped(),
```

> 注：`settings.promptDir` 在 Task 5 加入 `DashboardSettings` 与 `DEFAULT_SETTINGS`。若先做本 Task，临时用 `'99-模板/codex-提示词'` 字面量，Task 5 完成后改回 `settings.promptDir`。推荐先做 Task 5 的 Step 1（加设置字段）再回本 Task。

- [ ] **Step 5: 跑全量数据测试 + typecheck**

Run: `npx vitest run tests/data/ && npx tsc --noEmit`
Expected: PASS（注意此时所有构造 `DashboardModel` 的测试 helper 需补两字段，见 Task 7 Step 1 也会改 `dashboard-modules.test.ts` 的 helper）

- [ ] **Step 6: commit**

```bash
git add src/domain/models.ts src/data/dashboard-data-service.ts tests/data/dashboard-data-service.test.ts
git commit -m "feat: inject workflow actions into dashboard model"
```

---

## Task 5: 设置扩展（promptDir + workflow tab）

**Files:**
- Modify: `src/settings.ts`
- Test: `tests/settings.test.ts`（扩展）

- [ ] **Step 1: 写失败测试**

在 `tests/settings.test.ts` 增：

```ts
it('promptDir 默认值与解析', () => {
  expect(DEFAULT_SETTINGS.promptDir).toBe('99-模板/codex-提示词');
  expect(parseSettings({ promptDir: '自定义/目录' }).promptDir).toBe('自定义/目录');
  expect(parseSettings({ promptDir: '   ' }).promptDir).toBe('99-模板/codex-提示词');
});

it('defaultTab 接受 workflow', () => {
  expect(parseSettings({ defaultTab: 'workflow' }).defaultTab).toBe('workflow');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/settings.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`DashboardSettings`：`defaultTab` 联合改为 `'overview' | 'tasks' | 'workflow' | 'data'`；新增 `promptDir: string`。
`DEFAULT_SETTINGS`：加 `promptDir: '99-模板/codex-提示词'`。
`parseSettings`：加 `promptDir: nonEmptyStringOr(values.promptDir, DEFAULT_SETTINGS.promptDir)`。
`DEFAULT_TABS`：`new Set(['overview', 'tasks', 'workflow', 'data'])`。
`TextSettingKey` 增 `'promptDir'`；`display()` 在模板项后加 `this.addText(t('settings.promptDir'), 'promptDir');`。
defaultTab 下拉 `addOptions` 增 `workflow: t('tab.workflow')`（放 tasks 与 data 之间）。

- [ ] **Step 4: 跑测试确认通过 + typecheck**

Run: `npx vitest run tests/settings.test.ts && npx tsc --noEmit`
Expected: PASS（`settings.promptDir`/`tab.workflow` 翻译键在 Task 6 加入；若此刻 typecheck 因 `TranslationKey` 缺键报错，先做 Task 6 再回来——推荐 Task 6、Task 5 相邻执行）

- [ ] **Step 5: commit**

```bash
git add src/settings.ts tests/settings.test.ts
git commit -m "feat: add promptDir setting and workflow tab option"
```

---

## Task 6: i18n（workflow.* 键）

**Files:**
- Modify: `src/i18n/translations.ts`
- Test: `tests/i18n/translations.test.ts`（已有"每个键都有 zh/en"的契约测试，加键即受其覆盖；如需可加针对性断言）

- [ ] **Step 1: 在 `TranslationKey` 联合类型加键**

在 `tab.data` 所在行加 `tab.workflow`；并新增一组：
```ts
  | 'tab.workflow'
  | 'settings.promptDir'
  | 'workflow.deckEmptyTitle' | 'workflow.deckEmptyBody' | 'workflow.seedButton'
  | 'workflow.groupGeneral' | 'workflow.copyButton' | 'workflow.openOutput'
  | 'workflow.focusContext' | 'workflow.needsFocus' | 'workflow.readonlyOutput'
  | 'workflow.copied' | 'workflow.copyFailed' | 'workflow.skippedNotice'
  | 'workflow.seeded' | 'workflow.seedFailed' | 'workflow.outputMissing'
```

- [ ] **Step 2: 在 `TRANSLATIONS` 对象加对应条目**

```ts
  'tab.workflow': { zh: '工作流', en: 'Workflow' },
  'settings.promptDir': { zh: '提示词模板目录', en: 'Prompt template folder' },
  'workflow.deckEmptyTitle': { zh: '还没有提示词模板', en: 'No prompt templates yet' },
  'workflow.deckEmptyBody': { zh: '生成一组默认提示词，即可一键驱动日常工作流。', en: 'Generate default prompts to drive your daily workflow.' },
  'workflow.seedButton': { zh: '生成默认提示词模板', en: 'Generate default prompts' },
  'workflow.groupGeneral': { zh: '通用', en: 'General' },
  'workflow.copyButton': { zh: '复制提示词', en: 'Copy prompt' },
  'workflow.openOutput': { zh: '打开输出位置', en: 'Open output' },
  'workflow.focusContext': { zh: '当前焦点：第{issue}期《{title}》· {stage}阶段', en: 'Focus: #{issue} {title} · {stage}' },
  'workflow.needsFocus': { zh: '需先设定焦点选题', en: 'Set a focus topic first' },
  'workflow.readonlyOutput': { zh: '只读·给结论，不写文件', en: 'Read-only · gives conclusions' },
  'workflow.copied': { zh: '已复制「{label}」提示词 · 预期输出 → {output}', en: 'Copied "{label}" · output → {output}' },
  'workflow.copyFailed': { zh: '复制失败，已写入临时文件：{path}', en: 'Copy failed; wrote temp file: {path}' },
  'workflow.skippedNotice': { zh: '已跳过格式不全的模板：{files}', en: 'Skipped malformed templates: {files}' },
  'workflow.seeded': { zh: '已生成默认提示词模板到 {dir}', en: 'Default prompts created in {dir}' },
  'workflow.seedFailed': { zh: '生成默认模板失败：{detail}', en: 'Failed to seed prompts: {detail}' },
  'workflow.outputMissing': { zh: '输出位置暂无文件，Codex 运行后再来查看', en: 'No output yet; check after Codex runs' },
```

- [ ] **Step 3: 跑契约测试 + typecheck**

Run: `npx vitest run tests/i18n/translations.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: commit**

```bash
git add src/i18n/translations.ts
git commit -m "feat: add workflow i18n keys"
```

---

## Task 7: 渲染器 `workflow-deck.ts` + 接入 dashboard-renderer

**Files:**
- Create: `src/ui/renderers/workflow-deck.ts`
- Modify: `src/ui/dashboard-renderer.ts`
- Test: `tests/ui/dashboard-modules.test.ts`（扩展）

- [ ] **Step 1: 更新测试 helper 并写失败测试**

在 `tests/ui/dashboard-modules.test.ts` 的 `model()` helper 补两字段：
```ts
    workflowActions: [],
    promptTemplatesPresent: false,
    promptTemplatesSkipped: [],
```
并在 `DashboardHandlers` 的 mock（该文件构造 handlers 处）补 `copyPrompt`、`openOutput`、`seedPromptTemplates` 三个 `vi.fn()`（与现有 handler mock 同风格）。新增用例：

```ts
import type { WorkflowAction } from '@/domain/workflow';

const evalAction: WorkflowAction = {
  id: 'eval', label: '批量评估', description: '给结论不改文件', group: '选题', order: 2,
  needsFocus: false, output: null, body: '评估 {{inbox_dir}}', sourcePath: 'x.md',
};
const scriptAction: WorkflowAction = {
  id: 'gen-script', label: '从选题生成脚本大纲', description: '', group: '策划', order: 1,
  needsFocus: true, output: '40-脚本大纲/草稿', body: '基于 {{focus_topic}}', sourcePath: 'y.md',
};

it('工作流 tab 渲染分组与按钮', () => {
  const root = new FakeElement('div');
  const handlers = makeHandlers(); // 该文件已有的 handlers 工厂
  new DashboardRenderer().render(
    root as unknown as HTMLElement,
    model({ workflowActions: [evalAction, scriptAction], promptTemplatesPresent: true, focus: { kind: 'none' } }),
    handlers, 'workflow' as DashboardTab, createTranslator('zh'),
  );
  expect(findByText(root, '批量评估')).not.toBeNull();
  expect(findByText(root, '从选题生成脚本大纲')).not.toBeNull();
  // 只读类（output=null）不渲染"打开输出位置"
  expect(findAll(root, 'button').filter((b) => b.textContent === '打开输出位置')).toHaveLength(1);
});

it('needs_focus 但无焦点时复制按钮禁用', () => {
  const root = new FakeElement('div');
  new DashboardRenderer().render(
    root as unknown as HTMLElement,
    model({ workflowActions: [scriptAction], promptTemplatesPresent: true, focus: { kind: 'none' } }),
    makeHandlers(), 'workflow' as DashboardTab, createTranslator('zh'),
  );
  const copy = findAll(root, 'button').find((b) => b.textContent === '复制提示词');
  expect(copy?.disabled).toBe(true);
});

it('无模板时渲染种子按钮', () => {
  const root = new FakeElement('div');
  new DashboardRenderer().render(
    root as unknown as HTMLElement,
    model({ workflowActions: [], promptTemplatesPresent: false }),
    makeHandlers(), 'workflow' as DashboardTab, createTranslator('zh'),
  );
  expect(findByText(root, '生成默认提示词模板')).not.toBeNull();
});
```

> 若该测试文件没有现成的 `makeHandlers` 工厂，按文件现有内联 handlers 写法构造一个本地 helper，确保含全部 `DashboardHandlers` 成员（含新增三个）。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/ui/dashboard-modules.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 `workflow-deck.ts`**

```ts
// src/ui/renderers/workflow-deck.ts
import type { DashboardModel } from '@/domain/models';
import { STAGES, type Stage } from '@/domain/stages';
import type { WorkflowAction, WorkflowGroup } from '@/domain/workflow';
import type { Translator } from '@/i18n/translator';

import type { DashboardHandlers } from '../dashboard-renderer';

export function renderWorkflowDeck(
  parent: HTMLElement,
  model: DashboardModel,
  handlers: DashboardHandlers,
  t: Translator,
): void {
  const section = parent.createEl('section', { cls: 'curiosity-section curiosity-workflow' });

  if (!model.promptTemplatesPresent) {
    renderEmpty(section, handlers, t);
    return;
  }

  if (model.promptTemplatesSkipped.length > 0) {
    section.createEl('p', {
      cls: 'curiosity-workflow-skipped',
      attr: { role: 'status' },
      text: t.t('workflow.skippedNotice', { files: model.promptTemplatesSkipped.join('、') }),
    });
  }

  const focusStage = currentFocusStage(model);
  if (focusStage !== null) {
    const topic = focusTopic(model);
    if (topic !== null) {
      section.createEl('p', {
        cls: 'curiosity-workflow-focus',
        text: t.t('workflow.focusContext', {
          issue: topic.issue, title: topic.title, stage: t.stageLabel(focusStage),
        }),
      });
    }
  }

  const groups: WorkflowGroup[] = [...STAGES, 'general'];
  for (const group of groups) {
    const actions = model.workflowActions.filter((a) => a.group === group);
    if (actions.length === 0) continue;
    const expanded = group === focusStage || (focusStage === null && group === 'general');
    renderGroup(section, group, actions, expanded, model, handlers, t);
  }
}

function renderGroup(
  parent: HTMLElement, group: WorkflowGroup, actions: WorkflowAction[], expanded: boolean,
  model: DashboardModel, handlers: DashboardHandlers, t: Translator,
): void {
  const details = parent.createEl('details', {
    cls: expanded ? 'curiosity-workflow-group is-focus' : 'curiosity-workflow-group',
  });
  if (expanded) details.setAttr('open', '');
  details.createEl('summary', { text: groupLabel(group, t) });
  const list = details.createDiv({ cls: 'curiosity-workflow-cards' });
  for (const action of actions) renderCard(list, action, model, handlers, t);
}

function renderCard(
  parent: HTMLElement, action: WorkflowAction, model: DashboardModel,
  handlers: DashboardHandlers, t: Translator,
): void {
  const card = parent.createDiv({ cls: 'curiosity-workflow-card' });
  card.createEl('h3', { text: action.label });
  if (action.description.length > 0) card.createEl('p', { text: action.description });

  const blockedNoFocus = action.needsFocus && focusTopic(model) === null;
  const buttons = card.createDiv({ cls: 'curiosity-workflow-actions' });

  const copy = buttons.createEl('button', {
    cls: 'curiosity-write-action', text: t.t('workflow.copyButton'), type: 'button',
    attr: { 'aria-label': blockedNoFocus ? t.t('workflow.needsFocus') : t.t('workflow.copyButton') },
  });
  copy.disabled = blockedNoFocus;
  if (blockedNoFocus) copy.setAttr('title', t.t('workflow.needsFocus'));
  else copy.addEventListener('click', () => void handlers.copyPrompt(action));

  if (action.output === null) {
    card.createEl('p', { cls: 'curiosity-workflow-readonly', text: t.t('workflow.readonlyOutput') });
  } else {
    const open = buttons.createEl('button', { text: t.t('workflow.openOutput'), type: 'button' });
    const output = action.output;
    open.addEventListener('click', () => void handlers.openOutput(output));
  }
}

function renderEmpty(parent: HTMLElement, handlers: DashboardHandlers, t: Translator): void {
  const empty = parent.createDiv({ cls: 'curiosity-workflow-empty' });
  empty.createEl('h3', { text: t.t('workflow.deckEmptyTitle') });
  empty.createEl('p', { text: t.t('workflow.deckEmptyBody') });
  const seed = empty.createEl('button', {
    cls: 'curiosity-write-action', text: t.t('workflow.seedButton'), type: 'button',
  });
  seed.disabled = handlers.dashboardReadOnly === true ? true : false;
  seed.addEventListener('click', () => void handlers.seedPromptTemplates());
}

function groupLabel(group: WorkflowGroup, t: Translator): string {
  return group === 'general' ? t.t('workflow.groupGeneral') : t.stageLabel(group);
}

function currentFocusStage(model: DashboardModel): Stage | null {
  return model.focus.kind === 'ready' ? model.focus.topic.stage : null;
}

function focusTopic(model: DashboardModel): DashboardModel['focus'] extends never ? never :
  (typeof model.focus extends { topic: infer T } ? T : null) | null {
  return (model.focus.kind === 'ready' || model.focus.kind === 'invalid-stage'
    ? model.focus.topic
    : null) as never;
}
```

> ⚠️ 上面 `focusTopic` 的返回类型写法过度复杂。改用简单签名（替换该函数）：
```ts
import type { TopicRecord } from '@/domain/models';
function focusTopic(model: DashboardModel): TopicRecord | null {
  return model.focus.kind === 'ready' || model.focus.kind === 'invalid-stage'
    ? model.focus.topic : null;
}
```
> `handlers.dashboardReadOnly` 字段：在 `DashboardHandlers` 不存在则去掉该判断，直接 `seed.disabled = false`（种子写入失败由 view 层 Notice 处理）。采用后者以减小耦合：删除 `renderEmpty` 里的 `seed.disabled` 那一行。

- [ ] **Step 4: 接入 `dashboard-renderer.ts`**

- `DashboardTab` 类型改 `'overview' | 'tasks' | 'workflow' | 'data'`。
- `DashboardHandlers` 接口增：
```ts
  copyPrompt(action: import('@/domain/workflow').WorkflowAction): Promise<void>;
  openOutput(path: string): Promise<void>;
  seedPromptTemplates(): Promise<void>;
```
- `tabsConfig` 在 tasks 与 data 之间插：`{ id: 'workflow', label: t.t('tab.workflow') }`。
- 顶部 import：`import { renderWorkflowDeck } from './renderers/workflow-deck';`
- panel 渲染分支加：
```ts
      } else if (id === 'workflow') {
        renderWorkflowDeck(panel, model, handlers, t);
      } else if (id === 'tasks') {
```
（即在现有 `if overview … else if tasks … else …` 链中，tasks 前插入 workflow 分支；末尾 `else` 仍是 data。）

- [ ] **Step 5: 跑测试确认通过 + typecheck**

Run: `npx vitest run tests/ui/dashboard-modules.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: commit**

```bash
git add src/ui/renderers/workflow-deck.ts src/ui/dashboard-renderer.ts tests/ui/dashboard-modules.test.ts
git commit -m "feat: render workflow deck tab"
```

---

## Task 8: 种子服务 `prompt-seed-service.ts`

**Files:**
- Create: `src/mutations/prompt-seed-service.ts`
- Test: `tests/mutations/prompt-seed-service.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/mutations/prompt-seed-service.test.ts
import { describe, expect, it } from 'vitest';

import { PromptSeedService } from '@/mutations/prompt-seed-service';

import { FakeVaultGateway } from '../support/fake-vault-gateway';

const DIR = '99-模板/codex-提示词';

describe('PromptSeedService', () => {
  it('写入全部默认模板并返回写入数', async () => {
    const gateway = new FakeVaultGateway();
    const written = await new PromptSeedService(gateway).seed(DIR);
    expect(written).toBeGreaterThanOrEqual(10);
    expect([...gateway.files.keys()].every((p) => p.startsWith(`${DIR}/`))).toBe(true);
    // 每个文件都含 frontmatter id 与 label
    for (const content of gateway.files.values()) {
      expect(content).toMatch(/^---[\s\S]*\bid:\s*\S/);
      expect(content).toMatch(/\blabel:\s*\S/);
    }
  });

  it('已存在的文件不覆盖（幂等）', async () => {
    const gateway = new FakeVaultGateway();
    await new PromptSeedService(gateway).seed(DIR);
    const sample = [...gateway.files.keys()][0];
    gateway.files.set(sample, '我自己改过的内容');
    const writtenSecond = await new PromptSeedService(gateway).seed(DIR);
    expect(writtenSecond).toBe(0);
    expect(gateway.files.get(sample)).toBe('我自己改过的内容');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/mutations/prompt-seed-service.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

模板内容直接取自 `00-入口/Codex自动化使用指南.md` 的措辞，转为带 frontmatter 的提示词。`create` 已对已存在路径抛错（见 `FakeVaultGateway.create`），故先 `exists` 判断实现幂等。

```ts
// src/mutations/prompt-seed-service.ts
import type { VaultGateway } from '@/ports/vault-gateway';

interface SeedTemplate {
  filename: string;
  frontmatter: { id: string; label: string; stage: string; order: number; needs_focus: boolean; output: string; description: string };
  body: string;
}

const TEMPLATES: SeedTemplate[] = [
  {
    filename: '1-收集灵感整理选题卡.md',
    frontmatter: { id: 'collect-ideas', label: '收集灵感 → 整理选题卡', stage: '选题', order: 1, needs_focus: false, output: '10-选题池/待评估', description: '把零散想法整理成标准选题卡' },
    body: '请把下面这些想法整理成 Obsidian 选题卡，放到 {{inbox_dir}}。\n每个选题使用 {{topic_template}} 的结构。\n不要写完整脚本，只做选题判断。\n\n想法：\n1. \n2. \n3. ',
  },
  {
    filename: '2-批量评估待评估选题.md',
    frontmatter: { id: 'evaluate-topics', label: '批量评估待评估选题', stage: '选题', order: 2, needs_focus: false, output: '', description: '只读·给结论，不写文件' },
    body: '请扫描 {{inbox_dir}} 下的选题卡，按受众明确、痛点强度、差异化、证据充分、制作成本打分。\n输出推荐立项的前 3 个，并说明原因。\n先不要移动文件。',
  },
  {
    filename: '3-从选题生成脚本大纲.md',
    frontmatter: { id: 'generate-outline', label: '从选题生成脚本大纲', stage: '策划', order: 1, needs_focus: true, output: '40-脚本大纲/草稿', description: '基于焦点选题创建大纲' },
    body: '请基于 {{focus_topic}} 创建一份脚本大纲，放到 {{script_draft_dir}}。\n使用 {{script_template}}。\n风格要求：适合 AI 编程初学者，口语化，先讲问题再给方案。',
  },
  {
    filename: '4-扩写脚本成稿.md',
    frontmatter: { id: 'expand-script', label: '扩写脚本成稿', stage: '策划', order: 2, needs_focus: true, output: '40-脚本大纲/成稿', description: '确认结构后再扩写' },
    body: '请基于脚本大纲 {{focus_script}} 继续扩写成稿。\n要求：\n- 口语化\n- 适合 5-8 分钟视频\n- 每段都说明画面建议\n- 不要加入未经验证的事实\n输出到 40-脚本大纲/成稿。',
  },
  {
    filename: '5-整理素材索引.md',
    frontmatter: { id: 'index-assets', label: '整理素材索引', stage: '制作', order: 1, needs_focus: false, output: '20-素材库/引用资料', description: '只做索引，不移动原文件' },
    body: '请根据素材目录里的文件，整理一份素材索引，放到 {{asset_dir}}/引用资料。\n标注每个素材可能适合哪些选题、是否适合做封面/演示/转场/证据。\n不要删除或移动原文件。',
  },
  {
    filename: '6-生成标题封面文案简介.md',
    frontmatter: { id: 'generate-publish-assets', label: '生成标题/封面文案/简介', stage: '制作', order: 2, needs_focus: true, output: '50-制作中/发布素材', description: '脚本基本确定后做发布素材' },
    body: '请基于脚本 {{focus_script}} 生成：\n1. 10 个标题候选\n2. 5 个封面文案\n3. 1 版视频简介\n4. 5 个标签\n\n要求：标题不要夸大，不制造虚假焦虑，适合 AI 编程初学者。\n输出到 50-制作中/发布素材/第{{focus_issue}}期-发布素材.md。',
  },
  {
    filename: '7-发布后做复盘.md',
    frontmatter: { id: 'post-review', label: '发布后做复盘', stage: '复盘', order: 1, needs_focus: true, output: '60-发布复盘', description: '把数据和评论交给 Codex' },
    body: '请根据下面的数据，为焦点选题《{{focus_title}}》创建发布复盘，放到 {{review_dir}}。\n使用 {{review_template}}。\n重点分析：标题是否有效、评论区暴露了什么新需求、下一条内容怎么延展。\n\n数据：\n- 发布时间：\n- 播放量：\n- 点赞：\n- 收藏：\n- 评论：\n- 链接：\n\n典型评论：\n1. \n2. \n3. ',
  },
  {
    filename: '8-沉淀长期知识.md',
    frontmatter: { id: 'distill-knowledge', label: '沉淀长期知识', stage: '复盘', order: 2, needs_focus: true, output: '70-长期知识', description: '抽出可长期复用的结论' },
    body: '请阅读焦点选题 {{focus_topic}}、其脚本与复盘，提炼可长期复用的内容方法论或 AI 编程知识，放到 70-长期知识。\n不要重复原稿，只沉淀结论、原则和例子。',
  },
  {
    filename: '9-联网核验热点.md',
    frontmatter: { id: 'verify-hotspots', label: '🌐 联网核验热点', stage: 'general', order: 1, needs_focus: false, output: '30-竞品热点/热点观察', description: '热点类内容一定要核验' },
    body: '请联网核验最近 7 天 AI 编程工具相关热点，只使用官方文档、发布公告或可信来源。\n把适合做视频的内容整理到 30-竞品热点/热点观察。\n每条都附来源链接、发布日期和为什么适合做选题。',
  },
  {
    filename: '10-周复盘.md',
    frontmatter: { id: 'weekly-review', label: '📅 周复盘', stage: 'general', order: 2, needs_focus: false, output: '00-入口/每日记录', description: '汇总一周知识库变化' },
    body: '请汇总本周知识库变化，范围：{{topic_dir}}、{{script_draft_dir}}、{{review_dir}}。\n输出：\n1. 本周新增选题\n2. 推荐下周优先做的 3 个选题\n3. 当前内容方向的风险\n4. 下一步行动清单\n生成到 00-入口/每日记录/本周复盘-{{date}}.md。',
  },
];

export class PromptSeedService {
  constructor(private readonly vault: VaultGateway) {}

  async seed(promptDir: string): Promise<number> {
    const dir = promptDir.replace(/\\/g, '/').replace(/\/+$/, '');
    let written = 0;
    for (const template of TEMPLATES) {
      const path = `${dir}/${template.filename}`;
      if (this.vault.exists(path)) continue;
      await this.vault.create(path, render(template));
      written += 1;
    }
    return written;
  }
}

function render(template: SeedTemplate): string {
  const f = template.frontmatter;
  const front = [
    '---',
    `id: ${f.id}`,
    `label: ${f.label}`,
    `stage: ${f.stage}`,
    `order: ${f.order}`,
    `needs_focus: ${f.needs_focus}`,
    `output: "${f.output}"`,
    `description: ${f.description}`,
    '---',
  ].join('\n');
  return `${front}\n${template.body}\n`;
}
```

> 注：`vault.create` 在真实 Obsidian 中，父目录不存在会失败。`ObsidianVaultGateway.create` 用 `app.vault.create`；若 `99-模板/codex-提示词` 目录不存在需先建。**Task 9 的 view handler 在调用 seed 前用 `app.vault.adapter` 或 `app.vault.createFolder` 确保目录存在**（见 Task 9 Step 3 的目录保障）。`FakeVaultGateway` 不校验父目录，故单测无需建目录。

- [ ] **Step 4: 跑测试确认通过 + typecheck**

Run: `npx vitest run tests/mutations/prompt-seed-service.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add src/mutations/prompt-seed-service.ts tests/mutations/prompt-seed-service.test.ts
git commit -m "feat: add prompt seed service with default templates"
```

---

## Task 9: view 接线（剪贴板 / 跳转输出 / 种子）

**Files:**
- Modify: `src/main.ts`（暴露 `promptSeedService()`，与现有 `templateService()` 同风格）
- Modify: `src/curiosity-dashboard-view.ts`（实现三个 handler）
- Test: 在 `tests/curiosity-dashboard-view.test.ts` 增针对 `copyPrompt`/`seedPromptTemplates` 的用例（沿用该文件已有的 app/plugin mock 风格）

- [ ] **Step 1: main.ts 暴露种子服务**

顶部 import：`import { PromptSeedService } from '@/mutations/prompt-seed-service';`
加方法（紧邻 `templateService()`）：
```ts
  promptSeedService(): PromptSeedService {
    return new PromptSeedService(this.gateway);
  }
```

- [ ] **Step 2: view 在 `renderModel` 的 handlers 对象里接三个 handler**

在 `this.renderer.render(this.contentEl, model, { ... }` 的 handler 字面量末尾加：
```ts
      copyPrompt: (action) => this.copyPrompt(action),
      openOutput: (path) => this.openOutput(path),
      seedPromptTemplates: () => this.seedPromptTemplates(),
```

- [ ] **Step 3: view 增三个私有方法**

```ts
  private async copyPrompt(action: import('@/domain/workflow').WorkflowAction): Promise<void> {
    if (this.lastModel === null) {
      new Notice(this.t.t('view.notLoadedCreate'));
      return;
    }
    const { buildPrompt } = await import('@/mutations/prompt-builder-service');
    const result = buildPrompt(action, this.lastModel, this.plugin.settings);
    try {
      await navigator.clipboard.writeText(result.text);
      new Notice(this.t.t('workflow.copied', {
        label: result.label, output: result.output ?? this.t.t('workflow.readonlyOutput'),
      }));
    } catch {
      // 回退：写入临时文件并打开
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

  private async openOutput(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.openPath(path);
      return;
    }
    if (file instanceof TFolder) {
      const revealed = this.revealFolder(file);
      if (!revealed) new Notice(this.t.t('workflow.outputMissing'));
      return;
    }
    new Notice(this.t.t('workflow.outputMissing'));
  }

  private revealFolder(folder: TFolder): boolean {
    try {
      const explorer = (this.app as typeof this.app & {
        internalPlugins?: { getPluginById?: (id: string) => { instance?: { revealInFolder?: (f: unknown) => void } } | null };
      }).internalPlugins?.getPluginById?.('file-explorer');
      const reveal = explorer?.instance?.revealInFolder;
      if (typeof reveal !== 'function') return false;
      reveal.call(explorer.instance, folder);
      return true;
    } catch {
      return false;
    }
  }

  private async seedPromptTemplates(): Promise<void> {
    if (this.rejectReadOnlyWrite()) return;
    try {
      const dir = this.plugin.settings.promptDir;
      if (this.app.vault.getAbstractFileByPath(dir) === null) {
        await this.app.vault.createFolder(dir);
      }
      await this.plugin.promptSeedService().seed(dir);
      new Notice(this.t.t('workflow.seeded', { dir }));
      await this.refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : this.t.t('common.unknownError');
      new Notice(this.t.t('workflow.seedFailed', { detail }));
    }
  }
```

顶部 import 增 `TFolder`：把 `import { ItemView, Notice, Platform, type WorkspaceLeaf } from 'obsidian';` 改为含 `TFile, TFolder`：
```ts
import { ItemView, Notice, Platform, TFile, TFolder, type WorkspaceLeaf } from 'obsidian';
```
（`tests` 用的 obsidian mock 需补 `TFile`/`TFolder` 导出 —— 见 Step 4。）

- [ ] **Step 4: 测试 obsidian mock 补类 + 写用例**

确认 `tests/curiosity-dashboard-view.test.ts` 的 `vi.mock('obsidian', ...)` 导出含 `TFile`、`TFolder`（class 占位即可），并提供 `navigator.clipboard.writeText` mock。新增：

```ts
it('copyPrompt 写入剪贴板并提示', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(globalThis, { navigator: { clipboard: { writeText } } });
  // 构造 view + lastModel（含一个 workflowAction），触发 copyPrompt
  // 断言 writeText 被调用、Notice 文本含 label
  expect(writeText).toHaveBeenCalledTimes(1);
});
```

> 该文件已有 view 实例化与 model 注入的脚手架；按其现有风格补全此用例。若实例化成本过高，可将 `copyPrompt` 的纯逻辑（已在 `buildPrompt` 测过）视为主要覆盖，view 用例只验证"调用了 clipboard 且发了 Notice"。

- [ ] **Step 5: 跑相关测试 + typecheck**

Run: `npx vitest run tests/curiosity-dashboard-view.test.ts tests/main.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: commit**

```bash
git add src/main.ts src/curiosity-dashboard-view.ts tests/curiosity-dashboard-view.test.ts
git commit -m "feat: wire workflow handlers (clipboard, open output, seed) in view"
```

---

## Task 10: 样式 + 全量验证 + 部署

**Files:**
- Modify: `styles.css`
- Test: `tests/styles.test.ts`（若有"关键 class 存在"契约，补 workflow class）

- [ ] **Step 1: 加样式**

在 `styles.css` 末尾追加（沿用现有设计 token / 变量；与 `.curiosity-quick-actions`、`.curiosity-section` 视觉一致）：

```css
.curiosity-workflow-focus { opacity: .85; margin: 0 0 .75rem; font-size: .9em; }
.curiosity-workflow-skipped { color: var(--text-warning); font-size: .8em; margin: 0 0 .6rem; }
.curiosity-workflow-group { margin-bottom: .5rem; }
.curiosity-workflow-group.is-focus > summary { font-weight: 600; }
.curiosity-workflow-group > summary { cursor: pointer; padding: .35rem 0; }
.curiosity-workflow-cards { display: grid; gap: .6rem; padding: .4rem 0 .6rem; }
.curiosity-workflow-card { border: 1px solid var(--background-modifier-border); border-radius: 10px; padding: .7rem .8rem; background: var(--background-secondary); }
.curiosity-workflow-card h3 { margin: 0 0 .25rem; font-size: 1em; }
.curiosity-workflow-card p { margin: 0 0 .5rem; opacity: .8; font-size: .85em; }
.curiosity-workflow-actions { display: flex; gap: .5rem; flex-wrap: wrap; }
.curiosity-workflow-readonly { font-size: .8em; opacity: .7; margin-top: .4rem; }
.curiosity-workflow-empty { text-align: center; padding: 1.5rem 1rem; }
```

- [ ] **Step 2: 若 `tests/styles.test.ts` 有 class 契约，补充断言**

按该文件现有断言风格，加对 `.curiosity-workflow-card` 等关键 class 存在性的检查（若该文件不做此类校验则跳过）。

- [ ] **Step 3: 全量验证**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全部 PASS（现有 349+ 测试 + 新增用例）

- [ ] **Step 4: 构建产物**

Run: `node esbuild.config.mjs production`（或 `package.json` 中的 build 脚本，先 `cat package.json` 确认脚本名）
Expected: 生成/更新 `main.js`，无错误

- [ ] **Step 5: 部署到 vault 插件目录**

把构建产物同步到启用目录（与现有发布流程一致）：
```bash
cp main.js styles.css manifest.json "F:/JCloudLab/IROL/自媒体选题/.obsidian/plugins/curiosity-dashboard/"
```
（若仓库有 `scripts/` 下的部署脚本，优先用它；先 `ls scripts/` 确认。）

- [ ] **Step 6: data.json 可选切换默认 tab**

如需打开即落在工作流页，把 vault 插件目录 `data.json` 的 `defaultTab` 改为 `"workflow"`（用户偏好，非必须）。

- [ ] **Step 7: 最终 commit**

```bash
git add styles.css tests/styles.test.ts
git commit -m "feat: style workflow deck and finalize cockpit"
```

---

## 验收清单

- [ ] 「工作流」tab 出现在 概览/任务 之后、数据 之前。
- [ ] 首次进入若无模板 → 显示「生成默认提示词模板」，点击后在 `99-模板/codex-提示词/` 生成 10 个文件且 tab 刷新出卡片。
- [ ] 焦点选题所在阶段组自动展开高亮；其余折叠。
- [ ] 点「复制提示词」→ 占位符按当前焦点/目录/日期填好 → 剪贴板可粘进 Codex；Toast 显示预期输出位置。
- [ ] `needs_focus` 动作在无焦点时按钮禁用并有 aria 提示。
- [ ] 只读类动作（无 output）不显示「打开输出位置」。
- [ ] 「打开输出位置」：文件则打开，目录则在文件浏览器定位，空则 Notice 提示。
- [ ] 编辑 `99-模板/codex-提示词/*.md` 后刷新，卡片与提示词内容随之变化（无需重编译）。
- [ ] `npx tsc --noEmit` 与 `npx vitest run` 全绿；产物部署到 vault 插件目录。
