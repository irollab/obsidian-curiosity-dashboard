# Curiosity Dashboard 中英文切换设计

- 日期：2026-06-24
- 状态：已批准设计，待编写实施计划
- 范围：设置面板 + 仪表盘界面文案的中/英切换（不含数据值）；默认跟随 Obsidian 界面语言

## 1. 目标与约束

- 在插件设置中新增"界面语言"切换，支持 `跟随 Obsidian` / `中文` / `English`。
- 切换后，设置面板与仪表盘的**界面文案**实时切换语言。
- **品牌/装饰性标题**（Content Studio、Mission Control、This Week、Channel Pulse、Production Queue、Quick Look、Quick Actions、Chase your curiosity、dock 标签等）也**纳入翻译**：`zh` 模式译为中文，`en` 模式用现有英文。
- **绝不**翻译与 vault 数据绑定的值（frontmatter 字段值、文件夹结构、Markdown 解析匹配串），以免破坏数据匹配与存储。
- 仅支持 `zh` / `en` 两种语言。不引入第三方 i18n 库、不做复数规则引擎（参数化简单插值即可，YAGNI）。

## 2. 数据 / UI 边界（关键决策）

经对 `src/` 全量排查，明确区分两类中文字符串。

### 2.1 保持原样（数据值 —— 翻译会破坏匹配/存储）

| 位置 | 内容 | 原因 |
| --- | --- | --- |
| `domain/stages.ts` | `STAGES = ['选题','策划','制作','发布','复盘']` | frontmatter `stage` 值、文件夹映射、代码比较（如 `=== '复盘'`）、存储值 |
| `domain/checklist.ts` | 默认 heading `'本期执行清单'` | 解析用户 Markdown 的匹配串 |
| `data/dashboard-data-service.ts` | `type === '选题'`、`homepage_focus`、期号正则 `(?:第)?…(?:期\|-\|_)` | frontmatter 值与文件名匹配 |
| `data/topic-repository.ts` | `status === '已立项'`、`stage === '复盘'`、`type === '选题'`、basename 正则 | frontmatter 值匹配 |
| `data/review-metrics-service.ts` | heading 集合 `'评论区需求'/'评论反馈'/'评论样本'` | Markdown heading 匹配 |
| `data/association-resolver.ts` | 期号正则 | 文件名匹配 |
| `domain/review-table.ts` | 列别名 `平台/采集时间/播放…`、heading 匹配 `数据快照/作品信息…`、`平台：` 声明正则 | 解析用户表格/段落 |
| `mutations/template-creation-service.ts` | Windows 设备名正则 | 文件名安全校验 |

### 2.2 纳入翻译（界面文案）

| 文件 | 文案类别 |
| --- | --- |
| `settings.ts` | 全部设置项标签（含新增语言项）、保存失败 Notice |
| `ui/dashboard-renderer.ts` | 标签页 `Overview/Tasks/Data` 标签、`aria-label` |
| `ui/renderers/hero.ts` | 标题、各状态文案、按钮（"打开当前脚本""创建脚本""查看选题卡"…）、fact 标签、`未知阶段`、`下一步未设置`、移动端只读提示 |
| `ui/renderers/mission-control.ts` | `Mission Control`、`推进阶段`、`本期执行清单`、`Quick Look`、各只读/阶段说明、`未知阶段`、关联候选提示、Quick Look 链接标签（选题卡/脚本/素材/复盘）、移动端 title |
| `ui/renderers/this-week.ts` | `This Week`、空态、`未设置`、`另有 N 项` |
| `ui/renderers/production-queue.ts` | `Production Queue`、空态、`未设置`、`另有 N 项` |
| `ui/renderers/channel-pulse.ts` | `Channel Pulse`、表格 caption、**展示列头**、空态、数据来源按钮、`评论区需求`(展示标题)、`另有 N 条…` |
| `ui/renderers/quick-actions.ts` | `Quick Actions`、按钮、只读提示、`aria-label` |
| `ui/renderers/dock.ts` | dock 标签（Ideas/Mission/Tasks/Script/Data/Review/Settings）、disabled 原因文案 |
| `ui/confirm-stage-modal.ts` | 标题、确认/取消按钮、`从「X」推进到「Y」？`、终止阶段提示 |
| `ui/create-file-modal.ts` | heading（创建选题卡/脚本/发布复盘）、字段标签（期数/标题/目标路径）、按钮、全部校验错误文案 |
| `curiosity-dashboard-view.ts` | 加载态、错误态、移动端禁用态、全部 `Notice`、创建/关联失败拼接文案、heading 文案 |
| `main.ts` | `reportError` 调用的上下文文案、`未知错误` 兜底 |

### 2.3 特殊处理 —— 阶段显示

- `STAGES` 值仍是**数据**，存储与比较不变。
- 新增 `stageLabel(stage: Stage): string` 用于**显示**：`zh` 下 `label === 值`；`en` 下映射 `选题→Topic`、`策划→Plan`、`制作→Produce`、`发布→Publish`、`复盘→Review`。
- 渲染器中所有"显示 stage"处（mission-control 阶段轨、hero fact、this-week/production-queue 的 meta、confirm-stage 的 `从「X」到「Y」`）改用 `stageLabel`，但 `=== '复盘'` 等比较保持对原始值。
- channel-pulse 的展示列头改走 i18n key；`review-table.ts` 的解析别名不动。

## 3. 新增模块 `src/i18n/`

### 3.1 `locale.ts`
```ts
export type Locale = 'zh' | 'en';
export type LanguageSetting = 'auto' | 'zh' | 'en';

// obsidianLang 由调用方注入（保持纯函数可测）
export function resolveLocale(setting: LanguageSetting, obsidianLang: string | null): Locale;
```
- `setting === 'auto'`：`obsidianLang` 以 `zh` 开头（含 `zh-TW`/`zh-CN`）→ `zh`，否则 → `en`，`null`/空 → `en`。
- 显式 `'zh'`/`'en'`：直接返回。

### 3.2 `translations.ts`
- `type TranslationKey = ...`（联合字面量，编译期保证 key 完整）。
- `const TRANSLATIONS: Record<TranslationKey, Record<Locale, string>>`。
- 参数化项以函数形式提供（如 `anotherNItems(count)`），简单字符串插值。

### 3.3 `translator.ts`
```ts
export interface Translator {
  readonly locale: Locale;
  t(key: TranslationKey, params?: Record<string, string | number>): string;
  stageLabel(stage: Stage): string;
}
export function createTranslator(locale: Locale): Translator;
```

## 4. 设置项变更

- `DashboardSettings` 增 `language: LanguageSetting`，`DEFAULT_SETTINGS.language = 'auto'`。
- `parseSettings`：增 `language` 校验，非法值回落 `'auto'`。
- `DashboardSettingTab`：
  - 构造/`display` 时取 `plugin.translator()`，所有 `setName` 改用 `t(...)`。
  - 新增下拉「界面语言 / Language」：`{ auto: 跟随 Obsidian, zh: 中文, en: English }`。
  - `onChange`：`updateSetting('language', value)` → `this.display()` 重绘设置页（`saveSettings` 已触发视图刷新）。

## 5. 注入与数据流

- `main.ts` 新增：
  ```ts
  translator(): Translator {
    const lang = window.localStorage.getItem('language'); // Obsidian 界面语言
    return createTranslator(resolveLocale(this.settings.language, lang));
  }
  ```
  `reportError` 改用 translator 文案（上下文 key + 错误明细）。
- `DashboardSettingTab` 构造接受 `plugin`，内部取 `plugin.translator()`。
- `CuriosityDashboardView`：每次 `renderModel` 前取 `plugin.translator()`，传入 `renderer.render(container, model, handlers, activeTab, translator)`；加载/错误/移动端态与所有 `Notice` 改用该 translator。
- `DashboardRenderer.render(...)` 增 `translator` 形参，逐层透传给各 render 函数。
- Modal：`ConfirmStageModal.ask(app, stage, translator)`、`CreateFileModal.ask(app, defaults, translator)`；create-file 的 `heading` 由调用方用 `t` 生成后放入 `defaults`。
- 刷新链路复用既有 `saveSettings()` → `scheduleRefresh()`，语言改变即触发仪表盘重绘，无需新机制。

## 6. 测试策略（vitest + 既有 fake-dom / fake-vault-gateway）

- `i18n/locale.test.ts`：`resolveLocale` 全分支（auto + 各 Obsidian 语言、显式 zh/en、null/非法回落）。
- `i18n/translations.test.ts`：每个 key 同时具备非空 zh/en；参数化函数正确插值。
- `i18n/translator.test.ts`：`t` 命中/参数插值；`stageLabel` 在 zh/en 的映射；en 下 5 个阶段映射齐全。
- `settings.test.ts`（扩展）：`language` 解析与默认、非法回落；面板渲染语言下拉与切换后重绘。
- 渲染器/modal 测试（扩展）：传入 fake translator，断言 en/zh 文案；并断言切 en 时 **stage 存储/比较值未变**（防回归数据边界）。
- `curiosity-dashboard-view.test.ts`（扩展）：加载/错误/Notice 走 translator。

## 7. 工程原则映射

- **DRY**：单一 `TRANSLATIONS` 目录，杜绝散落字符串。
- **SOLID-S**：locale 解析 / 目录 / translator 三文件各司其职。
- **YAGNI**：仅 zh/en；无第三方库；无复数引擎。
- **KISS**：复用既有刷新链路与 DI 风格；纯函数便于测试。
- **OCP**：新增语言只需扩 `Locale` 与目录，不改渲染器签名。

## 8. 风险与缓解

- **遗漏数据边界**：通过 2.1 清单 + 渲染器测试断言"切 en 后 stage 存储值不变"防回归。
- **签名扩散**：translator 参数追加在末位，机械改动，TypeScript 编译兜底。
- **Obsidian 语言读取差异**：`localStorage('language')` 可能为空 → `resolveLocale` 兜底 en；逻辑集中单点便于调整。
