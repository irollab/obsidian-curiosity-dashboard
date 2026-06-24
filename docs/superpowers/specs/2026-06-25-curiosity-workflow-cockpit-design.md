# Curiosity Dashboard 工作流驾驶舱 · 设计文档

- 日期：2026-06-25
- 作者：irol（刈柔实验室）
- 状态：已批准，待写实现计划
- 关联：`00-入口/Codex自动化使用指南.md`、记忆 `curiosity-dashboard-homepage-kanban`

## 1. 背景与问题

`curiosity-dashboard`（v0.1.0）已实现概览/任务/数据三 tab、焦点切换器、按模板新建选题卡/脚本/复盘等**确定性文件操作**。

但真正需要 AI 的环节——评估选题、生成脚本正文、联网核验热点、复盘、沉淀知识——目前仍靠用户**手动把提示词粘进 Codex CLI**。`Codex自动化使用指南.md` 本质是一本"提示词手册"（7 步日常工作流 + 联网核验 + 周复盘 + 常用模板）。

目标：把这本手册的工作流"搬进" Dashboard，使其成为内容生产驾驶舱，而非提示词需要靠记忆手敲。

## 2. 核心决策（已与用户确认）

1. **执行模型 = 提示词驾驶舱**。Dashboard 不内置 LLM、不调 API、不桥接 CLI。它根据当前焦点/目录/模板自动拼好上下文完整的 Codex 提示词，一键复制到剪贴板；用户粘进 Codex 运行。确定性文件操作仍由插件直接做。理由：零密钥零成本、复用现有 Codex 工作流、移动端可用、不重复实现 Codex 已有能力。
2. **提示词源头 = vault 模板文件**。提示词放 `99-模板/codex-提示词/*.md`，带 `{{placeholder}}`，插件读取并填充。可热更新、与 Codex 指南同源、Codex 本身也能读到同一批提示词。
3. **轻闭环**。复制提示词后，高亮"预期输出去哪个目录/文件"，并提供"打开输出位置"按钮去检查 Codex 结果。**不做任务状态持久化**（KISS/YAGNI）。

## 3. 工作流地图

按 5 阶段（选题→策划→制作→发布→复盘）+ 通用分组。每个动作绑定一个提示词模板 + 一个预期输出位置。

| # | 工作流动作 | 绑定阶段 | 需要焦点 | 预期输出位置 |
|---|-----------|---------|---------|------------|
| 1 | 收集灵感 → 整理选题卡 | 选题 | 否 | `10-选题池/待评估` |
| 2 | 批量评估待评估选题 | 选题 | 否 | （只读·给结论，不写文件） |
| 3 | 从选题生成脚本大纲 | 策划 | 是 | `40-脚本大纲/草稿` |
| 4 | 扩写脚本成稿 | 策划 | 是 | `40-脚本大纲/成稿` |
| 5 | 整理素材索引 | 制作 | 否 | `20-素材库/引用资料` |
| 6 | 生成标题/封面文案/简介 | 制作 | 是 | `50-制作中/发布素材` |
| 7 | 发布后做复盘 | 复盘 | 是 | `60-发布复盘` |
| 8 | 沉淀长期知识 | 复盘 | 是 | `70-长期知识` |
| 9 | 🌐 联网核验热点 | 通用 | 否 | `30-竞品热点/热点观察` |
| 10 | 📅 周复盘 | 通用 | 否 | `00-入口/每日记录` |

焦点选题当前所处阶段那一组自动高亮 + 展开，其余折叠。

## 4. 技术架构

沿用现有整洁架构，新增一条独立竖切，与现有选题创建机制平行、互不污染（单一职责）。

### 新增/改动模块

```
domain/
  workflow.ts                     # WorkflowAction 类型 + 占位符契约（纯类型/纯函数）
data/
  prompt-template-repository.ts   # 读 99-模板/codex-提示词/*.md，解析 frontmatter
mutations/
  prompt-builder-service.ts       # 用 DashboardModel 上下文填充 {{占位符}}
  prompt-seed-service.ts          # 冷启动：一键生成默认提示词模板文件（幂等）
ports/
  vault-gateway.ts (扩展)          # +writeClipboard(text)  +revealPath(path)
ui/renderers/
  workflow-deck.ts                # 新「工作流」tab 渲染
```

tab 集合从 `["overview","tasks","data"]` 扩为 `["overview","tasks","workflow","data"]`（第 4 个 tab）。

### 提示词模板文件格式（`99-模板/codex-提示词/`）

每个动作一个 `.md`，frontmatter 描述元数据，正文是提示词本体：

```markdown
---
id: evaluate-topics
label: 批量评估待评估选题
stage: 选题
order: 2
needs_focus: false
output: "10-选题池/待评估"      # 留空 = 只读类（不显示"打开输出位置"）
---
目标：评估 {{inbox_dir}} 下的选题卡，按受众明确、痛点强度、差异化、证据充分、制作成本打分。
范围：只读 {{inbox_dir}}
输出：推荐立项前 3 个并说明原因。
限制：先不要移动文件，先给我结论。
```

### 占位符契约（从 `DashboardModel` + `settings` 自动填充）

| 占位符 | 来源 | 缺失时 |
|--------|------|--------|
| `{{focus_topic}}` `{{focus_title}}` `{{focus_issue}}` | `model.focus.topic` | needs_focus=true 则禁用按钮并提示 |
| `{{focus_script}}` `{{focus_review}}` | 焦点的 scriptPath/reviewPath | 留空占位提示 |
| `{{inbox_dir}}` `{{topic_dir}}` `{{script_draft_dir}}` `{{asset_dir}}` `{{review_dir}}` | `settings`/`data.json` | 用默认值 |
| `{{date}}` `{{week}}` | 系统时间 | — |
| `{{topic_template}}` `{{script_template}}` `{{review_template}}` | settings 模板路径 | — |

复用现有 `KNOWN_TEMPLATE_TOKEN` 思路，抽成可扩展的 `fillPlaceholders(text, context)` 纯函数（DRY：选题创建那套 `{{title|issue|date}}` 并过来共用）。未知占位符保留原样并在 Toast 不报错（宽松填充）。

### 冷启动

首次进「工作流」tab 若 `99-模板/codex-提示词/` 不存在 → 显示 `[生成默认提示词模板]` 按钮。`prompt-seed-service` 把 10 个动作的默认提示词（**直接取自 `Codex自动化使用指南.md` 的措辞**）写入该目录，已存在的文件不覆盖（幂等）。这使"指南"与"插件"同源。

## 5. UI 布局与交互

### 「工作流」tab 布局

```
┌─ 工作流 ────────────────────────────────────┐
│  当前焦点：第39期《…》· 策划阶段              │
│  ▼ 策划  ← 焦点阶段，自动展开+高亮            │
│   ┌ 从选题生成脚本大纲                   ┐    │
│   │ 基于焦点选题创建大纲 → 40-…/草稿     │    │
│   │ [复制提示词]  [打开输出位置]         │    │
│   └────────────────────────────────────┘    │
│  ▷ 选题 (2)  ▷ 制作 (2)  ▷ 发布  ▷ 复盘       │  ← 折叠
│  ▼ 通用   🌐 联网核验热点    📅 周复盘        │
└──────────────────────────────────────────────┘
```

- 按 5 阶段 + 通用分组；焦点所在阶段自动展开高亮，其余折叠。
- 卡片三要素：`label` + 一句话描述 + 按钮区。

### 轻闭环（每张卡）

1. `[复制提示词]` → `prompt-builder` 填充占位符 → `writeClipboard` → Toast：`已复制「批量评估」提示词 · 预期输出 → 10-选题池/待评估`。
2. `[打开输出位置]` → `revealPath`：文件则打开，目录则在文件浏览器定位。只读类动作（无 output）不显示此按钮。
3. 不做任务状态持久化，依赖 Codex 真去写文件，用户点"打开输出"自检。

## 6. 错误处理

| 场景 | 处理 |
|------|------|
| 提示词目录不存在 | 显示 `[生成默认提示词模板]`，不报错 |
| 某模板缺 frontmatter `id`/`label` | 跳过该文件 + 顶部黄条列出被跳过的文件名 |
| needs_focus=true 但无焦点 | 按钮禁用 + `aria-label` 说明"需先设定焦点选题" |
| 移动端只读 | 复制可用（无写盘）；"打开输出"可用；沿用现有 `mobileReadOnly` 语义 |
| 剪贴板写入失败 | Toast 报错 + 回退：把提示词写入临时 `.md` 并打开 |

## 7. 测试策略（vitest，TDD）

- `prompt-builder-service`：占位符全/缺/转义填充；needs_focus 校验。
- `prompt-template-repository`：frontmatter 解析、坏文件跳过、排序（stage→order）。
- `prompt-seed-service`：种子写入幂等（已存在不覆盖）。
- `workflow-deck` 渲染：分组、焦点阶段高亮、禁用态、只读态按钮可见性。
- 全量回归现有 349+ 测试 + `typecheck`（tsc）+ `esbuild` 构建，产物部署回 vault 插件目录。

## 8. i18n

新增 `workflow.*` 键（tab 名、分组名、按钮、Toast、错误）；`zh` 为主，`en` 占位，沿用现有 `translations` 结构。

## 9. 明确不做（YAGNI）

- 不内置 LLM / API Key / 计费。
- 不桥接 Codex CLI（child_process）。
- 不做任务状态持久化 / 任务台 / 结果回填存储。
- 不自动移动文件、不自动发布、不自动判断热点真实性（与 Codex 指南"不建议完全自动化"一致）。
