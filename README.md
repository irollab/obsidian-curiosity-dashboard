**Curiosity Dashboard**

`Chase your curiosity` — 把创作者 Vault 中的本地 Markdown 变成电影感、macOS 视觉语言的 Obsidian 内容生产工作台。

# What it does

插件直接读取现有选题、脚本、素材和发布复盘，不移动历史文件。界面使用纯净中性大卡、macOS 窗口元素和局部高纯度、高饱和色彩，避免大面积脏渐变和外发光。

七个模块是：

1. Hero：`Chase your curiosity`、当前期数、阶段和下一步。
2. Mission Control：五阶段、Checklist、关联文件和受控推进。
3. This Week：本机时区周一至周日的 `due_date` 排期。
4. Production Queue：已立项且非当前焦点的后续作品。
5. Channel Pulse：本地复盘表格中可验证的平台指标和评论需求。
6. Quick Actions：经确认后从配置模板创建选题、脚本和复盘。
7. macOS Dock：选题、当前作品、脚本、复盘、数据和设置的真实命令入口。

# Screenshots

仓库不提供用户生产 Vault 的截图，也不随仓库分发用户背景图。如需贡献截图，请在独立开发 Vault 使用明确标记的示例数据，并先移除账号、文件路径、私密评论和其他个人信息。

# Install

将同一版本的 `main.js`、`manifest.json`、`styles.css` 以及 `fonts/` 目录（含 `SmileySans-Oblique.woff2` 与 `OFL.txt`）放入：

```text
<your-vault>/.obsidian/plugins/curiosity-dashboard/
```

然后在 Obsidian 的第三方插件设置中启用。完整步骤、升级、卸载和故障排查见 [docs/installation.md](docs/installation.md)。

# Configure your vault

在插件设置中配置选题、脚本、素材和复盘目录，三种模板，以及 Vault 内背景图路径。选题文件需要使用唯一 `homepage_focus: true` 标记当前作品。背景图仅由 Obsidian 本地资源 URL 加载，不会复制进插件或发布包。

主 Vault onboarding 只有建议补丁，尚未自动应用：[docs/onboarding-patch.md](docs/onboarding-patch.md)。

# Supported data

支持选题 Frontmatter、精确 `## 本期执行清单` 下的 Checkbox、跨平台复盘表、单平台数据快照，以及“评论区需求”“评论反馈”“评论样本”列表。插件不会从普通正文推断数字或补全缺失平台。

完整字段、类型、fallback 和空状态见 [docs/fields.md](docs/fields.md)；可解析的虚构数据见 [examples/topic.md](examples/topic.md) 和 [examples/review.md](examples/review.md)。

# Privacy and safety

- 运行时零网络：不依赖外部 API、CDN、远程字体或图标。
- 运行时不依赖 Bases、Dataview、React、Tailwind 或 Framer Motion。
- 不上传 Vault 内容，不执行 Shell、Codex 或外部程序，不删除、移动或重命名 Vault 文件。
- 写入仅限当前 Checklist 标记、经确认的单步阶段推进、经预览的模板创建，以及受控写入 `script_path`、`asset_path` 和 `review_path` 关联字段。
- 移动端始终只读。

# Development

需要 Node.js 24：

```powershell
npm ci
npm test
npm run typecheck
npm run build
npm run package
```

CI 在 Windows 和 macOS 上执行安装、测试、生产构建、打包和 ZIP 内容验证。真实 Obsidian 视觉、交互和 Network 检查仍必须按 [独立 Vault 验证清单](docs/installation.md#独立-vault-验证) 手动完成；自动测试不代表实机 smoke test 已执行。

# Release files

`npm run package` 先执行生产构建，再清理 `dist/`，并生成：

```text
dist/curiosity-dashboard/main.js
dist/curiosity-dashboard/manifest.json
dist/curiosity-dashboard/styles.css
dist/curiosity-dashboard/fonts/SmileySans-Oblique.woff2
dist/curiosity-dashboard/fonts/OFL.txt
dist/curiosity-dashboard-<version>.zip
```

ZIP 中只有 `curiosity-dashboard/` 下述发布文件，不包含源码、示例、用户数据或背景图：

- `main.js`、`manifest.json`、`styles.css` — 插件主体。
- `fonts/SmileySans-Oblique.woff2` — 得意黑 Smiley Sans v2.0.1 网页字体，仅用于展示性标题/期数，随插件离线加载（运行时不请求远程字体）。
- `fonts/OFL.txt` — Smiley Sans 的 SIL Open Font License 1.1 全文，保留来源、版本与许可。

版本号来自 `package.json` 并必须与 `manifest.json` 一致，目录 ID 来自 `manifest.json`。打包命令会立即解析 ZIP 的 central/local headers，验证条目集合、UTF-8 标志、CRC、解压长度与源文件内容；任一检查失败则命令失败。

# License

No open-source license has been selected for V1. All rights are reserved unless the repository owner adds a license later.
