# Obsidian Curiosity Dashboard 设计规格

- 状态：已批准，等待实施计划
- 日期：2026-06-22
- 仓库：`irollab/obsidian-curiosity-dashboard`
- 产品主题：`Chase your curiosity`

## 1. 背景

现有 Obsidian 仓库已经覆盖选题、脚本、制作、发布和复盘，但首页仍以目录和链接为主，无法优先回答三个问题：当前作品是什么、进展到哪一步、下一步应该做什么。

本项目将实现一个自定义 Obsidian 插件，把现有 Markdown 数据呈现为电影感、macOS 风格的内容制作工作台。插件必须继续使用本地 Markdown 作为唯一事实来源，不移动历史文件，不伪造缺失数据，也不依赖外部平台 API。

## 2. 目标

1. 提供独立 `ItemView` 首页，并保留原 Markdown 首页作为降级入口。
2. 自动识别当前一期、生产阶段、本期任务、本周作品、后续队列和最近复盘。
3. 提供 macOS 风格窗口、菜单条、分段控件、Dock 和系统色视觉语言。
4. 支持受控写入：任务勾选、阶段推进以及从模板创建选题、脚本和复盘。
5. 允许用户选择 Vault 内的任意背景图，默认不分发用户提供的背景资产。
6. 以公开 GitHub 仓库和手动安装包交付，但 V1 不提交 Obsidian 社区插件市场。

## 3. 非目标

- 不实时连接抖音、小红书、B站、YouTube 等平台。
- 不启动终端、Codex 或其他外部程序。
- 不删除、移动或重命名 Vault 文件。
- 不把 Bases 作为运行依赖。
- 不复刻 React、Tailwind、Framer Motion 或视频背景网页。
- 不在 V1 提供任意字段编辑器、拖拽看板或自定义查询语言。
- 不在移动端开放文件写入。

## 4. 产品结构

插件首页包含七个模块。

### 4.1 Hero

- 展示 `Chase your curiosity`、当前期数、当前阶段和下一步动作。
- 使用用户配置的 Vault 背景图；缺失时回退到纯黑背景。
- 主按钮打开当前作品，次按钮打开对应选题卡。

### 4.2 Mission Control

- 展示当前作品标题、五阶段进度、本期执行清单和快捷链接。
- 五阶段固定为：`选题 → 策划 → 制作 → 发布 → 复盘`。
- 支持直接勾选任务，并通过确认按钮向前推进一个阶段。

### 4.3 This Week

- 查询本周到期且尚未完成复盘的作品。
- 本周按本机时区的周一 00:00 至周日 23:59 计算。
- 数据只来自 `due_date`；缺失日期的作品不进入本周列表。
- 不根据最近修改时间推断截止日期。

### 4.4 Production Queue

- 查询 `type: 选题` 且 `status: 已立项` 的作品。
- 当前焦点作品不重复显示。
- 显示期数、标题、阶段、优先级和截止日期；字段缺失时显示“未设置”。

### 4.5 Channel Pulse

- 从 `60-发布复盘` 的 Markdown 表格读取已有平台数据。
- 当前作品存在 `review_path` 时优先读取该文件；否则按 `created`、`publish_date` 的先后顺序选择最新复盘。两个字段都缺失时不使用文件修改时间猜测，改为显示复盘入口。
- 显示平台、播放或观看、点赞、收藏、评论、分享和采集时间中实际存在的字段。
- 所有指标显示来源文档和采集日期。
- 不计算缺失字段，不把不同平台口径包装成统一指标。

### 4.6 Quick Actions

- 从模板创建选题卡。
- 为当前期数创建脚本文件。
- 为当前作品创建发布复盘。
- 打开当前作品、脚本、素材和复盘。
- 推进当前阶段。

默认命名规则：

- 新选题必须由用户输入期数和标题，默认文件名为 `{issue}-{sanitized-title}.md`。
- 脚本默认文件名为 `{issue}-{sanitized-title}成稿.md`。
- 综合复盘默认文件名为 `第{issue}期-{sanitized-title}-综合复盘.md`。
- `sanitized-title` 仅移除 Windows、macOS 和 Linux 文件名中不允许的字符，不改写标题语义。
- 所有默认文件名和目标路径都必须在确认弹窗中允许修改。

### 4.7 macOS Dock

- Dock 是上述真实命令的入口，不是装饰组件。
- 图标对应选题、排期、脚本、发布、数据和设置。
- 使用内联 SVG 图标，不依赖远程字体或图标服务。

## 5. 视觉系统

### 5.1 方向

- 主题：`Chase your curiosity`。
- 背景：用户提供的高饱和灵感隧道图片，仅用于 Hero。
- 内容区：纯黑或中性深蓝单色底。
- macOS 元素：顶部菜单条、三色窗口控制点、标题栏、分段控件、Quick Look、Dock、系统级圆角。

### 5.2 色彩

| 用途 | 色值 |
| --- | --- |
| 页面底色 | `#05060D` |
| 主卡片 | `#10121F` |
| 次级卡片 | `#181B28` |
| 边框 | `#303447` |
| 正文 | `#F7F8FF` |
| 主要操作 | `#0A84FF` |
| 信息强调 | `#00E5FF` |
| 已完成 | `#30D158` |
| 当前制作 | `#BF5AF2` |
| 警示或重点 | `#FF375F` |
| 探索入口 | `#FF9F0A` |

### 5.3 约束

- 大卡片仅使用中性单色背景，不使用彩色渐变。
- 大卡片不使用外发光。
- 高饱和颜色只用于按钮、标签、阶段和细边。
- 不在同一组件中混合青、紫、粉、橙。
- 层次主要依靠间距、明度、边框和排版建立。
- 字体使用 `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`；主题标题使用系统可用衬线字体回退。

## 6. 数据模型

现有字段保持不变，当前作品可新增：

```yaml
issue: 39
homepage_focus: true
stage: 制作
next_action: 确认插件设计
due_date:
script_path:
asset_path:
review_path:
```

规则：

- `status` 继续表示选题是否立项，`stage` 表示内容生产阶段。
- `issue` 缺失时，从文件名开头的数字读取。
- `script_path`、`asset_path`、`review_path` 缺失时，可按期数搜索；无法唯一匹配时要求用户选择，不自动猜测。
- 当前作品必须且只能有一个 `homepage_focus: true`。
- 本期任务来自当前作品中精确标题 `## 本期执行清单` 下的 Markdown Checklist。

## 7. 现有文件兼容

### 7.1 选题卡

- 支持现有 `type`、`status`、`channel`、`platform`、`priority`、`created` 等字段。
- 老文件无需批量迁移。
- 缺失插件字段时显示空状态和配置入口。

### 7.2 复盘文件

解析器支持两种现有格式：

1. 综合复盘中的跨平台表格：表头包含“平台”和“播放/观看”等字段。
2. 单平台采集表中的数据快照：表头包含“时间点”“采集时间”等字段。

解析失败时只显示复盘链接。插件不得用正文语义猜测数字，也不得补齐缺失平台。

### 7.3 评论需求

- 读取“评论区需求”“评论反馈”或“评论样本”标题下的已有文本。
- 没有评论原文时显示“暂无可验证评论内容”。
- 搜索词等旁证必须明确标注为旁证。

## 8. 插件架构

### 8.1 核心组件

- `CuriosityDashboardPlugin`：插件生命周期、命令和设置注册。
- `CuriosityDashboardView extends ItemView`：首页容器与视图状态。
- `DashboardRenderer`：模块化 DOM 渲染，不引入运行时 UI 框架。
- `DashboardDataService`：组合首页所需数据。
- `FocusResolver`：解析唯一当前作品。
- `TopicRepository`：查询选题、阶段和排期。
- `TaskParser`：解析目标标题下的 Checklist。
- `ReviewMetricsService`：解析复盘表格和评论需求。
- `SafeCommandRegistry`：暴露受控动作。
- `VaultMutationService`：执行最小范围文件修改。
- `DashboardSettings`：路径、模板、背景和启动行为。

### 8.2 数据流

```text
打开 ItemView
  → 读取插件设置
  → 通过 Metadata Cache 查询选题与复盘
  → 解析唯一 homepage_focus
  → 读取当前文件并解析 Checklist
  → 组装本周计划、制作队列和频道数据
  → 渲染七个模块
  → 监听 Vault 与 Metadata Cache 事件
  → 防抖后增量刷新
```

### 8.3 运行依赖

- Obsidian API。
- TypeScript 与标准 Obsidian 插件构建链。
- V1 最低 Obsidian 版本为 `1.9.0`。
- 运行时不依赖网络、Bases、Dataview、React 或外部 CDN。

## 9. 写入与安全

### 9.1 允许写入

- 切换当前作品目标标题下的单个 Checkbox。
- 将 `stage` 向前推进一个合法阶段。
- 使用已配置模板创建选题、脚本或复盘。

### 9.2 写入规则

- 修改前重新读取最新内容。
- 使用 Vault API 的安全处理方法更新文件。
- Checkbox 修改只替换目标行的标记，不重写整个正文结构。
- 阶段推进必须确认，`复盘` 为终止状态。
- 创建前展示目标路径和文件名。
- 目标文件存在时禁止覆盖。
- 所有目标路径必须位于当前 Vault 内。

### 9.3 禁止行为

- 不删除、移动或重命名文件。
- 不执行 Shell、Codex 或外部程序。
- 不上传 Vault 数据。
- 不自动修正无法识别的内容。

## 10. 错误与空状态

- 无当前作品：显示设置引导和候选选题。
- 多个焦点：显示冲突列表，不自动选择。
- 无效阶段：显示“未知阶段”，禁用推进按钮。
- 背景图缺失：回退到纯黑背景。
- 关联路径冲突：要求用户选择并保存明确路径。
- 复盘表格无法识别：显示文档入口和解析说明。
- 文件写入期间发生变化：中止本次操作并提示重新执行。
- 模板缺失：打开设置页，不创建空壳文件。

## 11. 设置

- 选题目录。
- 脚本目录。
- 素材目录。
- 复盘目录。
- 选题、脚本、复盘模板路径。
- 背景图片路径。
- 是否在 Obsidian 启动时自动打开 Dashboard。
- 默认打开 Overview、Tasks 或 Data 标签。
- 是否在移动端启用简化视图。

首次启动使用当前仓库结构作为默认值：

- 选题目录：`10-选题池`
- 脚本目录：`40-脚本大纲`
- 素材目录：`20-素材库`
- 复盘目录：`60-发布复盘`
- 模板目录：`99-模板`

## 12. 平台范围

- Windows 和 macOS 桌面版提供完整功能。
- 1280px 及以上显示完整 Mission Control。
- 窄窗口自动改为单列。
- 移动端只读，不允许任务修改、阶段推进或模板创建。
- 不调用任何操作系统专属 API；macOS 仅作为视觉语言。

## 13. 性能

- 使用 Metadata Cache，避免重复解析 Frontmatter。
- Checklist 和复盘表格只在相关文件变化时重新解析。
- Vault 事件采用防抖刷新。
- 大列表先排序和限制数量，再进入 DOM。
- 背景图只在 Hero 使用，并通过 Obsidian 资源 URL 加载。

## 14. 测试策略

### 14.1 单元测试

- 当前作品唯一性解析。
- 文件名期数回退。
- 五阶段合法流转。
- Checklist 标题定位和 Checkbox 修改。
- 两类复盘表格解析。
- 路径推断和冲突检测。

### 14.2 集成测试

- 无焦点、单焦点、多焦点测试 Vault。
- 字段缺失、模板缺失、背景缺失。
- 文件已存在时禁止覆盖。
- 同期修改引发的写入冲突。
- Vault 事件触发后的增量刷新。

### 14.3 UI 与人工验证

- 1280、1440、1920 宽度。
- 窄窗口和移动端只读布局。
- Windows 与 macOS Obsidian 桌面版。
- 使用独立开发 Vault，不在主 Vault 中调试写入功能。

## 15. 交付

- TypeScript 源码。
- `manifest.json`、`main.js`、`styles.css`。
- 安装、配置、字段和故障排查文档。
- 示例选题卡、脚本和复盘文件。
- GitHub Release 手动安装包。
- README 成品截图。
- 不提交用户原始背景图，只说明如何选择 Vault 内图片。
- V1 不提交 Obsidian 社区插件市场。

## 16. 验收标准

1. 插件能在独立视图中打开并恢复上次标签。
2. 唯一焦点作品能自动显示标题、期数、阶段、下一步和 Checklist。
3. 任务勾选和阶段推进只修改预期字段或行。
4. This Week、Production Queue 和 Channel Pulse 不显示推断数据。
5. 三种模板创建不会覆盖已有文件。
6. 背景图失效、数据缺失和焦点冲突都有明确空状态。
7. macOS 视觉在桌面宽度和窄窗口中保持可读。
8. 插件运行时不发起任何外部网络请求。
9. 主 Vault 中的历史文件和制作资产路径不被移动或重命名。

## 17. 参考

- B站参考视频：[Obsidian+AI工作台，如何0代码3步实现？](https://www.bilibili.com/video/BV1tdL863Ey4/)
- Obsidian 插件开发：[Build a plugin](https://docs.obsidian.md/Plugins/Getting%20started/Build%20a%20plugin)
- Obsidian Vault API：[Vault](https://docs.obsidian.md/Plugins/Vault)
- Obsidian 事件：[Events](https://docs.obsidian.md/Plugins/Events)
- Obsidian 插件安全：[Plugin security](https://help.obsidian.md/plugin-security)
