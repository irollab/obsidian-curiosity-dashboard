# 安装与配置

## 手动安装

1. 下载或在本地构建同一版本的 `main.js`、`manifest.json` 和 `styles.css`。
2. 在目标 Vault 中创建 `.obsidian/plugins/curiosity-dashboard/`。
3. 把且仅把上述三个文件放入该目录。
4. 重启 Obsidian，或在“设置 → 第三方插件”中点击重新加载。
5. 关闭受限模式（如果当前开启），在“已安装插件”中启用 Curiosity Dashboard。

不要从不可信来源安装构建文件。首次尝试建议使用独立开发 Vault，而不是直接使用主 Vault。

## 配置

在“设置 → Curiosity Dashboard”中检查：

- 选题、脚本、素材和复盘目录；默认为 `10-选题池`、`40-脚本大纲`、`20-素材库`、`60-发布复盘`。
- 选题、脚本和复盘模板的 Vault 内路径；默认为 `99-模板/` 下的对应 Markdown 文件。
- 背景图的 Vault 内路径。背景图不会随仓库或发布包分发；路径为空或文件缺失时使用纯黑 Hero。
- 是否启动时打开、默认标签和简化移动视图。移动端始终只读。

字段与 Markdown 格式见 [fields.md](fields.md)。

## 独立 Vault 验证

1. 新建一个临时 Vault，安装三个发布文件。
2. 复制 `examples/topic.md` 和 `examples/review.md` 到对应的配置目录，保持期数唯一。它们全部是示例数据。
3. 依次检查：零/一/多焦点状态、任务勾选、阶段确认与过期写入保护、三种模板创建、重名禁止、背景缺失回退、复盘解析、窄窗口布局和移动只读。
4. 在 Obsidian 开发者工具 Network 中确认插件未发起网络请求。

该清单需要在真实 Obsidian 开发 Vault 中手动执行；仓库单元测试不等于实机验证。

## 升级与卸载

- 升级前关闭插件，备份 Vault，再同时替换三个发布文件，不要混用版本。
- 卸载时先禁用插件，然后删除 `.obsidian/plugins/curiosity-dashboard/`。
- 升级和卸载都不会删除选题、脚本、素材、复盘或其他 Vault 数据。

## 故障排查

- **插件未出现**：检查目录名是否精确为 `curiosity-dashboard`，三个文件是否在该目录根部，然后重新加载 Obsidian。
- **首页无当前作品**：确认配置的选题目录正确，且恰好一篇文件包含 `type: 选题` 和 `homepage_focus: true`。
- **显示多焦点**：手动保留一个 `homepage_focus: true`，不要让插件猜测。
- **关联冲突**：在选题 Frontmatter 写入明确的 `script_path`、`asset_path` 或 `review_path`。
- **无任务**：检查精确标题 `## 本期执行清单` 和有文字的 Markdown Checkbox。
- **无平台数据**：检查表头别名和来源复盘路径；插件不会从普通正文猜数字。
- **创建操作不可用**：移动端是只读的；桌面端请检查模板文件和目标目录。
