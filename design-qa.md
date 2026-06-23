# Curiosity Dashboard 视觉验收

## 对照目标

- Source visual truth：`F:\JCloudLab\IROL\自媒体选题\apps\obsidian-curiosity-dashboard\.worktrees\curiosity-dashboard-v1\.visual-qa\reference.png`
- 背景视觉资产：`F:\JCloudLab\IROL\自媒体选题\apps\obsidian-curiosity-dashboard\.worktrees\curiosity-dashboard-v1\.visual-qa\background.png`
- Implementation screenshots：
  - `F:\JCloudLab\IROL\自媒体选题\apps\obsidian-curiosity-dashboard\.worktrees\curiosity-dashboard-v1\.visual-qa\implementation-1440.png`
  - `F:\JCloudLab\IROL\自媒体选题\apps\obsidian-curiosity-dashboard\.worktrees\curiosity-dashboard-v1\.visual-qa\implementation-900.png`
  - `F:\JCloudLab\IROL\自媒体选题\apps\obsidian-curiosity-dashboard\.worktrees\curiosity-dashboard-v1\.visual-qa\implementation-390.png`
- Full-view comparison：`F:\JCloudLab\IROL\自媒体选题\apps\obsidian-curiosity-dashboard\.worktrees\curiosity-dashboard-v1\.visual-qa\comparison-1440.png`
- Focused comparison：`F:\JCloudLab\IROL\自媒体选题\apps\obsidian-curiosity-dashboard\.worktrees\curiosity-dashboard-v1\.visual-qa\comparison-focus.png`

参考截图仅作为信息结构和层级依据。后续确认的视觉要求优先：`Chase your curiosity`、用户提供的背景图、macOS 风格、高纯度系统强调色、中性单色大卡片、禁止大面积彩色渐变和外发光。

## Viewport / State

- Desktop：1440 × 1000，Overview，深色主题，当前阶段为“制作”。
- Tablet：900 × 1000，Overview，深色主题。
- Mobile：390 × 844，Overview，深色主题。
- 静态验收夹具使用与插件渲染器一致的类名和真实 `styles.css`；Dock 图标由 Obsidian 运行时 `setIcon` 注入，静态夹具未模拟图标字形。

## Full-view comparison evidence

- Hero、当前作品、阶段轨道、执行清单、快捷入口和后续内容队列保持清晰的从上到下层级。
- 实现用真实背景图承担视觉记忆点；大卡片使用统一中性深色表面，仅以高纯度青、蓝、紫、橙表示语义状态。
- 1440、900、390 三档均未出现横向页面溢出、卡片相互穿插或文本越界。
- 900 以下 Mission 双栏收为单栏；390 下阶段轨道、操作按钮、队列和评论需求均按可读顺序重排。

## Focused region comparison evidence

- Focused evidence 覆盖 Hero 与 Mission Control：标题层级、期号、当前阶段、下一动作、阶段进度、任务清单和 Quick Look 均可辨识。
- macOS traffic lights、窗口标题栏、半透明 Dock 和系统色状态提供所需桌面系统感。
- Dock 为已确认的 panel-contained sticky 行为，会在当前视口底部短暂覆盖下方内容；内容可继续滚动到 Dock 上方，不阻断操作。

## Findings

- 无 P0、P1、P2 问题。
- P3：静态夹具无法呈现 Obsidian `setIcon` 注入的真实 Dock 图标。实现代码与组件测试已覆盖图标注入，仍需在真实 Obsidian 中做最终肉眼 smoke test。
- P3：窄屏下 Dock 标签密度较高。当前支持横向滚动且不扩大至全视口；后续可评估空闲时自动收起标签，但不应在本期改变已确认交互。

## Required fidelity surfaces

- Fonts and typography：展示标题使用高对比衬线斜体，正文使用系统无衬线；中英文层级、换行和小字号标签均可读。
- Spacing and layout rhythm：Hero 留白、窗口内边距、模块间距和圆角一致；三档响应式未发现断裂。
- Colors and visual tokens：大表面保持中性，强调色为高纯度系统色；没有大面积彩色卡片渐变或外发光。
- Image quality and asset fidelity：使用用户提供的原始背景图，cover 裁切在桌面和移动端均保留中央钥匙孔焦点，未使用占位图或 CSS 绘图替代。
- Copy and content：作品标题、阶段、下一动作、复盘来源和评论需求使用真实语义；未生成缺失指标。
- Accessibility / interaction：按钮有 focus-visible，表格窄屏可横向滚动并固定首列，支持 forced-colors 和 reduced-motion；真实 Obsidian 键盘 smoke test仍为发布前人工项。

## Patches made since previous QA pass

- 将响应式规则限定到命名容器，避免污染 Obsidian 其他视图。
- 1279、900、700 三档分别收敛网格、Hero、Mission、队列和操作区布局。
- Dock 改为面板内 sticky，不使用 fixed 或 100vw。
- 高饱和按钮使用深色前景以满足可读性，模态框增加可滚动约束。
- 视觉夹具改为同源加载真实样式与背景，替换此前因本地资源失败产生的无样式截图。

## Implementation checklist

- [x] 参考图与实现图置于同一比较画布。
- [x] Hero / Mission 重点区域单独比较。
- [x] 1440、900、390 三档全页截图检查。
- [x] 核对字体、间距、色彩、图片、文案、响应式和可访问性。
- [ ] 发布前在真实 Obsidian 1.9+ 独立 Vault 完成 Windows/macOS smoke test。

final result: passed
