# Curiosity Dashboard · 「发现」灵感发现 tab 设计

- 日期：2026-06-26
- 状态：设计已批准，待写实现计划
- 关联：`2026-06-25-curiosity-workflow-cockpit-design.md`（提示词驾驶舱，前后衔接）

## 1. 背景与目标

**痛点**：没灵感的时候，不知道做什么选题。

**目标**：在 `curiosity-dashboard` 插件里新增「发现」tab，作为「灵感枯竭」入口，贯通一条完整链路：

```
收集热点（外部抓取） × 我的受众反馈（vault 内部信号）
  → 拼「生成选题卡」提示词 → 复制进 Codex → Codex 写卡到 10-选题池/待评估
  → 切到「工作流」tab，既有 评估→大纲→成稿→复盘 接管
```

「发现」处理"没选题时灵感从哪来"，「工作流」处理"已有选题怎么往下推"，两者同构、前后衔接、各自独立可测。

## 2. 已确认决策

1. **数据来源 = 插件内置抓取**。突破现有「不联网」原则，引入网络层（仅锁在抓取适配器内）。
2. **热点源（4 类全要，可插拔适配器）**：技术社区类（GitHub Trending / HN / Product Hunt）、国内平台热榜（微博热搜 / 知乎 / B 站，聚合 API）、官方发布源（Anthropic/OpenAI changelog、release notes）、订阅型 RSS（用户自配）。
3. **用户关注方向 = 我自己受众的反馈**（vault 内部信号）。热点给"时机"，受众反馈给"角度"。
4. **生成选题 = 插件只拼提示词，Codex 写卡**。插件不做语义聚类/重打分（KISS）；下游评估→大纲→成稿仍走现有 Codex 驾驶舱。
5. **受众反馈源（3 类全要）**：灵感收集箱 / 待评估选题卡、复盘里的评论/高问点、专门的评论收集档。
6. **「归档本次热点」= 正式功能**（非可选）：把本次抓取写一篇 `30-竞品热点/热点观察/YYYY-MM-DD-热点.md`，与现有「9-联网核验热点」产出目录同源。
7. **入口形态 = 独立「发现」tab**（方案 A）。tab 集合变 `overview/tasks/workflow/discover/data`，「发现」插在 workflow 后。

## 3. 架构分层（沿用现有 Clean Architecture）

```
domain/discovery.ts              ← 类型：Hotspot / AudienceSignal / TopicSpark
data/hotspot-sources/            ← 【新增网络层】可插拔抓取适配器
  ├─ hotspot-source.ts           ← 统一接口 HotspotSource { id, label, fetch() }
  ├─ tech-community-source.ts    ← GitHub Trending / HN / Product Hunt
  ├─ domestic-trending-source.ts ← 微博热搜 / 知乎 / B站（聚合 API）
  ├─ official-release-source.ts  ← Anthropic/OpenAI changelog、release notes
  └─ rss-source.ts               ← 用户自配 RSS 列表
data/hotspot-fetch-service.ts        ← 编排：并发抓取 + 逐源错误隔离 + 缓存去重
data/audience-signal-repository.ts   ← 读 vault：灵感收集箱/待评估 + 复盘高问点 + 评论收集档
mutations/discovery-prompt-builder.ts ← 纯逻辑：选中热点×匹配受众 → 拼「生成选题卡」提示词
mutations/hotspot-archive-builder.ts  ← 纯逻辑：拼「归档本次热点」markdown
ui/renderers/discover-deck.ts        ← 「发现」tab 渲染
```

**关键边界：**
- **网络是新的、唯一的"脏"依赖**，全部锁在 `data/hotspot-sources/` 内，用 Obsidian 原生 `requestUrl`（绕 CORS）。
- 纯逻辑（`discovery-prompt-builder`、`hotspot-archive-builder`）保持纯函数可测，不碰网络/剪贴板/写盘。
- `writeClipboard`/`revealPath`/`vault.create` 仍在 view 层用 Obsidian API，不进数据端口（沿用 ISP 修正）。
- 抓取适配器实现同一接口（DIP）：新增源 = 加一个文件，不改编排器（OCP）。

## 4. 数据流

```
[点「刷新热点」]
   → HotspotFetchService.fetchAll()
        ├─ 并发调用 4 类 source.fetch()（Promise.allSettled，逐源隔离）
        ├─ 每源失败 → 记 sourceError，不中断其他源
        └─ 合并 → 按标题/URL 去重 → 缓存进 data.json（带 fetchedAt）
   → AudienceSignalRepository.collect()（纯读 vault，不联网）
        ├─ 灵感收集箱.md + 待评估/*.md frontmatter
        ├─ 60-发布复盘/*.md 的 audience_questions: []
        └─ 评论收集档（默认 20-素材库/受众问题.md）
   → discover-deck 渲染：左栏热点（按源分组）／右栏受众信号
   → [勾选 N 个热点 + 关联 M 条受众信号]
   → DiscoveryPromptBuilder.build(选中热点, 选中信号, 去重上下文=现有选题标题列表)
   → [一键复制] → Obsidian clipboard → 粘进 Codex → Codex 写卡到 10-选题池/待评估
   → [切到「工作流」tab] → 既有 评估→大纲→成稿→复盘 接管
```

并行支线：`[归档本次热点]` → `hotspot-archive-builder.build(本次热点)` → view 层 `vault.create` 写 `30-竞品热点/热点观察/YYYY-MM-DD-热点.md`。

## 5. 错误隔离与缓存

**错误隔离（网络新风险，重点）：**
- `Promise.allSettled` 逐源隔离：某源挂了不影响其他源。
- 每源独立状态 `ok / failed / stale`；失败源 UI 显示「⚠️ 本源抓取失败，显示上次缓存」，不整面板白屏。
- 单源超时（默认 8s）即放弃该源，不阻塞渲染。
- 降级到缓存：任一源失败回落 data.json 上次成功快照，附「数据时间」。

**缓存策略（KISS）：**
- 缓存落 `data.json`：`hotspotCache: { [sourceId]: { items, fetchedAt, status } }`。
- 默认**手动刷新**，不做定时轮询（YAGNI，不引入后台计时器）。
- 进入 tab 时缓存 < `hotspotCacheTtlHours`（默认 6h）直接用缓存，避免每次开面板都打外网。

## 6. 受众信号读取契约

```ts
type AudienceSignal = {
  text: string                        // 问题/高赞点原文
  kind: '问题' | '高赞' | '灵感'
  source: string                      // 来源文件短标签（不裸露 path，沿用铁律）
  weight?: number                     // 可选：出现次数/点赞，缺省 1
}
```

三类源读取约定：
1. **灵感收集箱 / 待评估卡**：扫 `10-选题池/待评估/*.md`。收集箱按正文 `- ` 列表项拆信号；选题卡读 frontmatter（标题 + 已有 `score/note`）。
2. **复盘高问点**：扫 `60-发布复盘/*.md` 的 frontmatter `audience_questions: []`（**新增约定字段**，复盘时填）。无该字段的旧复盘安全跳过，不报错。
3. **专门评论收集档**：约定单文件 `20-素材库/受众问题.md`（settings 可配），按列表项逐条读。

**匹配呈现（轻量）：** 不做语义聚类；右栏受众信号按 `weight` 倒序，用户手动勾选与某热点关联的信号。插件只把"勾的热点 + 勾的信号 + 现有选题标题去重表"拼进提示词，判断交给 Codex。

## 7. 归档本次热点

- view 层用 Obsidian `vault.create` 写 `30-竞品热点/热点观察/YYYY-MM-DD-热点.md`。
- 内容：frontmatter（`date / sources / count`）+ 按源分组的热点条目（标题·链接·日期·所属源）。
- 同日重复归档则文件名追加序号 `-2`、`-3`…。
- 纯拼 markdown 放可测 `hotspot-archive-builder`，写盘动作留 view 层（ISP）。

## 8. 提示词模板

新增模板 `99-模板/codex-提示词/11-从热点+受众生成选题卡.md`（带 frontmatter + `{{placeholder}}`，沿用现有 prompt-template 机制，可热更新）。占位符：`{{hotspots}}`、`{{audience_signals}}`、`{{existing_titles}}`、`{{inbox_dir}}`、`{{topic_template}}`。由 `prompt-seed-service` 纳入种子生成。

## 9. 测试策略（TDD + vitest 基线）

- **纯逻辑（高覆盖）**：`discovery-prompt-builder`（拼词/去重）、`hotspot-archive-builder`（markdown 生成/同日追加序号）、各 source 的**解析函数**（喂固定 HTML/JSON 样本 → 断言 Hotspot[]，不打真网）。
- **编排**：`hotspot-fetch-service` 用 mock source 测——逐源失败隔离、降级缓存、去重、超时。
- **仓库**：`audience-signal-repository` 喂 in-memory vault gateway 测三类源解析 + 旧文件安全跳过。
- **网络适配器**：`fetch()` 仅薄封装（requestUrl + 调已单测的解析函数），集成留手动冒烟。
- model / i18n / settings / 新 tab 接线沿用现有模式补测。

## 10. 新增配置（DashboardSettings）

- `rssSources: string[]` — 用户自配 RSS 列表
- `commentDocPath: string` — 默认 `20-素材库/受众问题.md`
- `hotspotCacheTtlHours: number` — 默认 6
- `enabledHotspotSources: string[]` — 启用的热点源 id 列表

## 11. 范围与非目标（YAGNI）

- 不做定时后台轮询、不做语义聚类/自动打分、不做插件内 LLM 调用。
- 不持久化「发现会话」状态；选完即拼提示词，轻闭环。
- 受众信号匹配靠人工勾选，不做 NLP 相似度。
