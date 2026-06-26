**Curiosity Dashboard**

`Chase your curiosity` — 把创作者 Vault 中的本地 Markdown 变成电影感、macOS 视觉语言的 Obsidian 内容生产工作台。从「灵感发现」到「发布复盘」，一条完整的内容生产流水线。

# 这是什么

一个为**技术型自媒体创作者**打造的 Obsidian 插件。它不替你写内容，而是把你 Vault 里已有的选题卡、脚本、素材、发布复盘组织成一个**可视化驾驶舱**，并接通外部热点信号，解决「没灵感时不知做什么选题」的难题。

核心闭环：

```
发现热点 × 受众反馈 → 拼 Codex 选题提示词 → 写卡到选题池
  → 评估立项 → 脚本大纲 → 扩写成稿 → 发布素材 → 发布复盘 → 沉淀长期知识
```

# 功能总览

插件 5 个 Tab：

## 概览（Overview）
Hero 大图焦点（当前期数 / 阶段 / 下一步）+ 焦点切换器 + 本周排期 + 制作队列 + 渠道脉搏 + 快捷操作。

## 任务（Tasks）
五阶段 Checklist + 关联文件 + 受控推进（策划→制作→发布）。

## 工作流（Workflow）
把 `99-模板/codex-提示词/` 下的提示词模板搬进面板，按阶段分组、一键复制到剪贴板，粘进 Codex/Claude Code 执行。冷启动点「生成默认提示词模板」即可获得 11 个内置工作流动作（收集灵感→评估→脚本大纲→扩写→发布素材→复盘→沉淀→联网核验热点→周复盘 等）。

## 发现（Discover）✨
灵感枯竭时的入口。**抓取外部热点 × 你的受众反馈**，拼成选题提示词：

- **热点源**（内置抓取，可逐源开关）：
  - Hacker News（Algolia 官方 API）
  - GitHub Trending（GitHub 官方 Search API）
  - 订阅 RSS（你自配的技术博客 / Newsletter）
  - 官方发布（Anthropic / OpenAI 等 changelog 的 RSS）
  - 国内热榜（第三方聚合，默认关，服务不稳定时勿开）
- **受众反馈**（读你 Vault 内的信号）：灵感收集箱、待评估选题卡、复盘里的 `audience_questions`、专门的评论收集档。
- **热点列表**：分页浏览、按来源分类过滤（点某个来源即单独聚焦）、来源彩色标签、点击标题在浏览器看原文。
- **生成选题提示词**：勾选热点 + 受众信号 → 一键拼好提示词复制进 Codex → Codex 写卡到 `10-选题池/待评估`。
- **归档本次热点**：把这次抓取写一篇 `30-竞品热点/热点观察/YYYY-MM-DD-热点.md`，和「联网核验热点」工作流同源。
- **打开 Tab 自动刷新**：缓存超过 TTL（默认 6 小时）或为空时自动抓一次；手动刷新也随时可用。

## 数据（Data）
渠道脉搏表格：平台彩色标签、各指标列分色（播放=蓝 / 点赞=粉 / 收藏=金 / 评论=紫 / 分享=绿）、**每列最高值放大突出**，重点数据一目了然。可验证的评论需求与样本。

# 截图

仓库不提供用户生产 Vault 的截图，也不随仓库分发用户背景图。如需贡献截图，请在独立开发 Vault 使用明确标记的示例数据，并先移除账号、文件路径、私密评论和其他个人信息。

# 安装

## 方式一：下载 Release（推荐普通用户）

到 [Releases 页面](https://github.com/irollab/obsidian-curiosity-dashboard/releases) 下载最新版的 `main.js`、`manifest.json`、`styles.css` 三个文件，连同 `fonts/` 目录一起放入：

```text
<你的Vault>/.obsidian/plugins/curiosity-dashboard/
```

目录结构应为：

```text
<你的Vault>/.obsidian/plugins/curiosity-dashboard/
├── main.js
├── manifest.json
├── styles.css
└── fonts/
    ├── SmileySans-Oblique.woff2
    └── OFL.txt
```

然后在 Obsidian：**设置 → 第三方插件 → 关闭「安全模式」→ 找到「Curiosity Dashboard」→ 启用**。

> 如果 `.obsidian/plugins/` 目录不存在，手动创建即可。

## 方式二：从源码构建（开发者）

需要 Node.js 24：

```powershell
git clone https://github.com/irollab/obsidian-curiosity-dashboard.git
cd obsidian-curiosity-dashboard
npm ci
npm run build      # 产出 main.js + styles.css
```

把产出的 `main.js`、`styles.css` 连同 `manifest.json`、`fonts/` 复制到上面的插件目录即可。

打包发布件用 `npm run package`，会在 `dist/` 下生成可直接分发的 `curiosity-dashboard-<version>.zip`。

# 配置你的 Vault

启用插件后，到 **设置 → Curiosity Dashboard** 配置：

## 目录
- 选题池目录（默认 `10-选题池`）
- 选题待评估目录（默认 `10-选题池/待评估`）
- 脚本目录（默认 `40-脚本大纲`）
- 素材库目录（默认 `20-素材库`）
- 复盘目录（默认 `60-发布复盘`）
- 评论收集档路径（默认 `20-素材库/受众问题.md`，「发现」tab 读这里）
- 热点归档目录（默认 `30-竞品热点/热点观察`）

## 模板
- 选题卡 / 脚本大纲 / 发布复盘 三种模板路径（默认在 `99-模板/`）
- 提示词模板目录（默认 `99-模板/codex-提示词`，「工作流」tab 读这里）

## 发现功能
- **RSS 订阅源**：每行一个 URL，技术博客 / Newsletter / 公众号镜像皆可。
- **热点缓存有效期**：小时数，控制「打开发现 tab 自动刷新」的触发阈值（默认 6）。
- **启用的热点源**：逐个开关 HN / GitHub / 订阅RSS / 官方发布 / 国内热榜。

## 焦点
选题卡用 `homepage_focus: true` 标记当前作品（同时只能有一个）。Hero 会展示它，焦点切换器列出其他活跃选题。

完整字段说明见 [docs/fields.md](docs/fields.md)；可解析的虚构数据见 [examples/topic.md](examples/topic.md) 和 [examples/review.md](examples/review.md)。

# 快速上手（5 分钟）

1. **启用插件** → 看「概览」tab（首次可能提示无焦点选题，正常）。
2. **生成提示词模板**：「工作流」tab 点「生成默认提示词模板」，获得 11 个 Codex 工作流动作。
3. **创建第一个选题**：「概览」快捷操作 → 创建选题，或在工作流用「收集灵感→整理选题卡」。
4. **标记焦点**：在选题卡 frontmatter 加 `homepage_focus: true`，Hero 即展示它。
5. **没灵感时**：「发现」tab 点「刷新热点」→ 勾选热点 + 受众反馈 → 「生成选题提示词」→ 粘进 Codex。

# 隐私与安全

- **默认零网络**：核心面板（概览/任务/工作流/数据）不依赖任何外部 API、CDN、远程字体或图标，不上传 Vault 内容。
- **「发现」tab 主动联网**：仅在你打开「发现」tab 并触发热点抓取时，插件会请求你启用的热点源（GitHub / HN / RSS 等公开端点）。请求只读取公开列表，不发送任何 Vault 数据，不携带鉴权信息。GitHub 官方 API 未认证限 60 次/小时。
- **提示词驾驶舱**：插件**不内置 LLM、不调用 API、不桥接 CLI**。它只把拼好的提示词复制到剪贴板，由你粘进 Codex / Claude Code 执行。
- 运行时不依赖 Bases、Dataview、React、Tailwind 或 Framer Motion。
- 不执行 Shell、Codex 或外部程序，不删除、移动或重命名 Vault 文件。
- 写入仅限：Checklist 标记、经确认的阶段推进、经预览的模板创建、受控的关联字段（`script_path`/`asset_path`/`review_path`）、发现功能的缓存（`data.json`）与热点归档文件。
- 移动端始终只读。

# 兼容的数据格式

支持选题 Frontmatter（`type/title/issue/stage/status/score/priority/channel/next_action/homepage_focus` 等）、精确 `## 本期执行清单` 下的 Checkbox、跨平台复盘表、单平台数据快照，以及「评论区需求」「评论反馈」「评论样本」列表。

复盘卡可用 `audience_questions: [问题1, 问题2]` frontmatter 字段记录评论区高频问题，「发现」tab 会读它作为受众信号。

# 开发

```powershell
npm ci
npm test           # vitest 全量测试
npm run typecheck  # tsc 类型检查
npm run build      # esbuild 生产构建
npm run package    # 构建 + 打包发布 ZIP
```

CI 在 Windows 和 macOS 上执行安装、测试、生产构建、打包和 ZIP 内容验证。真实 Obsidian 视觉、交互和 Network 检查仍必须按 [独立 Vault 验证清单](docs/installation.md#独立-vault-验证) 手动完成。

# 发布文件

`npm run package` 生成：

```text
dist/curiosity-dashboard/main.js
dist/curiosity-dashboard/manifest.json
dist/curiosity-dashboard/styles.css
dist/curiosity-dashboard/fonts/SmileySans-Oblique.woff2
dist/curiosity-dashboard/fonts/OFL.txt
dist/curiosity-dashboard-<version>.zip
```

ZIP 中只有 `curiosity-dashboard/` 下的发布文件，不包含源码、示例、用户数据或背景图：

- `main.js`、`manifest.json`、`styles.css` — 插件主体。
- `fonts/SmileySans-Oblique.woff2` — 得意黑 Smiley Sans v2.0.1 网页字体，仅用于展示性标题/期数，离线加载。
- `fonts/OFL.txt` — Smiley Sans 的 SIL Open Font License 1.1 全文。

版本号来自 `package.json` 并与 `manifest.json` 一致。打包命令会立即解析 ZIP 验证条目集合、UTF-8 标志、CRC、解压长度与源文件内容；任一检查失败则命令失败。

# 反馈与联系

- **开源仓库**：https://github.com/irollab/obsidian-curiosity-dashboard
- **问题反馈**：[GitHub Issues](https://github.com/irollab/obsidian-curiosity-dashboard/issues)
- **邮箱**：th@tancem.cn

# License

No open-source license has been selected for V1. All rights are reserved unless the repository owner adds a license later.
