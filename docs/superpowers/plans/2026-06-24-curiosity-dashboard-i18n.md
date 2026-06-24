# Curiosity Dashboard 中英文切换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Curiosity Dashboard 插件新增"界面语言"设置（跟随 Obsidian / 中文 / English），使设置面板与仪表盘的界面文案随之切换，且不触碰任何与 vault 数据绑定的值。

**Architecture:** 新建 `src/i18n/`（locale 解析 + 翻译目录 + translator）。`DashboardSettings` 增 `language` 字段。translator 经由依赖注入逐层传入 `DashboardSettingTab`、`CuriosityDashboardView`、`DashboardRenderer` 及各渲染器/Modal。语言改变复用既有 `saveSettings() → scheduleRefresh()` 链路触发重绘。阶段名等数据值通过 `stageLabel()` 仅在"显示时"映射，存储/比较值不变。

**Tech Stack:** TypeScript、Obsidian API、vitest（+ 既有 fake-dom / fake-vault-gateway）、esbuild。

> **Git 约定（用户全局指令）：** 本计划不执行任何 git 提交/分支操作。每个任务以"验证"步骤收尾（typecheck + 相关测试）。如需提交，由用户另行指示。

> **关键约束：** 测试环境中 `window.localStorage.getItem('language')` 为 `null`，`'auto'` 会解析为 `en`。因此**所有渲染/Modal 测试必须显式传入 `createTranslator('zh')`** 才能保住既有中文断言。涉及"品牌标题"和"dock 标签"的断言在 zh 下会变为中文，需按本计划更新预期值。

---

## File Structure

**新建：**
- `src/i18n/locale.ts` — `Locale`/`LanguageSetting` 类型；`resolveLocale(setting, obsidianLang)`。
- `src/i18n/translations.ts` — `TranslationKey` 联合类型；`TRANSLATIONS` 目录；`STAGE_LABELS`。
- `src/i18n/translator.ts` — `Translator` 接口；`createTranslator(locale)`。
- `tests/i18n/locale.test.ts`、`tests/i18n/translations.test.ts`、`tests/i18n/translator.test.ts`。

**修改：**
- `src/settings.ts` — 增 `language`；面板用 translator + 语言下拉。
- `src/main.ts` — 增 `translator()`；`reportError` 用 i18n。
- `src/curiosity-dashboard-view.ts` — 状态/Notice/heading 用 translator；render 传 translator。
- `src/ui/dashboard-renderer.ts` — `render` 增 `translator` 形参；tab 标签 i18n。
- `src/ui/renderers/{hero,mission-control,this-week,production-queue,channel-pulse,quick-actions,dock}.ts` — 文案 i18n。
- `src/ui/{confirm-stage-modal,create-file-modal}.ts` — 文案 i18n。
- 既有测试：`tests/settings.test.ts`、`tests/ui/dashboard-modules.test.ts`、`tests/ui/dashboard-renderer.test.ts`、`tests/ui/modals.test.ts`、`tests/curiosity-dashboard-view.test.ts` — 适配 translator 注入与变更后的预期值。

**保持不变（数据值）：** `domain/stages.ts` 的 `STAGES`、`domain/checklist.ts` heading、`data/*` 匹配串、`domain/review-table.ts` 别名/heading 匹配、`template-creation-service.ts` 正则、`create-file-modal` 默认标题 `'新选题'`（作为新文件名内容，属数据）。

---

## Task 1: i18n locale 解析

**Files:**
- Create: `src/i18n/locale.ts`
- Test: `tests/i18n/locale.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/i18n/locale.test.ts`：
```ts
import { describe, expect, it } from 'vitest';

import { resolveLocale } from '@/i18n/locale';

describe('resolveLocale', () => {
  it('returns the explicit locale when not auto', () => {
    expect(resolveLocale('zh', 'en')).toBe('zh');
    expect(resolveLocale('en', 'zh')).toBe('en');
  });

  it('auto follows a Chinese Obsidian language', () => {
    expect(resolveLocale('auto', 'zh')).toBe('zh');
    expect(resolveLocale('auto', 'zh-TW')).toBe('zh');
    expect(resolveLocale('auto', 'zh-CN')).toBe('zh');
  });

  it('auto falls back to English for non-Chinese or missing language', () => {
    expect(resolveLocale('auto', 'en')).toBe('en');
    expect(resolveLocale('auto', 'fr')).toBe('en');
    expect(resolveLocale('auto', '')).toBe('en');
    expect(resolveLocale('auto', null)).toBe('en');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/i18n/locale.test.ts`
Expected: FAIL（找不到模块 `@/i18n/locale`）。

- [ ] **Step 3: 实现 `locale.ts`**

```ts
export type Locale = 'zh' | 'en';
export type LanguageSetting = 'auto' | 'zh' | 'en';

export function resolveLocale(
  setting: LanguageSetting,
  obsidianLang: string | null,
): Locale {
  if (setting !== 'auto') return setting;
  return typeof obsidianLang === 'string' && obsidianLang.toLowerCase().startsWith('zh')
    ? 'zh'
    : 'en';
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/i18n/locale.test.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 5: 验证**

Run: `npm run typecheck`
Expected: 无错误。

---

## Task 2: 翻译目录 translations.ts

**Files:**
- Create: `src/i18n/translations.ts`
- Test: `tests/i18n/translations.test.ts`

> 本文件是全部界面文案的**单一事实来源**（DRY）。token 形如 `{name}`，由 translator 在 Task 3 中替换。`STAGE_LABELS` 按 locale 映射阶段显示名（zh 为恒等，en 为英文）。

- [ ] **Step 1: 写失败测试**

`tests/i18n/translations.test.ts`：
```ts
import { describe, expect, it } from 'vitest';

import { STAGE_LABELS, TRANSLATIONS, type TranslationKey } from '@/i18n/translations';
import { STAGES } from '@/domain/stages';

describe('TRANSLATIONS catalog', () => {
  it('provides non-empty zh and en for every key', () => {
    for (const key of Object.keys(TRANSLATIONS) as TranslationKey[]) {
      expect(TRANSLATIONS[key].zh.length, `${key}.zh`).toBeGreaterThan(0);
      expect(TRANSLATIONS[key].en.length, `${key}.en`).toBeGreaterThan(0);
    }
  });

  it('maps every stage in both locales', () => {
    for (const stage of STAGES) {
      expect(STAGE_LABELS.zh[stage]).toBe(stage);
      expect(STAGE_LABELS.en[stage].length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/i18n/translations.test.ts`
Expected: FAIL（找不到模块）。

- [ ] **Step 3: 实现 `translations.ts`**

```ts
import type { Locale } from './locale';
import { type Stage } from '@/domain/stages';

export type TranslationKey =
  | 'settings.heading'
  | 'settings.topicDir' | 'settings.scriptDir' | 'settings.assetDir' | 'settings.reviewDir'
  | 'settings.topicTemplate' | 'settings.scriptTemplate' | 'settings.reviewTemplate'
  | 'settings.backgroundPath' | 'settings.openOnStartup' | 'settings.defaultTab'
  | 'settings.enableMobileView'
  | 'settings.language' | 'settings.language.auto' | 'settings.language.zh' | 'settings.language.en'
  | 'settings.saveFailed'
  | 'common.unknownError' | 'common.unset' | 'common.cancel' | 'common.create'
  | 'common.mobileReadonlyMode' | 'common.mobileReadonlyCreateFile'
  | 'common.unavailableMobileReadonly' | 'common.unavailableReason' | 'common.unknownReason'
  | 'common.labelPath' | 'common.contextDetail'
  | 'stage.unknown'
  | 'tab.overview' | 'tab.tasks' | 'tab.data' | 'tabs.aria'
  | 'link.topicCard' | 'link.script' | 'link.asset' | 'link.review'
  | 'action.createTopicCard' | 'action.createScript' | 'action.createReview'
  | 'action.openScript' | 'action.openReview'
  | 'overflow.items'
  | 'hero.menuAria' | 'hero.brand' | 'hero.context' | 'hero.kicker' | 'hero.title'
  | 'hero.noFocus' | 'hero.openSettings' | 'hero.multipleTitle' | 'hero.multipleMessage'
  | 'hero.issuePill' | 'hero.currentStageLabel' | 'hero.nextActionLabel' | 'hero.nextActionUnset'
  | 'hero.openScript' | 'hero.viewTopic'
  | 'hero.mobileReadonlyCreateScript' | 'hero.createScriptDisabledAria'
  | 'mission.title' | 'mission.issue' | 'mission.advance'
  | 'mission.invalidStageTitle' | 'mission.terminalStageTitle'
  | 'mission.mobileReadonlyHelp' | 'mission.invalidStageHelp' | 'mission.terminalStageHelp'
  | 'mission.stageTrackAria' | 'mission.tasksTitle' | 'mission.tasksEmpty'
  | 'mission.quickLook' | 'mission.multipleCandidates'
  | 'thisWeek.title' | 'thisWeek.empty'
  | 'queue.title' | 'queue.empty'
  | 'pulse.title' | 'pulse.empty' | 'pulse.sourceButton' | 'pulse.sourceButtonAria'
  | 'pulse.noSource' | 'pulse.commentsTitle' | 'pulse.commentsEmpty' | 'pulse.tableCaption'
  | 'pulse.overflowComments' | 'pulse.overflowRows'
  | 'pulse.col.platform' | 'pulse.col.collectedAt' | 'pulse.col.views' | 'pulse.col.likes'
  | 'pulse.col.favorites' | 'pulse.col.comments' | 'pulse.col.shares'
  | 'quickActions.title' | 'quickActions.readonlyReason'
  | 'dock.ideas' | 'dock.mission' | 'dock.tasks' | 'dock.script' | 'dock.data'
  | 'dock.review' | 'dock.settings' | 'dock.aria'
  | 'dock.reason.mobileCreateTopic' | 'dock.reason.noFocus'
  | 'dock.reason.mobileCreate' | 'dock.reason.notLinked'
  | 'confirmStage.title' | 'confirmStage.terminal' | 'confirmStage.prompt' | 'confirmStage.confirm'
  | 'createFile.issue' | 'createFile.title' | 'createFile.targetPath'
  | 'createFile.errIssue' | 'createFile.errTitleEmpty' | 'createFile.errTitleInvalid'
  | 'createFile.errPathEmpty' | 'createFile.errPathExt'
  | 'modal.createTopicHeading' | 'modal.createScriptHeading' | 'modal.createReviewHeading'
  | 'view.loadingTitle' | 'view.loadingBody' | 'view.errorTitle' | 'view.retry'
  | 'view.mobileDisabledTitle' | 'view.mobileDisabledBody' | 'view.unknownLoadError'
  | 'view.openFileFailed' | 'view.toggleTaskFailed' | 'view.advanceFailed'
  | 'view.notLoadedCreate' | 'view.focusChangedCreate' | 'view.focusChangedCancel'
  | 'view.stateChangedCancel' | 'view.templateMissingOpened' | 'view.templateMissingManual'
  | 'view.createFailed' | 'view.verifyFocusFailed' | 'view.focusChangedNotLinked'
  | 'view.linkFailed' | 'view.openFailedDetail' | 'view.refreshFailedDetail'
  | 'view.partialResult' | 'view.linkedSuffix' | 'view.detailJoin'
  | 'view.saveTabFailed' | 'view.saveAssociationFailed' | 'view.mobileReadonlyModify'
  | 'view.noSettingsEntry' | 'view.openSettingsFailed'
  | 'error.autoRefreshFailed' | 'error.openFailed' | 'error.openOnStartupFailed';

export const TRANSLATIONS: Record<TranslationKey, Record<Locale, string>> = {
  'settings.heading': { zh: 'Curiosity Dashboard', en: 'Curiosity Dashboard' },
  'settings.topicDir': { zh: '选题目录', en: 'Topic directory' },
  'settings.scriptDir': { zh: '脚本目录', en: 'Script directory' },
  'settings.assetDir': { zh: '素材目录', en: 'Asset directory' },
  'settings.reviewDir': { zh: '复盘目录', en: 'Review directory' },
  'settings.topicTemplate': { zh: '选题卡模板', en: 'Topic template' },
  'settings.scriptTemplate': { zh: '脚本模板', en: 'Script template' },
  'settings.reviewTemplate': { zh: '复盘模板', en: 'Review template' },
  'settings.backgroundPath': { zh: '背景图片', en: 'Background image' },
  'settings.openOnStartup': { zh: '启动时打开', en: 'Open on startup' },
  'settings.defaultTab': { zh: '默认标签页', en: 'Default tab' },
  'settings.enableMobileView': { zh: '启用移动端简化视图', en: 'Enable simplified mobile view' },
  'settings.language': { zh: '界面语言', en: 'Language' },
  'settings.language.auto': { zh: '跟随 Obsidian', en: 'Follow Obsidian' },
  'settings.language.zh': { zh: '中文', en: '中文' },
  'settings.language.en': { zh: 'English', en: 'English' },
  'settings.saveFailed': {
    zh: '无法保存 Curiosity Dashboard 设置：{detail}',
    en: 'Failed to save Curiosity Dashboard settings: {detail}',
  },
  'common.unknownError': { zh: '未知错误', en: 'Unknown error' },
  'common.unset': { zh: '未设置', en: 'Not set' },
  'common.cancel': { zh: '取消', en: 'Cancel' },
  'common.create': { zh: '创建', en: 'Create' },
  'common.mobileReadonlyMode': { zh: '移动端为只读模式', en: 'Read-only on mobile' },
  'common.mobileReadonlyCreateFile': {
    zh: '移动端只读，不能创建文件', en: 'Read-only on mobile; cannot create files',
  },
  'common.unavailableMobileReadonly': {
    zh: '{label}（不可用：移动端只读）', en: '{label} (unavailable: read-only on mobile)',
  },
  'common.unavailableReason': {
    zh: '{label}（不可用：{reason}）', en: '{label} (unavailable: {reason})',
  },
  'common.unknownReason': { zh: '未知原因', en: 'unknown reason' },
  'common.labelPath': { zh: '{label}：{path}', en: '{label}: {path}' },
  'common.contextDetail': { zh: '{context}：{detail}', en: '{context}: {detail}' },
  'stage.unknown': { zh: '未知阶段', en: 'Unknown stage' },
  'tab.overview': { zh: '概览', en: 'Overview' },
  'tab.tasks': { zh: '任务', en: 'Tasks' },
  'tab.data': { zh: '数据', en: 'Data' },
  'tabs.aria': { zh: '工作台视图', en: 'Dashboard views' },
  'link.topicCard': { zh: '选题卡', en: 'Topic card' },
  'link.script': { zh: '脚本', en: 'Script' },
  'link.asset': { zh: '素材', en: 'Asset' },
  'link.review': { zh: '复盘', en: 'Review' },
  'action.createTopicCard': { zh: '创建选题卡', en: 'Create topic card' },
  'action.createScript': { zh: '创建脚本', en: 'Create script' },
  'action.createReview': { zh: '创建复盘', en: 'Create review' },
  'action.openScript': { zh: '打开脚本', en: 'Open script' },
  'action.openReview': { zh: '打开复盘', en: 'Open review' },
  'overflow.items': { zh: '另有 {count} 项', en: '{count} more' },
  'hero.menuAria': { zh: '内容工作室菜单栏', en: 'Content Studio menu bar' },
  'hero.brand': { zh: '内容工作室', en: 'Content Studio' },
  'hero.context': { zh: '本地 Markdown 工作区', en: 'Local Markdown Workspace' },
  'hero.kicker': { zh: '当前任务', en: 'CURRENT MISSION' },
  'hero.title': { zh: '追逐你的好奇心', en: 'Chase your curiosity' },
  'hero.noFocus': { zh: '尚未设置当前作品。', en: 'No current work set yet.' },
  'hero.openSettings': { zh: '打开插件设置', en: 'Open plugin settings' },
  'hero.multipleTitle': { zh: '检测到多个当前作品', en: 'Multiple current works detected' },
  'hero.multipleMessage': {
    zh: '请只保留一个 homepage_focus: true，然后刷新工作台。',
    en: 'Keep only one homepage_focus: true, then refresh the dashboard.',
  },
  'hero.issuePill': { zh: '第 {issue} 期', en: 'ISSUE {issue}' },
  'hero.currentStageLabel': { zh: '当前阶段', en: 'CURRENT STAGE' },
  'hero.nextActionLabel': { zh: '下一步', en: 'NEXT ACTION' },
  'hero.nextActionUnset': { zh: '下一步未设置', en: 'Next action not set' },
  'hero.openScript': { zh: '打开当前脚本', en: 'Open current script' },
  'hero.viewTopic': { zh: '查看选题卡', en: 'View topic card' },
  'hero.mobileReadonlyCreateScript': {
    zh: '移动端只读，不能创建脚本', en: 'Read-only on mobile; cannot create script',
  },
  'hero.createScriptDisabledAria': {
    zh: '创建脚本（不可用：移动端只读）', en: 'Create script (unavailable: read-only on mobile)',
  },
  'mission.title': { zh: '任务中心', en: 'Mission Control' },
  'mission.issue': { zh: '第 {issue} 期 — {title}', en: 'Issue {issue} — {title}' },
  'mission.advance': { zh: '推进阶段', en: 'Advance stage' },
  'mission.invalidStageTitle': { zh: '当前阶段无效，无法推进', en: 'Current stage is invalid; cannot advance' },
  'mission.terminalStageTitle': { zh: '复盘是终止阶段', en: 'Review is the terminal stage' },
  'mission.mobileReadonlyHelp': {
    zh: '移动端只读：任务、关联路径和阶段推进不可修改。',
    en: 'Read-only on mobile: tasks, association paths, and stage advancement cannot be changed.',
  },
  'mission.invalidStageHelp': {
    zh: '当前阶段无法识别；请修正选题卡中的 stage 后再推进。',
    en: 'Current stage is unrecognized; fix the stage in the topic card before advancing.',
  },
  'mission.terminalStageHelp': {
    zh: '当前已处于复盘终止阶段，无法继续推进。',
    en: 'Already at the terminal Review stage; cannot advance further.',
  },
  'mission.stageTrackAria': { zh: '制作阶段', en: 'Production stages' },
  'mission.tasksTitle': { zh: '本期执行清单', en: "This issue's checklist" },
  'mission.tasksEmpty': { zh: '未找到「本期执行清单」', en: '"This issue\'s checklist" not found' },
  'mission.quickLook': { zh: '快速查看', en: 'Quick Look' },
  'mission.multipleCandidates': {
    zh: '{label}存在多个候选，请选择：', en: 'Multiple {label} candidates; please choose:',
  },
  'thisWeek.title': { zh: '本周', en: 'This Week' },
  'thisWeek.empty': { zh: '本周暂无已设置截止日期的作品。', en: 'No works with a due date this week.' },
  'queue.title': { zh: '制作队列', en: 'Production Queue' },
  'queue.empty': { zh: '暂无后续制作队列。', en: 'No upcoming production queue.' },
  'pulse.title': { zh: '渠道脉搏', en: 'Channel Pulse' },
  'pulse.empty': { zh: '暂无可验证平台数据。', en: 'No verifiable platform data yet.' },
  'pulse.sourceButton': { zh: '数据来源：本地发布复盘', en: 'Source: local publish review' },
  'pulse.sourceButtonAria': {
    zh: '打开本地发布复盘：{path}', en: 'Open local publish review: {path}',
  },
  'pulse.noSource': { zh: '未关联本地发布复盘。', en: 'No linked local publish review.' },
  'pulse.commentsTitle': { zh: '评论区需求', en: 'Comment demands' },
  'pulse.commentsEmpty': { zh: '暂无可验证评论内容', en: 'No verifiable comments yet' },
  'pulse.tableCaption': {
    zh: '本地发布复盘中的平台数据', en: 'Platform data from the local publish review',
  },
  'pulse.overflowComments': { zh: '另有 {count} 条评论', en: '{count} more comments' },
  'pulse.overflowRows': { zh: '另有 {count} 条平台数据', en: '{count} more platform rows' },
  'pulse.col.platform': { zh: '平台', en: 'Platform' },
  'pulse.col.collectedAt': { zh: '采集时间', en: 'Collected at' },
  'pulse.col.views': { zh: '播放/观看', en: 'Views' },
  'pulse.col.likes': { zh: '点赞', en: 'Likes' },
  'pulse.col.favorites': { zh: '收藏', en: 'Favorites' },
  'pulse.col.comments': { zh: '评论', en: 'Comments' },
  'pulse.col.shares': { zh: '分享', en: 'Shares' },
  'quickActions.title': { zh: '快捷操作', en: 'Quick Actions' },
  'quickActions.readonlyReason': {
    zh: '移动端只读：创建操作不可用。', en: 'Read-only on mobile: creation actions unavailable.',
  },
  'dock.ideas': { zh: '灵感', en: 'Ideas' },
  'dock.mission': { zh: '作品', en: 'Mission' },
  'dock.tasks': { zh: '任务', en: 'Tasks' },
  'dock.script': { zh: '脚本', en: 'Script' },
  'dock.data': { zh: '数据', en: 'Data' },
  'dock.review': { zh: '复盘', en: 'Review' },
  'dock.settings': { zh: '设置', en: 'Settings' },
  'dock.aria': { zh: '工作台快捷入口', en: 'Dashboard shortcuts' },
  'dock.reason.mobileCreateTopic': {
    zh: '移动端只读，不能创建选题卡', en: 'Read-only on mobile; cannot create topic card',
  },
  'dock.reason.noFocus': { zh: '未设置当前作品', en: 'No current work set' },
  'dock.reason.mobileCreate': {
    zh: '移动端只读，不能创建{what}', en: 'Read-only on mobile; cannot create {what}',
  },
  'dock.reason.notLinked': { zh: '当前作品未关联{what}', en: 'Current work has no linked {what}' },
  'confirmStage.title': { zh: '推进制作阶段', en: 'Advance production stage' },
  'confirmStage.terminal': { zh: '当前已经是最终阶段。', en: 'Already at the final stage.' },
  'confirmStage.prompt': { zh: '从「{from}」推进到「{to}」？', en: 'Advance from "{from}" to "{to}"?' },
  'confirmStage.confirm': { zh: '推进', en: 'Advance' },
  'createFile.issue': { zh: '期数', en: 'Issue' },
  'createFile.title': { zh: '标题', en: 'Title' },
  'createFile.targetPath': { zh: '目标路径', en: 'Target path' },
  'createFile.errIssue': { zh: '期数必须是正安全整数。', en: 'Issue must be a positive safe integer.' },
  'createFile.errTitleEmpty': { zh: '标题不能为空。', en: 'Title cannot be empty.' },
  'createFile.errTitleInvalid': {
    zh: '标题不能生成有效文件名。', en: 'Title cannot produce a valid filename.',
  },
  'createFile.errPathEmpty': { zh: '目标路径不能为空。', en: 'Target path cannot be empty.' },
  'createFile.errPathExt': { zh: '目标路径必须以 .md 结尾。', en: 'Target path must end with .md.' },
  'modal.createTopicHeading': { zh: '创建选题卡', en: 'Create topic card' },
  'modal.createScriptHeading': { zh: '创建脚本', en: 'Create script' },
  'modal.createReviewHeading': { zh: '创建发布复盘', en: 'Create publish review' },
  'view.loadingTitle': { zh: '正在加载 Curiosity Dashboard', en: 'Loading Curiosity Dashboard' },
  'view.loadingBody': { zh: '正在读取本地 Markdown 数据…', en: 'Reading local Markdown data…' },
  'view.errorTitle': { zh: 'Dashboard 加载失败', en: 'Dashboard failed to load' },
  'view.retry': { zh: '重试', en: 'Retry' },
  'view.mobileDisabledTitle': { zh: '移动端视图已关闭', en: 'Mobile view disabled' },
  'view.mobileDisabledBody': {
    zh: '请在插件设置中启用移动端简化视图。', en: 'Enable simplified mobile view in plugin settings.',
  },
  'view.unknownLoadError': {
    zh: '读取本地数据时发生未知错误，请重试。',
    en: 'An unknown error occurred while reading local data; please retry.',
  },
  'view.openFileFailed': { zh: '无法打开文件', en: 'Unable to open file' },
  'view.toggleTaskFailed': { zh: '无法更新任务', en: 'Unable to update task' },
  'view.advanceFailed': { zh: '无法推进阶段', en: 'Unable to advance stage' },
  'view.notLoadedCreate': {
    zh: 'Dashboard 数据尚未加载，不能创建文件。', en: 'Dashboard data not loaded yet; cannot create files.',
  },
  'view.focusChangedCreate': {
    zh: '当前作品已变化，不能创建关联文件。', en: 'Current work changed; cannot create linked file.',
  },
  'view.focusChangedCancel': {
    zh: '当前作品已变化，已取消创建。', en: 'Current work changed; creation cancelled.',
  },
  'view.stateChangedCancel': {
    zh: 'Dashboard 状态已变化，已取消创建。', en: 'Dashboard state changed; creation cancelled.',
  },
  'view.templateMissingOpened': {
    zh: '创建失败：模板不存在：{path}。已打开插件设置。',
    en: 'Creation failed: template not found: {path}. Opened plugin settings.',
  },
  'view.templateMissingManual': {
    zh: '创建失败：模板缺失且无法自动打开，请手动打开设置：{path}。',
    en: 'Creation failed: template missing and could not auto-open; open settings manually: {path}.',
  },
  'view.createFailed': { zh: '创建失败', en: 'Creation failed' },
  'view.verifyFocusFailed': { zh: '无法核对当前作品：{detail}', en: 'Unable to verify current work: {detail}' },
  'view.focusChangedNotLinked': { zh: '当前作品已变化，文件未关联', en: 'Current work changed; file not linked' },
  'view.linkFailed': { zh: '关联失败：{detail}', en: 'Linking failed: {detail}' },
  'view.openFailedDetail': { zh: '无法打开：{detail}', en: 'Unable to open: {detail}' },
  'view.refreshFailedDetail': { zh: '无法刷新 Dashboard：{detail}', en: 'Unable to refresh Dashboard: {detail}' },
  'view.partialResult': { zh: '文件已创建{suffix}，但{details}', en: 'File created{suffix}, but {details}' },
  'view.linkedSuffix': { zh: '并关联', en: ' and linked' },
  'view.detailJoin': { zh: '；且', en: '; and ' },
  'view.saveTabFailed': { zh: '无法保存当前标签', en: 'Unable to save current tab' },
  'view.saveAssociationFailed': { zh: '无法保存关联路径', en: 'Unable to save association path' },
  'view.mobileReadonlyModify': { zh: '移动端只读，不能修改文件。', en: 'Read-only on mobile; cannot modify files.' },
  'view.noSettingsEntry': {
    zh: '当前 Obsidian 版本未提供设置入口', en: 'This Obsidian version provides no settings entry',
  },
  'view.openSettingsFailed': { zh: '无法打开插件设置', en: 'Unable to open plugin settings' },
  'error.autoRefreshFailed': { zh: 'Dashboard 自动刷新失败', en: 'Dashboard auto-refresh failed' },
  'error.openFailed': { zh: '无法打开 Curiosity Dashboard', en: 'Unable to open Curiosity Dashboard' },
  'error.openOnStartupFailed': {
    zh: '无法在启动时打开 Curiosity Dashboard', en: 'Unable to open Curiosity Dashboard on startup',
  },
};

export const STAGE_LABELS: Record<Locale, Record<Stage, string>> = {
  zh: { 选题: '选题', 策划: '策划', 制作: '制作', 发布: '发布', 复盘: '复盘' },
  en: { 选题: 'Topic', 策划: 'Plan', 制作: 'Produce', 发布: 'Publish', 复盘: 'Review' },
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/i18n/translations.test.ts`
Expected: PASS（2 个用例）。

- [ ] **Step 5: 验证**

Run: `npm run typecheck`
Expected: 无错误。

---

## Task 3: translator

**Files:**
- Create: `src/i18n/translator.ts`
- Test: `tests/i18n/translator.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/i18n/translator.test.ts`：
```ts
import { describe, expect, it } from 'vitest';

import { createTranslator } from '@/i18n/translator';

describe('createTranslator', () => {
  it('resolves static keys per locale', () => {
    expect(createTranslator('zh').t('mission.advance')).toBe('推进阶段');
    expect(createTranslator('en').t('mission.advance')).toBe('Advance stage');
  });

  it('interpolates {tokens} from params', () => {
    expect(createTranslator('en').t('overflow.items', { count: 3 })).toBe('3 more');
    expect(createTranslator('zh').t('overflow.items', { count: 3 })).toBe('另有 3 项');
    expect(createTranslator('en').t('common.labelPath', { label: 'Script', path: 'a/b.md' }))
      .toBe('Script: a/b.md');
  });

  it('maps stage labels and exposes the locale', () => {
    const en = createTranslator('en');
    expect(en.locale).toBe('en');
    expect(en.stageLabel('复盘')).toBe('Review');
    expect(createTranslator('zh').stageLabel('复盘')).toBe('复盘');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/i18n/translator.test.ts`
Expected: FAIL（找不到模块）。

- [ ] **Step 3: 实现 `translator.ts`**

```ts
import type { Stage } from '@/domain/stages';

import type { Locale } from './locale';
import { STAGE_LABELS, TRANSLATIONS, type TranslationKey } from './translations';

export type TranslationParams = Record<string, string | number>;

export interface Translator {
  readonly locale: Locale;
  t(key: TranslationKey, params?: TranslationParams): string;
  stageLabel(stage: Stage): string;
}

export function createTranslator(locale: Locale): Translator {
  return {
    locale,
    t(key, params) {
      const template = TRANSLATIONS[key][locale];
      if (params === undefined) return template;
      return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match);
    },
    stageLabel(stage) {
      return STAGE_LABELS[locale][stage];
    },
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/i18n/translator.test.ts`
Expected: PASS（3 个用例）。

- [ ] **Step 5: 验证**

Run: `npm run typecheck`
Expected: 无错误。

---

## Task 4: 设置数据模型增 `language`

**Files:**
- Modify: `src/settings.ts`
- Test: `tests/settings.test.ts`

- [ ] **Step 1: 扩展失败测试**

在 `tests/settings.test.ts` 中：
1. `'provides the complete default dashboard settings'` 用例的 `toEqual` 对象增 `language: 'auto',`。
2. `'accepts valid runtime settings'` 用例的 `settings` 对象增 `language: 'en',`（置于 `enableMobileView` 后）。
3. `'falls back per field...'` 第二段非法值对象增 `language: 'fr',`，预期回落到 `DEFAULT_SETTINGS`（已含 `language: 'auto'`）。
4. 新增用例：
```ts
it('falls back language to auto for invalid values', () => {
  expect(parseSettings({ language: 'fr' }).language).toBe('auto');
  expect(parseSettings({ language: 5 }).language).toBe('auto');
  expect(parseSettings({ language: 'zh' }).language).toBe('zh');
  expect(parseSettings({ language: 'en' }).language).toBe('en');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/settings.test.ts`
Expected: FAIL（`language` 缺失/不匹配）。

- [ ] **Step 3: 修改 `settings.ts`（仅数据模型部分，UI 在 Task 6）**

`DashboardSettings` 接口增字段：
```ts
  enableMobileView: boolean;
  language: LanguageSetting;
```
顶部 import 增：
```ts
import type { LanguageSetting } from '@/i18n/locale';
```
`DEFAULT_SETTINGS` 增：
```ts
  enableMobileView: true,
  language: 'auto',
```
`parseSettings` 返回对象增：
```ts
    enableMobileView:
      typeof values.enableMobileView === 'boolean'
        ? values.enableMobileView
        : DEFAULT_SETTINGS.enableMobileView,
    language: isLanguageSetting(values.language) ? values.language : DEFAULT_SETTINGS.language,
```
新增辅助函数（置于 `isDefaultTab` 之后）：
```ts
function isLanguageSetting(value: unknown): value is LanguageSetting {
  return value === 'auto' || value === 'zh' || value === 'en';
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/settings.test.ts`
Expected: 关于默认/解析的用例 PASS。面板渲染用例（`'displays every setting...'`）此时仍是英文断言，将在 Task 6 更新；若此刻失败，留待 Task 6 一并处理（先确认失败仅源于面板用例）。

- [ ] **Step 5: 验证**

Run: `npm run typecheck`
Expected: 无错误。

---

## Task 5: main.ts 注入 translator + 错误 i18n

**Files:**
- Modify: `src/main.ts`
- Test: `tests/main.test.ts`

- [ ] **Step 1: 扩展失败测试**

在 `tests/main.test.ts` 顶部新增一个用例（紧跟现有 describe 内），验证 `translator()` 依据设置返回正确 locale。先查看该文件现有的 plugin 构造/mock 方式，复用之；断言示例：
```ts
it('builds a translator following the language setting', () => {
  const plugin = makePlugin(); // 复用文件中既有的构造助手
  plugin.settings.language = 'en';
  expect(plugin.translator().locale).toBe('en');
  plugin.settings.language = 'zh';
  expect(plugin.translator().locale).toBe('zh');
});
```
> 若 `tests/main.test.ts` 无 `makePlugin` 助手，则按文件内既有实例化方式构造；`translator()` 在测试环境 `localStorage('language')` 为 null，故 `'auto'` 解析为 `'en'`，显式 zh/en 不受影响——本用例只用显式值。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/main.test.ts`
Expected: FAIL（`translator` 不是函数）。

- [ ] **Step 3: 修改 `main.ts`**

顶部 import 增：
```ts
import { resolveLocale } from '@/i18n/locale';
import { createTranslator, type Translator } from '@/i18n/translator';
```
新增方法（置于 `templateService()` 之后）：
```ts
  translator(): Translator {
    const obsidianLang =
      typeof window !== 'undefined' ? window.localStorage.getItem('language') : null;
    return createTranslator(resolveLocale(this.settings.language, obsidianLang));
  }
```
将 `reportError` 改为使用 translator：
```ts
  private reportError(context: TranslationKey, error: unknown): void {
    const t = this.translator();
    console.error(context, error);
    const detail = error instanceof Error ? error.message : t('common.unknownError');
    new Notice(t('common.contextDetail', { context: t(context), detail }));
  }
```
顶部 import 增 `TranslationKey`：
```ts
import { createTranslator, type Translator } from '@/i18n/translator';
import type { TranslationKey } from '@/i18n/translations';
```
更新所有 `reportError(...)` 调用为 key：
- `this.reportError('Dashboard 自动刷新失败', error)` → `this.reportError('error.autoRefreshFailed', error)`
- `this.reportError('无法打开 Curiosity Dashboard', error)`（两处）→ `this.reportError('error.openFailed', error)`
- `this.reportError('无法在启动时打开 Curiosity Dashboard', error)` → `this.reportError('error.openOnStartupFailed', error)`

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/main.test.ts`
Expected: 新用例 PASS；既有用例若断言旧中文 Notice 文案，按新 i18n 文案更新预期（测试环境 locale 为 en，预期英文）。

- [ ] **Step 5: 验证**

Run: `npm run typecheck`
Expected: 无错误。

---

## Task 6: 设置面板 i18n + 语言下拉

**Files:**
- Modify: `src/settings.ts`
- Test: `tests/settings.test.ts`

- [ ] **Step 1: 更新失败测试**

在 `tests/settings.test.ts`：
1. `makeTab` 的 plugin stub 增 `translator: () => createTranslator('en')`（顶部 import `createTranslator`）。
2. `'displays every setting with current values'` 预期改为英文 + 新增语言项（测试环境 en）：
```ts
expect(obsidianMock.headings).toEqual(['Curiosity Dashboard']);
expect(obsidianMock.settings.map(({ kind, name, value }) => ({ kind, name, value }))).toEqual([
  { kind: 'text', name: 'Topic directory', value: '10-选题池' },
  { kind: 'text', name: 'Script directory', value: '40-脚本大纲' },
  { kind: 'text', name: 'Asset directory', value: '20-素材库' },
  { kind: 'text', name: 'Review directory', value: '60-发布复盘' },
  { kind: 'text', name: 'Topic template', value: '99-模板/选题卡模板.md' },
  { kind: 'text', name: 'Script template', value: '99-模板/脚本大纲模板.md' },
  { kind: 'text', name: 'Review template', value: '99-模板/发布复盘模板.md' },
  { kind: 'text', name: 'Background image', value: '' },
  { kind: 'toggle', name: 'Open on startup', value: false },
  { kind: 'dropdown', name: 'Default tab', value: 'overview' },
  { kind: 'toggle', name: 'Enable simplified mobile view', value: true },
  { kind: 'dropdown', name: 'Language', value: 'auto' },
]);
expect(obsidianMock.settings[9]?.options).toEqual({ overview: 'Overview', tasks: 'Tasks', data: 'Data' });
expect(obsidianMock.settings[11]?.options).toEqual({ auto: 'Follow Obsidian', zh: '中文', en: 'English' });
```
3. `'persists every setting change'`：现循环改 11 项 text+toggle+dropdown，新增 language dropdown 第 12 项断言：在该用例末尾增 `expect(obsidianMock.settings[11]?.onChange('zh')).toBeUndefined();` 并把 `saveSettings` 期望次数与 `plugin.settings` 预期增 `language: 'zh'`、`toHaveBeenCalledTimes` 由 11 改 12。
4. `'contains save failures...'`：`toHaveLength(11)` 改 `12`，dropdown 分支值对 language 用 `'zh'`（保持 `setting.kind === 'dropdown' ? 'data' : ...` 会让 language 收到 `'data'`——非法值不写入但仍触发 saveSettings 失败 notice，符合预期；无需特判）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/settings.test.ts`
Expected: FAIL（面板仍渲染英文硬编码、无 language 项）。

- [ ] **Step 3: 修改 `settings.ts` UI 部分**

顶部 import 增：
```ts
import type { Translator } from '@/i18n/translator';
import { isLanguageSetting } from '@/settings'; // 若需，否则在本文件内已定义可直接用
```
（`isLanguageSetting` 已在本文件定义，无需 import。）

重写 `display()` 与 `addText`/`updateSetting`，引入 translator：
```ts
  display(): void {
    const t = this.plugin.translator();
    this.containerEl.empty();
    this.containerEl.createEl('h2', { text: t('settings.heading') });
    this.addText(t('settings.topicDir'), 'topicDir');
    this.addText(t('settings.scriptDir'), 'scriptDir');
    this.addText(t('settings.assetDir'), 'assetDir');
    this.addText(t('settings.reviewDir'), 'reviewDir');
    this.addText(t('settings.topicTemplate'), 'topicTemplate');
    this.addText(t('settings.scriptTemplate'), 'scriptTemplate');
    this.addText(t('settings.reviewTemplate'), 'reviewTemplate');
    this.addText(t('settings.backgroundPath'), 'backgroundPath');

    new Setting(this.containerEl).setName(t('settings.openOnStartup')).addToggle((toggle) =>
      toggle.setValue(this.plugin.settings.openOnStartup).onChange((value) => {
        this.updateSetting('openOnStartup', value);
      }),
    );

    new Setting(this.containerEl).setName(t('settings.defaultTab')).addDropdown((dropdown) =>
      dropdown
        .addOptions({ overview: t('tab.overview'), tasks: t('tab.tasks'), data: t('tab.data') })
        .setValue(this.plugin.settings.defaultTab)
        .onChange((value) => {
          if (isDefaultTab(value)) this.updateSetting('defaultTab', value);
        }),
    );

    new Setting(this.containerEl)
      .setName(t('settings.enableMobileView'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableMobileView).onChange((value) => {
          this.updateSetting('enableMobileView', value);
        }),
      );

    new Setting(this.containerEl).setName(t('settings.language')).addDropdown((dropdown) =>
      dropdown
        .addOptions({
          auto: t('settings.language.auto'),
          zh: t('settings.language.zh'),
          en: t('settings.language.en'),
        })
        .setValue(this.plugin.settings.language)
        .onChange((value) => {
          if (isLanguageSetting(value)) {
            this.updateSetting('language', value);
            this.display();
          }
        }),
    );
  }
```
`addText` 保持签名不变（`name` 现由调用方传入译文，无需改动内部）。
`updateSetting` 的失败 Notice 改 i18n：
```ts
  private updateSetting<K extends keyof DashboardSettings>(
    key: K,
    value: DashboardSettings[K],
  ): void {
    this.plugin.settings[key] = value;
    void this.plugin.saveSettings().catch((error: unknown) => {
      const t = this.plugin.translator();
      const detail = error instanceof Error ? error.message : t('common.unknownError');
      new Notice(t('settings.saveFailed', { detail }));
    });
  }
```
> 注意：默认下拉选项 value 仍为 `overview/tasks/data`、`auto/zh/en`（数据值不变），仅 label 走 i18n。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/settings.test.ts`
Expected: PASS。

- [ ] **Step 5: 验证**

Run: `npm run typecheck && npx vitest run tests/settings.test.ts tests/main.test.ts tests/i18n`
Expected: 全部 PASS。

---

## Task 7: DashboardRenderer 透传 translator

**Files:**
- Modify: `src/ui/dashboard-renderer.ts`
- Test: `tests/ui/dashboard-modules.test.ts`、`tests/ui/dashboard-renderer.test.ts`

> 本任务改 `render` 签名并把 tab 标签 i18n 化；各子渲染器在 Task 8–12 内部 i18n。本任务先让 render 接收 translator 并把它传给子渲染器（子渲染器签名将在后续任务追加形参，本任务先传入但子函数暂忽略额外实参不会编译错误——TS 多传实参允许）。

- [ ] **Step 1: 更新失败测试（dashboard-modules）**

在 `tests/ui/dashboard-modules.test.ts`：
1. 顶部 import：`import { createTranslator } from '@/i18n/translator';`
2. `render()` 助手改为传 zh translator：
```ts
function render(
  value = model(),
  activeTab: DashboardTab = 'overview',
  actions = handlers(),
): { actions: DashboardHandlers; root: FakeElement } {
  const root = new FakeElement();
  new DashboardRenderer().render(
    root as unknown as HTMLElement, value, actions, activeTab, createTranslator('zh'),
  );
  return { actions, root };
}
```
3. panel heading 用例的预期由英文改 zh：
```ts
it.each([
  ['overview', ['任务中心', '本周', '制作队列', '渠道脉搏', '快捷操作']],
  ['tasks', ['任务中心', '本周']],
  ['data', ['渠道脉搏']],
] as const)(...)
```
4. `section(root, 'This Week')` → `section(root, '本周')`；`section(root, 'Production Queue')` → `section(root, '制作队列')`；`section(root, 'Channel Pulse')` → `section(root, '渠道脉搏')`（全文件替换这三个英文区块名）。
5. dock label 断言由英文改 zh：`labels = ['灵感','作品','任务','脚本','数据','复盘','设置']`；`findByText(dock,'Ideas')` 等→对应中文；`findByText(desktop.root,'Ideas')`→`'灵感'`；`findByText(dock,'Mission')`→`'作品'`、`'Script'`→`'脚本'`、`'Review'`→`'复盘'`、`'Tasks'`→`'任务'`、`'Data'`→`'数据'`、`'Settings'`→`'设置'`。`expect(button?.getAttr('aria-label')).toBe(label)` 处 label 已是中文，保持。
6. dock 中 `findByText(dock, 'Script')?.parent`（用于守卫测试）→ `findByText(dock, '脚本')?.parent`。
7. 列头与 caption、'另有 N 项/条'、'移动端只读…' 等断言保持不变（zh 文案与目录一致）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/ui/dashboard-modules.test.ts`
Expected: FAIL（`render` 仅接受 4 参；tab 标签仍英文）。

- [ ] **Step 3: 修改 `dashboard-renderer.ts`**

顶部 import 增：
```ts
import type { Translator } from '@/i18n/translator';
```
`render` 增形参并改 TABS 为运行时构造：
```ts
  render(
    container: HTMLElement,
    model: DashboardModel,
    handlers: DashboardHandlers,
    activeTab: DashboardTab,
    t: Translator,
  ): HTMLButtonElement {
```
删除模块级 `const TABS = [...]`，改为方法内：
```ts
    const tabsConfig: ReadonlyArray<{ id: DashboardTab; label: string }> = [
      { id: 'overview', label: t.t('tab.overview') },
      { id: 'tasks', label: t.t('tab.tasks') },
      { id: 'data', label: t.t('tab.data') },
    ];
```
将原 `TABS.map(...)`、`for (const { id } of TABS)`、tablist `aria-label` 改用 `tabsConfig`/i18n：
- `attr: { 'aria-label': 'Dashboard views', role: 'tablist' }` → `attr: { 'aria-label': t.t('tabs.aria'), role: 'tablist' }`
- `TABS.map(` → `tabsConfig.map(`
- `for (const { id } of TABS)` → `for (const { id } of tabsConfig)`

把 translator 传给子渲染器（后续任务消费）：
```ts
      if (id === 'overview') {
        renderMissionControl(panel, model, handlers, t);
        renderThisWeek(panel, model.thisWeek, handlers.openPath, t);
        renderProductionQueue(panel, model.queue, handlers.openPath, t);
        renderChannelPulse(panel, model, handlers.openPath, t);
        renderQuickActions(panel, model, handlers, t);
      } else if (id === 'tasks') {
        renderMissionControl(panel, model, handlers, t);
        renderThisWeek(panel, model.thisWeek, handlers.openPath, t);
      } else {
        renderChannelPulse(panel, model, handlers.openPath, t);
      }
```
并把 `renderHero(shell, model, handlers)` → `renderHero(shell, model, handlers, t)`、`renderDock(shell, model, handlers)` → `renderDock(shell, model, handlers, t)`。
> 此刻子渲染器尚未声明该形参，TS 对"多传实参"会报错。因此**本任务需与 Task 8–12 连续完成**，或先在各子渲染器签名末尾追加 `_t: Translator`（占位，下个任务实现）。推荐：本任务仅改 dashboard-renderer 与 dashboard-modules 测试，运行 `typecheck` 预期报"子渲染器实参过多"，随后立即进入 Task 8 起逐个补齐；待 Task 12 完成后本任务 typecheck 才整体通过。**验证步骤据此调整见下。**

- [ ] **Step 4: 修改 dashboard-renderer.test.ts 注入 translator**

在 `tests/ui/dashboard-renderer.test.ts` 中，所有 `new DashboardRenderer().render(root, ..., activeTab)` 调用末尾追加 `, createTranslator('zh')`（顶部 import `createTranslator`）；英文区块名/tab 文案相关断言按 zh 目录更新（`Overview/Tasks/Data` tab 文本→`概览/任务/数据`；`Dashboard views`→`工作台视图`；其余依实际断言对照 Task 2 目录调整）。

- [ ] **Step 5: 验证（部分）**

Run: `npm run typecheck`
Expected: 仅余"子渲染器实参过多"类错误（将在 Task 8–12 消除）。其余无新错误。

---

## Task 8: hero.ts i18n

**Files:**
- Modify: `src/ui/renderers/hero.ts`

- [ ] **Step 1: 修改 `hero.ts`**

顶部 import 增：
```ts
import type { Translator } from '@/i18n/translator';
```
`renderHero` 签名增 `t: Translator`：
```ts
export function renderHero(
  parent: HTMLElement,
  model: DashboardModel,
  handlers: DashboardHandlers,
  t: Translator,
): void {
```
按下表把硬编码文案替换为 `t.t(...)`（stage 显示用 `t.stageLabel`）：

| 原文 | 替换 |
| --- | --- |
| `'Content Studio menu bar'`（aria） | `t.t('hero.menuAria')` |
| `'Content Studio'`（brand span） | `t.t('hero.brand')` |
| `'Local Markdown Workspace'` | `t.t('hero.context')` |
| `'CURRENT MISSION'` | `t.t('hero.kicker')` |
| `'Chase your curiosity'` | `t.t('hero.title')` |
| `'尚未设置当前作品。'` | `t.t('hero.noFocus')` |
| `'打开插件设置'` | `t.t('hero.openSettings')` |
| `'检测到多个当前作品'` | `t.t('hero.multipleTitle')` |
| `'请只保留一个 homepage_focus: true，然后刷新工作台。'` | `t.t('hero.multipleMessage')` |
| `` `ISSUE ${topic.issue}` `` | `t.t('hero.issuePill', { issue: topic.issue })` |
| `'CURRENT STAGE'` | `t.t('hero.currentStageLabel')` |
| `stage ?? '未知阶段'` | `stage === null ? t.t('stage.unknown') : t.stageLabel(stage)` |
| `'NEXT ACTION'` | `t.t('hero.nextActionLabel')` |
| `topic.nextAction ?? '下一步未设置'` | `topic.nextAction ?? t.t('hero.nextActionUnset')` |
| `'打开当前脚本'` | `t.t('hero.openScript')` |
| `'创建脚本'` | `t.t('action.createScript')` |
| `'查看选题卡'` | `t.t('hero.viewTopic')` |
| `'移动端只读，不能创建脚本'`（title） | `t.t('hero.mobileReadonlyCreateScript')` |
| `'创建脚本（不可用：移动端只读）'`（aria-label） | `t.t('hero.createScriptDisabledAria')` |

> `multiple` 分支里 `actionButton(item, topic.title, ...)` 的 `topic.title` 是数据，保持。`factCard('CURRENT STAGE', ...)` 第一参改 `t.t('hero.currentStageLabel')`，`'NEXT ACTION'` 同理。

- [ ] **Step 2: 验证**

Run: `npm run typecheck`
Expected: hero 相关"实参过多"错误消失。

---

## Task 9: mission-control.ts i18n（含 stageLabel）

**Files:**
- Modify: `src/ui/renderers/mission-control.ts`

- [ ] **Step 1: 修改 `mission-control.ts`**

顶部 import 增 `import type { Translator } from '@/i18n/translator';`
`renderMissionControl` 增 `t: Translator` 形参，并把 `t` 透传给内部 `renderStages(windowEl, currentStage, t)`、`renderWriteHelp(windowEl, model.mobileReadOnly, currentStage, t)`、`renderTitlebar(windowEl, topic, t)`、`renderTasks(grid, model, topic, handlers, helpIds.mobile, t)`、`renderQuickLook(grid, model, topic, handlers, helpIds.mobile, t)`。对应各内部函数签名末尾追加 `t: Translator`。

替换表：

| 原文 / 位置 | 替换 |
| --- | --- |
| advance 按钮 `'推进阶段'` | `t.t('mission.advance')` |
| advance title `'移动端为只读模式'` | `t.t('common.mobileReadonlyMode')` |
| advance title `'当前阶段无效，无法推进'` | `t.t('mission.invalidStageTitle')` |
| advance title `'复盘是终止阶段'` | `t.t('mission.terminalStageTitle')` |
| titlebar `'Mission Control'` | `t.t('mission.title')` |
| titlebar `` `Issue ${topic.issue} — ${topic.title}` `` | `t.t('mission.issue', { issue: topic.issue, title: topic.title })` |
| writeHelp `'移动端只读：任务、关联路径和阶段推进不可修改。'` | `t.t('mission.mobileReadonlyHelp')` |
| writeHelp `'当前阶段无法识别；请修正选题卡中的 stage 后再推进。'` | `t.t('mission.invalidStageHelp')` |
| writeHelp `'当前已处于复盘终止阶段，无法继续推进。'` | `t.t('mission.terminalStageHelp')` |
| stages 警告 `'未知阶段'` | `t.t('stage.unknown')` |
| stages 轨道 aria `'制作阶段'` | `t.t('mission.stageTrackAria')` |
| stages item `` `${stage} ✓` `` / `stage` | `index < currentIndex ? \`${t.stageLabel(stage)} ✓\` : t.stageLabel(stage)` |
| tasks `'本期执行清单'`（h3） | `t.t('mission.tasksTitle')` |
| tasks `'未找到「本期执行清单」'` | `t.t('mission.tasksEmpty')` |
| tasks 只读 title `'移动端为只读模式'` | `t.t('common.mobileReadonlyMode')` |
| quickLook `'Quick Look'` | `t.t('mission.quickLook')` |
| quickLook links `['选题卡', '脚本', '素材', '复盘']` | `[t.t('link.topicCard'), t.t('link.script'), t.t('link.asset'), t.t('link.review')]` |
| quickLook aria `` `${label}：${path}` `` | `t.t('common.labelPath', { label, path })` |
| associations label `'脚本'/'素材'/'复盘'` | 分别 `t.t('link.script')/t.t('link.asset')/t.t('link.review')` |
| associations `` `${label}存在多个候选，请选择：` `` | `t.t('mission.multipleCandidates', { label })` |
| associations 只读 title `'移动端为只读模式'` | `t.t('common.mobileReadonlyMode')` |

> `currentStage === '复盘'`（advance.disabled 判定）**保持比较原始数据值**，不改。`STAGES.entries()` 遍历不变，仅显示用 `stageLabel`。

- [ ] **Step 2: 验证**

Run: `npm run typecheck`
Expected: mission-control "实参过多"错误消失。

---

## Task 10: this-week.ts + production-queue.ts i18n

**Files:**
- Modify: `src/ui/renderers/this-week.ts`、`src/ui/renderers/production-queue.ts`

- [ ] **Step 1: 修改 `this-week.ts`**

完整替换为：
```ts
import type { TopicRecord } from '@/domain/models';
import type { Translator } from '@/i18n/translator';

const VISIBLE_LIMIT = 8;

export function renderThisWeek(
  parent: HTMLElement,
  topics: TopicRecord[],
  openPath: (path: string) => Promise<void>,
  t: Translator,
): void {
  const section = parent.createEl('section', {
    cls: 'curiosity-section curiosity-this-week',
  });
  section.createEl('h2', { text: t.t('thisWeek.title') });
  if (topics.length === 0) {
    section.createEl('p', { text: t.t('thisWeek.empty') });
    return;
  }

  const list = section.createEl('ul', { cls: 'curiosity-list curiosity-week-list' });
  for (const topic of topics.slice(0, VISIBLE_LIMIT)) {
    const item = list.createEl('li');
    const button = item.createEl('button', {
      text: `${topic.issue} · ${topic.title}`,
      type: 'button',
    });
    button.addEventListener('click', () => void openPath(topic.path));
    const stageText = topic.stage === null ? t.t('common.unset') : t.stageLabel(topic.stage);
    item.createSpan({
      cls: 'curiosity-item-meta',
      text: `${stageText} · ${topic.dueDate ?? t.t('common.unset')}`,
    });
  }
  renderOverflow(section, topics.length - VISIBLE_LIMIT, t);
}

function renderOverflow(parent: HTMLElement, count: number, t: Translator): void {
  if (count <= 0) return;
  parent.createEl('p', { cls: 'curiosity-overflow-count', text: t.t('overflow.items', { count }) });
}
```

- [ ] **Step 2: 修改 `production-queue.ts`**

完整替换为：
```ts
import type { TopicRecord } from '@/domain/models';
import type { Translator } from '@/i18n/translator';

const VISIBLE_LIMIT = 6;

export function renderProductionQueue(
  parent: HTMLElement,
  topics: TopicRecord[],
  openPath: (path: string) => Promise<void>,
  t: Translator,
): void {
  const section = parent.createEl('section', {
    cls: 'curiosity-section curiosity-production-queue',
  });
  section.createEl('h2', { text: t.t('queue.title') });
  const grid = section.createDiv({ cls: 'curiosity-queue-grid' });
  if (topics.length === 0) {
    grid.createEl('p', { text: t.t('queue.empty') });
    return;
  }

  for (const topic of topics.slice(0, VISIBLE_LIMIT)) {
    const card = grid.createEl('article', {
      cls: 'curiosity-window curiosity-queue-card',
    });
    card.createDiv({ cls: 'curiosity-card-edge', attr: { 'aria-hidden': 'true' } });
    card.createDiv({ cls: 'curiosity-kicker', text: `ISSUE ${topic.issue}` });
    const button = card.createEl('button', { text: topic.title, type: 'button' });
    button.addEventListener('click', () => void openPath(topic.path));
    const stageText = topic.stage === null ? t.t('common.unset') : t.stageLabel(topic.stage);
    card.createEl('p', {
      text: [
        stageText,
        topic.priority ?? t.t('common.unset'),
        topic.dueDate ?? t.t('common.unset'),
      ].join(' · '),
    });
  }

  const overflow = topics.length - VISIBLE_LIMIT;
  if (overflow > 0) {
    section.createEl('p', {
      cls: 'curiosity-overflow-count',
      text: t.t('overflow.items', { count: overflow }),
    });
  }
}
```
> `ISSUE ${topic.issue}` 的 kicker 保持英文（与 hero issuePill 不同，此处为卡片角标视觉元素）；如需中文化可改 `t.t('hero.issuePill', ...)`，本计划保持原样以最小化视觉变动——**决策：保持 `ISSUE`**。
> 既有 dashboard-modules 测试断言 `'制作 · 未设置'` 与 `'制作 · 未设置 · 未设置'`：zh translator 下 `stageLabel('制作')==='制作'`、`common.unset==='未设置'`，断言仍成立。

- [ ] **Step 3: 验证**

Run: `npm run typecheck`
Expected: this-week / production-queue "实参过多"错误消失。

---

## Task 11: channel-pulse.ts i18n

**Files:**
- Modify: `src/ui/renderers/channel-pulse.ts`

- [ ] **Step 1: 修改 `channel-pulse.ts`**

顶部 import 增 `import type { Translator } from '@/i18n/translator';`
把模块级 `COLUMNS`（含中文 label）改为"列 key + 翻译 key"映射，label 在渲染时取译文。替换 `COLUMNS` 定义：
```ts
const COLUMNS: ReadonlyArray<readonly [MetricKey, TranslationKey]> = [
  ['platform', 'pulse.col.platform'],
  ['collectedAt', 'pulse.col.collectedAt'],
  ['views', 'pulse.col.views'],
  ['likes', 'pulse.col.likes'],
  ['favorites', 'pulse.col.favorites'],
  ['comments', 'pulse.col.comments'],
  ['shares', 'pulse.col.shares'],
];
```
import 增 `import type { TranslationKey } from '@/i18n/translations';`

`renderChannelPulse` 增 `t: Translator` 形参（置于 `openPath` 后），并把 `t` 传给 `renderMetricsTable(section, model.metrics, t)`。替换：

| 原文 | 替换 |
| --- | --- |
| `'Channel Pulse'` | `t.t('pulse.title')` |
| `'暂无可验证平台数据。'` | `t.t('pulse.empty')` |
| `'数据来源：本地发布复盘'` | `t.t('pulse.sourceButton')` |
| `` `打开本地发布复盘：${model.reviewPath}` `` | `t.t('pulse.sourceButtonAria', { path: model.reviewPath })` |
| `'未关联本地发布复盘。'` | `t.t('pulse.noSource')` |
| `'评论区需求'`（aria-label 与 h3，两处） | `t.t('pulse.commentsTitle')` |
| `'暂无可验证评论内容'` | `t.t('pulse.commentsEmpty')` |
| `` `另有 ${commentOverflow} 条评论` `` | `t.t('pulse.overflowComments', { count: commentOverflow })` |

`renderMetricsTable(parent, rows, t)`：
| 原文 | 替换 |
| --- | --- |
| `'本地发布复盘中的平台数据'`（caption） | `t.t('pulse.tableCaption')` |
| `for (const [, label] of visible) { header.createEl('th', { text: label, ... }) }` | `for (const [, key] of visible) { header.createEl('th', { text: t.t(key), attr: { scope: 'col' } }) }` |
| `` `另有 ${rowOverflow} 条平台数据` `` | `t.t('pulse.overflowRows', { count: rowOverflow })` |

> `visible` 过滤逻辑 `COLUMNS.filter(([key]) => ...)` 中 `key` 仍是 `MetricKey`（数组首元素），不受 label 改动影响。
> zh translator 下列头与 caption 文案与目录一致 → 既有 dashboard-modules 断言（`['平台','采集时间','播放/观看','点赞','评论']`、caption、`'收藏'/'分享'`、overflow 文案）仍成立。

- [ ] **Step 2: 验证**

Run: `npm run typecheck`
Expected: channel-pulse "实参过多"错误消失。

---

## Task 12: quick-actions.ts + dock.ts i18n

**Files:**
- Modify: `src/ui/renderers/quick-actions.ts`、`src/ui/renderers/dock.ts`

- [ ] **Step 1: 修改 `quick-actions.ts`**

顶部 import 增 `import type { Translator } from '@/i18n/translator';`
`renderQuickActions` 增 `t: Translator`。`createButton`/`openButton` 各增 `t: Translator` 形参，调用处透传。替换：

| 原文 | 替换 |
| --- | --- |
| `'Quick Actions'` | `t.t('quickActions.title')` |
| `'创建选题卡'` | `t.t('action.createTopicCard')` |
| `'打开脚本'` | `t.t('action.openScript')` |
| `'创建脚本'` | `t.t('action.createScript')` |
| `'打开复盘'` | `t.t('action.openReview')` |
| `'创建复盘'` | `t.t('action.createReview')` |
| `'移动端只读：创建操作不可用。'` | `t.t('quickActions.readonlyReason')` |
| createButton aria `` `${label}（不可用：移动端只读）` `` | `t.t('common.unavailableMobileReadonly', { label })` |
| createButton title `'移动端只读，不能创建文件'` | `t.t('common.mobileReadonlyCreateFile')` |
| openButton aria `` `${label}：${path}` `` | `t.t('common.labelPath', { label, path })` |

> 既有 dashboard-modules 断言 `'创建选题卡'/'创建脚本'/'创建复盘'/'移动端只读：创建操作不可用。'` 在 zh 下不变，成立；`aria-label` 含 `'移动端只读'` 断言：zh `common.unavailableMobileReadonly` 含"移动端只读" → `toContain('移动端只读')` 成立。

- [ ] **Step 2: 修改 `dock.ts`**

顶部 import 增 `import type { Translator } from '@/i18n/translator';`
`renderDock` 增 `t: Translator`。各 dock item 的 `label` 改用 i18n；`disabledItem`/`fileItem`/`associatedItem`/`renderDockItem` 视需要透传 `t`。具体：

替换 `renderDock` 内 items 构造：
```ts
  const dock = parent.createEl('nav', {
    cls: 'curiosity-dock',
    attr: { 'aria-label': t.t('dock.aria') },
  });
  const topic = focusTopic(model);
  const items: DockItem[] = [];

  items.push(model.mobileReadOnly
    ? disabledItem(t.t('dock.ideas'), 'lightbulb', t.t('dock.reason.mobileCreateTopic'))
    : { action: handlers.createTopic, icon: 'lightbulb', label: t.t('dock.ideas') });
  items.push(fileItem(t.t('dock.mission'), 'crosshair', topic?.path ?? null, t.t('dock.reason.noFocus'), handlers));
  items.push({ action: () => handlers.selectTab('tasks'), icon: 'list-checks', label: t.t('dock.tasks') });
  items.push(associatedItem(
    { key: 'script', label: t.t('dock.script') }, 'file-text', topic, 'scriptPath', model, handlers, t,
  ));
  items.push({ action: () => handlers.selectTab('data'), icon: 'chart-no-axes-combined', label: t.t('dock.data') });
  items.push(associatedItem(
    { key: 'review', label: t.t('dock.review') }, 'clipboard-check', topic, 'reviewPath', model, handlers, t,
  ));
  items.push({ action: handlers.openSettings, icon: 'settings', label: t.t('dock.settings') });

  for (const item of items) renderDockItem(dock, item, t);
```
`associatedItem` 改签名与原因文案：
```ts
function associatedItem(
  meta: { key: 'script' | 'review'; label: string },
  icon: string,
  topic: TopicRecord | null,
  field: 'scriptPath' | 'reviewPath',
  model: DashboardModel,
  handlers: DashboardHandlers,
  t: Translator,
): DockItem {
  const path = topic?.[field] ?? null;
  if (path !== null) return fileItem(meta.label, icon, path, '', handlers);

  const what = meta.key === 'script' ? t.t('link.script') : t.t('link.review');
  const create = meta.key === 'script' ? handlers.createScript : handlers.createReview;
  if (topic !== null) {
    if (model.mobileReadOnly) {
      return disabledItem(meta.label, icon, t.t('dock.reason.mobileCreate', { what }));
    }
    return { action: () => create(topic), icon, label: meta.label };
  }
  return disabledItem(meta.label, icon, t.t('dock.reason.notLinked', { what }));
}
```
`renderDockItem` 增 `t` 并改 aria/兜底：
```ts
function renderDockItem(parent: HTMLElement, item: DockItem, t: Translator): void {
  const disabled = item.action === undefined;
  const button = parent.createEl('button', {
    cls: 'curiosity-dock-item',
    type: 'button',
    attr: {
      'aria-label': disabled
        ? t.t('common.unavailableReason', { label: item.label, reason: item.reason ?? t.t('common.unknownReason') })
        : item.label,
    },
  });
  ...
```
其余 `fileItem`/`disabledItem` 内部不含中文，签名不变。

> 既有 dock 断言（Task 7 已改 zh）：label 为中文、`未设置当前作品`(=dock.reason.noFocus.zh)、`当前作品未关联脚本`(=notLinked.zh with what=链接.script.zh '脚本')、`当前作品未关联复盘` 均成立；`aria-label` `不可用` → zh `common.unavailableReason` 含"不可用"，`toContain('不可用')` 成立。

- [ ] **Step 3: 验证（Task 7 整体收口）**

Run: `npm run typecheck`
Expected: 全部"实参过多"错误消除，typecheck 通过。

Run: `npx vitest run tests/ui/dashboard-modules.test.ts tests/ui/dashboard-renderer.test.ts`
Expected: PASS。

---

## Task 13: confirm-stage-modal.ts i18n

**Files:**
- Modify: `src/ui/confirm-stage-modal.ts`
- Test: `tests/ui/modals.test.ts`

- [ ] **Step 1: 更新失败测试**

在 `tests/ui/modals.test.ts` 中，`ConfirmStageModal.ask(app, stage)` 调用改为 `ConfirmStageModal.ask(app, stage, createTranslator('zh'))`（顶部 import `createTranslator`）；相关中文断言（`'推进制作阶段'`、`从「X」推进到「Y」？`、`'取消'`、`'推进'`、`'当前已经是最终阶段。'`）在 zh 下不变，保持。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/ui/modals.test.ts`
Expected: FAIL（`ask` 仅接受 2 参）。

- [ ] **Step 3: 修改 `confirm-stage-modal.ts`**

顶部 import 增 `import type { Translator } from '@/i18n/translator';`
`ask` 与构造器增 translator：
```ts
  static ask(app: App, current: Stage, t: Translator): Promise<boolean> {
    return new Promise((resolve) => {
      new ConfirmStageModal(app, current, resolve, t).open();
    });
  }

  private constructor(
    app: App,
    private readonly current: Stage,
    private readonly resolveResult: (value: boolean) => void,
    private readonly t: Translator,
  ) {
    super(app);
  }
```
`onOpen` 替换：
```ts
    this.contentEl.createEl('h2', { text: this.t.t('confirmStage.title'), attr: { id: titleId } });
    this.contentEl.createEl('p', {
      text: next === null
        ? this.t.t('confirmStage.terminal')
        : this.t.t('confirmStage.prompt', {
            from: this.t.stageLabel(this.current),
            to: this.t.stageLabel(next),
          }),
    });
    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText(this.t.t('common.cancel')).onClick(() => this.finish(false)))
      .addButton((button) =>
        button
          .setCta()
          .setButtonText(this.t.t('confirmStage.confirm'))
          .setDisabled(next === null)
          .onClick(() => this.finish(next !== null)));
```

- [ ] **Step 4: 更新调用方 `curiosity-dashboard-view.ts`**

`confirmAdvance` 中 `ConfirmStageModal.ask(this.app, stage)` → `ConfirmStageModal.ask(this.app, stage, this.plugin.translator())`。

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/ui/modals.test.ts`
Expected: confirm-stage 相关 PASS（create-file 部分见 Task 14）。

- [ ] **Step 6: 验证**

Run: `npm run typecheck`
Expected: 无新错误（view 内 ask 调用已补 translator）。

---

## Task 14: create-file-modal.ts i18n

**Files:**
- Modify: `src/ui/create-file-modal.ts`
- Test: `tests/ui/modals.test.ts`

- [ ] **Step 1: 更新失败测试**

`tests/ui/modals.test.ts` 中 `CreateFileModal.ask(app, defaults)` → `CreateFileModal.ask(app, defaults, createTranslator('zh'))`；字段名（`'期数'/'标题'/'目标路径'`）、按钮（`'取消'/'创建'`）、校验错误文案在 zh 下不变，保持断言。`defaults.heading` 由测试自行提供字符串，不受影响。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/ui/modals.test.ts`
Expected: FAIL（`ask` 仅接受 2 参）。

- [ ] **Step 3: 修改 `create-file-modal.ts`**

顶部 import 增 `import type { Translator } from '@/i18n/translator';`
`ask`、构造器增 `t: Translator`（构造器存为 `private readonly t`）：
```ts
  static ask(app: App, defaults: CreateFileDefaults, t: Translator): Promise<CreateRequest | null> {
    return new Promise((resolve) => {
      new CreateFileModal(app, defaults, resolve, t).open();
    });
  }
```
构造器形参末尾追加 `private readonly t: Translator,`。
`onOpen` 字段名与按钮、`labelInput` 调用：
| 原文 | 替换 |
| --- | --- |
| `.setName('期数')`、`labelInput(text, '期数', errorId)` | `.setName(this.t.t('createFile.issue'))`、`labelInput(text, this.t.t('createFile.issue'), errorId)` |
| `.setName('标题')`、`labelInput(text, '标题', ...)` | `this.t.t('createFile.title')` |
| `.setName('目标路径')`、`labelInput(text, '目标路径', ...)` | `this.t.t('createFile.targetPath')` |
| `button.setButtonText('取消')` | `this.t.t('common.cancel')` |
| `button.setCta().setButtonText('创建')` | `this.t.t('common.create')` |

`validate()` 错误串：
| 原文 | 替换 |
| --- | --- |
| `'期数必须是正安全整数。'` | `this.t.t('createFile.errIssue')` |
| `'标题不能为空。'` | `this.t.t('createFile.errTitleEmpty')` |
| `'标题不能生成有效文件名。'` | `this.t.t('createFile.errTitleInvalid')` |
| `'目标路径不能为空。'` | `this.t.t('createFile.errPathEmpty')` |
| `'目标路径必须以 .md 结尾。'` | `this.t.t('createFile.errPathExt')` |

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/ui/modals.test.ts`
Expected: PASS。

- [ ] **Step 5: 验证**

Run: `npm run typecheck`
Expected: 无新错误。

---

## Task 15: curiosity-dashboard-view.ts i18n + render 注入

**Files:**
- Modify: `src/curiosity-dashboard-view.ts`
- Test: `tests/curiosity-dashboard-view.test.ts`

- [ ] **Step 1: 更新失败测试**

在 `tests/curiosity-dashboard-view.test.ts`：plugin stub 增 `translator: () => createTranslator('en')`（顶部 import `createTranslator`）；加载/错误/移动端/Notice 等中文断言改为对应英文（依 Task 2 目录）。例如 `'正在加载 Curiosity Dashboard'`→`'Loading Curiosity Dashboard'`、`'Dashboard 加载失败'`→`'Dashboard failed to load'`、`'重试'`→`'Retry'`、`'移动端视图已关闭'`→`'Mobile view disabled'`、`'移动端只读，不能修改文件。'`→`'Read-only on mobile; cannot modify files.'` 等。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/curiosity-dashboard-view.test.ts`
Expected: FAIL（仍渲染中文 / 无 translator）。

- [ ] **Step 3: 修改 `curiosity-dashboard-view.ts`**

顶部 import 增：
```ts
import type { TranslationKey } from '@/i18n/translations';
```
新增私有取译助手：
```ts
  private get t() {
    return this.plugin.translator();
  }
```
`renderModel` 中 `this.renderer.render(this.contentEl, model, {...}, this.activeTab)` 末尾追加 `, this.t`。

替换各状态/Notice（注意 `errorMessage`/`actionErrorMessage` 两个模块级函数需改为接收 translator，或在 view 内联）：

`renderLoading`：
```ts
    status.createEl('h2', { text: this.t.t('view.loadingTitle') });
    status.createEl('p', { text: this.t.t('view.loadingBody') });
```
`renderError`：
```ts
    state.createEl('h2', { text: this.t.t('view.errorTitle') });
    state.createEl('p', { text: errorMessage(error, this.t) });
    const retry = state.createEl('button', { text: this.t.t('view.retry'), type: 'button' });
```
`renderMobileDisabled`：
```ts
    state.createEl('h2', { text: this.t.t('view.mobileDisabledTitle') });
    state.createEl('p', { text: this.t.t('view.mobileDisabledBody') });
```
模块级辅助改签名：
```ts
function errorMessage(error: unknown, t: Translator): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : t.t('view.unknownLoadError');
}

function actionErrorMessage(error: unknown, t: Translator): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : t.t('common.unknownError');
}
```
顶部 import 增 `import type { Translator } from '@/i18n/translator';`
所有 `actionErrorMessage(x)` 调用改 `actionErrorMessage(x, this.t)`（在方法内）或在模块函数中传入。`showActionError`：
```ts
  private showActionError(context: TranslationKey, error: unknown): void {
    new Notice(this.t.t('common.contextDetail', {
      context: this.t.t(context),
      detail: actionErrorMessage(error, this.t),
    }));
  }
```
并把所有 `this.showActionError('无法打开文件', error)` 等调用改为 key：
| 原调用 | 改为 |
| --- | --- |
| `'无法打开文件'` | `'view.openFileFailed'` |
| `'无法更新任务'` | `'view.toggleTaskFailed'` |
| `'无法推进阶段'` | `'view.advanceFailed'` |
| `'创建失败'` | `'view.createFailed'` |
| `'无法保存当前标签'` | `'view.saveTabFailed'` |
| `'无法保存关联路径'` | `'view.saveAssociationFailed'` |
| `'无法打开插件设置'`（openSettings catch） | `'view.openSettingsFailed'` |

直接 `new Notice(...)` 文案：
| 原文 | 替换 |
| --- | --- |
| `'Dashboard 数据尚未加载，不能创建文件。'` | `this.t.t('view.notLoadedCreate')` |
| `'当前作品已变化，不能创建关联文件。'` | `this.t.t('view.focusChangedCreate')` |
| `'当前作品已变化，已取消创建。'` | `this.t.t('view.focusChangedCancel')` |
| `'Dashboard 状态已变化，已取消创建。'` | `this.t.t('view.stateChangedCancel')` |
| `'移动端只读，不能修改文件。'` | `this.t.t('view.mobileReadonlyModify')` |
| 模板缺失 opened 分支 | `this.t.t('view.templateMissingOpened', { path: error.path })` |
| 模板缺失 manual 分支 | `this.t.t('view.templateMissingManual', { path: error.path })` |

`createDefaults` heading：
```ts
    const heading = kind === 'topic'
      ? this.t.t('modal.createTopicHeading')
      : kind === 'script'
        ? this.t.t('modal.createScriptHeading')
        : this.t.t('modal.createReviewHeading');
```
> `title = kind === 'topic' ? '新选题' : ...` **保持 `'新选题'`（新文件标题内容，属数据）**。

`openCreate` 关联校验：
| 原文 | 替换 |
| --- | --- |
| `` `无法核对当前作品：${actionErrorMessage(error)}` `` | `this.t.t('view.verifyFocusFailed', { detail: actionErrorMessage(error, this.t) })` |
| `'当前作品已变化，文件未关联'` | `this.t.t('view.focusChangedNotLinked')` |

`openSettings`：`throw new Error('当前 Obsidian 版本未提供设置入口')` → `throw new Error(this.t.t('view.noSettingsEntry'))`。

`showPartialCreationResult` 重写：
```ts
  private showPartialCreationResult(
    kind: 'topic' | 'script' | 'review',
    associationError: unknown,
    openError: unknown,
    refreshError: unknown,
  ): void {
    const t = this.t;
    const details: string[] = [];
    if (associationError !== null) {
      details.push(t.t('view.linkFailed', { detail: actionErrorMessage(associationError, t) }));
    }
    if (openError !== null) {
      details.push(t.t('view.openFailedDetail', { detail: actionErrorMessage(openError, t) }));
    }
    if (refreshError !== null) {
      details.push(t.t('view.refreshFailedDetail', { detail: actionErrorMessage(refreshError, t) }));
    }
    const associated = kind !== 'topic' && associationError === null;
    new Notice(t.t('view.partialResult', {
      suffix: associated ? t.t('view.linkedSuffix') : '',
      details: details.join(t.t('view.detailJoin')),
    }));
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/curiosity-dashboard-view.test.ts`
Expected: PASS。

- [ ] **Step 5: 验证**

Run: `npm run typecheck`
Expected: 无错误。

---

## Task 16: 全量验证与构建

**Files:** 无新增改动（仅运行）。

- [ ] **Step 1: 全量类型检查**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 2: 全量测试**

Run: `npm test`
Expected: 全部 PASS（含新增 `tests/i18n/*`）。

- [ ] **Step 3: 构建**

Run: `npm run build`
Expected: typecheck + esbuild 成功产出 `main.js`。

- [ ] **Step 4: 打包契约校验（可选，若改动影响发布物）**

Run: `npm run package`
Expected: `scripts/verify-package.mjs` 通过。若失败，依据其报告补齐 dist 产物。

- [ ] **Step 5: 人工冒烟（可选）**

在 Obsidian 中加载插件，打开设置 → 切换"界面语言"为 中文/English/跟随 Obsidian，确认设置面板与仪表盘文案即时切换，且阶段推进、创建文件等功能正常（阶段值与文件夹结构不受语言影响）。

---

## Self-Review

**1. Spec coverage：**
- 数据/UI 边界（spec §2）→ Task 2 目录仅含 UI 文案；`STAGES`/匹配串/`'新选题'` 明确保持（Task 9/10/15 注记）。✓
- `stageLabel` 显示映射（spec §2.3）→ Task 2 `STAGE_LABELS` + Task 3 `stageLabel` + Task 8/9/10/13 使用。✓
- i18n 模块（spec §3）→ Task 1/2/3。✓
- 设置项（spec §4）→ Task 4（模型）+ Task 6（UI 下拉 + 切换重绘）。✓
- 注入与数据流（spec §5）→ Task 5（main.translator）+ Task 6/7/13/14/15。✓
- 品牌标题中文化（spec §1 决策）→ Task 2 `hero.*`/`mission.title`/`pulse.title`/`dock.*` 等。✓
- 测试策略（spec §6）→ Task 1/2/3 新测；Task 4/6/7/13/14/15 既有测试适配；"切 en 后 stage 存储值不变"由 `STAGE_LABELS` 仅作显示 + 比较保持原值保证（Task 9 注记）。✓

**2. Placeholder scan：** 无 TBD/TODO；每个代码步骤含完整代码或精确替换映射。✓

**3. Type consistency：** `Translator.t(key, params?)`/`stageLabel(stage)` 跨任务一致；`LanguageSetting`/`isLanguageSetting` 在 settings.ts 定义并复用；`render(..., t: Translator)` 与各子渲染器形参一致；`reportError`/`showActionError` 改用 `TranslationKey` 参数一致。✓

> **执行顺序提示：** Task 7 引入的"实参过多"编译错误需 Task 8–12 全部完成后才整体消除；建议把 Task 7–12 作为一个连续批次执行，期间仅在 Task 12 末尾要求 typecheck 全绿。
