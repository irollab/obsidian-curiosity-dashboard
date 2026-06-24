# Curiosity Dashboard 得意黑字体 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 将官方得意黑（Smiley Sans v2.0.1）以本地 WOFF2 随插件发布，仅用于展示性标题/期数/重点数字，正文与数据字体不变；离线、带 OFL 许可、发布契约强制包含字体与许可。

**Architecture:** `styles.css` 用相对 URL 的 `@font-face` 加载本地 WOFF2，新增 `--curiosity-display-font` 变量（Smiley Sans → 现有 Georgia/宋体回退），仅替换展示性选择器的字体栈。字体与 OFL 作为发布必需文件纳入打包/校验脚本与发布契约测试。运行时不访问网络。

**Tech Stack:** CSS `@font-face`、Node 打包脚本（自写 ZIP）、vitest、esbuild。

> **Git：** 不自动提交（用户全局约定）。每个任务以验证步骤收尾。
> **资源前置：** 官方 release 仅含字体二进制（无许可），OFL 许可需从仓库 `LICENSE` 单独获取。`/tmp` 在命令间不持久，下载与落地须在同一条命令完成。

---

## File Structure

**新增：**
- `fonts/SmileySans-Oblique.woff2` — 本地网页字体（来自官方 v2.0.1 `SmileySans-Oblique.ttf.woff2`）。
- `fonts/OFL.txt` — SIL Open Font License 1.1 全文（来自官方仓库 `LICENSE`）。

**修改：**
- `styles.css` — 顶部加 `@font-face`；`.curiosity-dashboard` 与 `.curiosity-modal` 加 `--curiosity-display-font` 变量；展示性选择器字体栈改用该变量。
- `scripts/package.mjs` — `releaseFiles` 纳入字体与许可；支持子目录（mkdir parent）。
- `scripts/verify-package.mjs` — 同步 `releaseFiles`（内容逐字节校验，二进制可过）。
- `tests/styles.test.ts` — 新增 `@font-face`/变量/离线/展示选择器契约。
- `tests/release-contract.test.ts` — 新增字体与许可为发布必需文件的断言。
- `README.md` — `Release files` 段补充字体与 OFL（保持 H1 标题序列与现有 License 句子不变）。
- 同步 `.obsidian/plugins/curiosity-dashboard/`（fonts/、styles.css、main.js、manifest.json）。

**不动：** 正文 / 按钮 / 任务 / 路径 / 表格 / 代码字体栈；任何数据逻辑、Markdown、frontmatter。

---

## Task 1: 下载并放置字体与 OFL 许可

**Files:** Create `fonts/SmileySans-Oblique.woff2`、`fonts/OFL.txt`

- [ ] **Step 1: 下载并落地（单条命令）**

Run（在插件根目录）：
```bash
mkdir -p fonts && \
curl -sS -L --connect-timeout 30 -o fonts/SmileySans-Oblique.woff2 \
  "https://github.com/atelier-anchor/smiley-sans/releases/download/v2.0.1/smiley-sans-v2.0.1.zip" >/dev/null; \
true
```
> 注意：release 资源是 zip。需先下载 zip 再解压取 `SmileySans-Oblique.ttf.woff2`。改用：
```bash
mkdir -p fonts && cd /tmp && rm -rf smiley && mkdir smiley && cd smiley && \
curl -sS -L --connect-timeout 60 -o s.zip \
 "https://github.com/atelier-anchor/smiley-sans/releases/download/v2.0.1/smiley-sans-v2.0.1.zip" && \
unzip -o s.zip "SmileySans-Oblique.ttf.woff2" >/dev/null && \
cp SmileySans-Oblique.ttf.woff2 "<PLUGIN_DIR>/fonts/SmileySans-Oblique.woff2" && \
curl -sS -L --connect-timeout 30 -o "<PLUGIN_DIR>/fonts/OFL.txt" \
 "https://raw.githubusercontent.com/atelier-anchor/smiley-sans/main/LICENSE"
```
（`<PLUGIN_DIR>` = `F:/JCloudLab/IROL/自媒体选题/apps/obsidian-curiosity-dashboard`）

- [ ] **Step 2: 验证**

Run:
```bash
cd "<PLUGIN_DIR>" && ls -la fonts/ && head -c 4 fonts/SmileySans-Oblique.woff2 | xxd && head -2 fonts/OFL.txt
```
Expected: `SmileySans-Oblique.woff2` ≈ 1.12MB，magic 头为 `wOF2`（77 4f 46 32）；`OFL.txt` 含 `Copyright ... atelierAnchor` 与 `Reserved Font Name`。

---

## Task 2: styles.css 注入 @font-face 与展示字体变量

**Files:** Modify `styles.css`, `tests/styles.test.ts`

- [ ] **Step 1: 先写失败测试（styles.test.ts）**

在 `tests/styles.test.ts` 末尾 `describe` 内新增：
```ts
it('loads Smiley Sans as a local offline display webfont with safe fallback', async () => {
  const css = await stylesheet();
  // @font-face 存在且声明 smiley sans
  const face = blockAfter(css, '@font-face');
  expect(face).toContain('font-family: "smiley sans"');
  // 仅本地相对 URL，无远程请求
  expect(face).toMatch(/src:\s*url\(["']?fonts\/smileysans-oblique\.woff2["']?\)/);
  expect(face).not.toContain('http://');
  expect(face).not.toContain('https://');
  expect(face).toContain('font-display: swap');
  // 展示字体变量：首选 Smiley Sans，回退现有衬线/宋体
  expect(css).toMatch(/--curiosity-display-font:\s*"smiley sans",[^;]*georgia[^;]*songti sc[^;]*serif/);
});

it('applies the display font only to display selectors and keeps body/code stacks', async () => {
  const css = await stylesheet();
  for (const selector of [
    '.curiosity-dashboard .curiosity-hero-title',
    '.curiosity-dashboard .curiosity-current-title',
    '.curiosity-dashboard .curiosity-section > h2',
    '.curiosity-dashboard .curiosity-window-title',
    '.curiosity-dashboard .curiosity-issue-pill',
    '.curiosity-modal .curiosity-modal-content h2',
  ]) {
    expect(blockAfter(css, selector)).toContain('var(--curiosity-display-font)');
  }
  // 正文系统字体与等宽字体栈保持
  expect(css).toContain('font-family: -apple-system, blinkmacsystemfont, "segoe ui", sans-serif');
  expect(css).toContain('font-family: ui-monospace, "sfmono-regular", consolas, monospace');
  // 数据表不使用展示字体
  expect(blockAfter(css, '.curiosity-dashboard .curiosity-table-wrapper table'))
    .not.toContain('var(--curiosity-display-font)');
});
```
> 说明：`stylesheet()` 已 `toLowerCase()`，故断言用小写。`blockAfter(css,'@font-face')` 利用现有辅助读取首个 `@font-face {}` 块。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/styles.test.ts`
Expected: 新两个用例 FAIL（无 @font-face/变量）。

- [ ] **Step 3: 修改 styles.css —— 顶部加 @font-face（文件最前面）**

在文件第 1 行之前插入：
```css
@font-face {
  font-family: "Smiley Sans";
  src: url("fonts/SmileySans-Oblique.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

```

- [ ] **Step 4: 在 `.curiosity-dashboard` 根块加展示字体变量**

在 `.curiosity-dashboard {` 块内（`--curiosity-radius-card: 16px;` 之后）插入：
```css
  --curiosity-display-font: "Smiley Sans", Georgia, "Times New Roman", "Songti SC", serif;
```

- [ ] **Step 5: 在 `.curiosity-modal {` 根块加同名变量**

在 `.curiosity-modal {` 块内（`--curiosity-blue: #0a84ff;` 之后）插入：
```css
  --curiosity-display-font: "Smiley Sans", Georgia, "Times New Roman", "Songti SC", serif;
```

- [ ] **Step 6: 替换展示性选择器的字体栈**

将下列选择器中的 `font-family: Georgia, "Times New Roman", "Songti SC", serif;` 改为 `font-family: var(--curiosity-display-font);`（逐处）：
- `.curiosity-hero-title`
- `.curiosity-current-title, .curiosity-hero-state-title`
- `.curiosity-fact-value`
- `.curiosity-section > h2`
- `.curiosity-queue-card button`
- `.curiosity-dashboard-state h2`
- `.curiosity-modal .curiosity-modal-content h2`

并为下列当前使用系统无衬线、属于"期数/窗口/模块标题"的选择器**新增** `font-family: var(--curiosity-display-font);`：
- `.curiosity-window-title`（在其声明块内加一行）
- `.curiosity-window-issue`
- `.curiosity-issue-pill`
- `.curiosity-kicker, .curiosity-fact-label`（共享块加一行）
- `.curiosity-subcard h3, .curiosity-comment-evidence h3`

> 不改：`.curiosity-association-group button`（等宽路径）、表格 `th/td`、`.curiosity-task`、`button` 基础、`.curiosity-item-meta`、`.curiosity-modal-content` 正文、输入框等。

- [ ] **Step 7: 运行测试确认通过**

Run: `npx vitest run tests/styles.test.ts`
Expected: 全部 PASS（含既有"选择器作用域""调色板"等契约——`@font-face` 以 `@` 开头被作用域测试跳过；新增变量为附加 token）。

- [ ] **Step 8: 验证作用域契约未破坏**

Run: `npx vitest run tests/styles.test.ts -t "scoped"`
Expected: PASS（@font-face 不被当作组件选择器）。

---

## Task 3: 打包/校验脚本纳入字体与许可

**Files:** Modify `scripts/package.mjs`, `scripts/verify-package.mjs`, `tests/release-contract.test.ts`, `README.md`

- [ ] **Step 1: 先写失败测试（release-contract.test.ts）**

在 `describe('release documentation contract', ...)` 内新增：
```ts
it('bundles the Smiley Sans webfont and OFL license as required release files', async () => {
  const pkg = await text('scripts/package.mjs');
  const verify = await text('scripts/verify-package.mjs');
  for (const file of ['fonts/SmileySans-Oblique.woff2', 'fonts/OFL.txt']) {
    expect(pkg).toContain(file);
    expect(verify).toContain(file);
  }
  // 打包脚本为子目录发布文件创建父目录
  expect(pkg).toMatch(/mkdir\([^)]*dirname/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/release-contract.test.ts`
Expected: 新用例 FAIL。

- [ ] **Step 3: 修改 `scripts/package.mjs`**

顶部 import 增 `dirname`：
```js
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { deflateRawSync } from 'node:zlib';
```
`releaseFiles` 改为：
```js
const releaseFiles = [
  'main.js',
  'manifest.json',
  'styles.css',
  'fonts/SmileySans-Oblique.woff2',
  'fonts/OFL.txt',
];
```
打包循环中 `cp` 前确保父目录存在：
```js
  for (const file of releaseFiles) {
    try {
      const target = `${pluginDir}/${file}`;
      await mkdir(dirname(target), { recursive: true });
      await cp(file, target);
      entries.push({ name: `${id}/${file}`, data: await readFile(file) });
    } catch (error) {
      throw new Error(`Cannot package required release file ${file}: ${errorMessage(error)}`);
    }
  }
```

- [ ] **Step 4: 修改 `scripts/verify-package.mjs`**

`releaseFiles` 改为与 package 相同的五项列表（同 Step 3 数组）。其余逻辑不变（内容按字节 `.equals` 比较，条目名 UTF-8；WOFF2 二进制内容可正确通过）。

- [ ] **Step 5: 更新 `README.md` 的 `Release files` 段**

在 `# Release files` 段落内追加（不新增 H1，不改标题顺序）：
```md
- `fonts/SmileySans-Oblique.woff2` — 得意黑 Smiley Sans v2.0.1 网页字体（展示性标题用，离线加载）。
- `fonts/OFL.txt` — Smiley Sans 的 SIL Open Font License 1.1 全文。
```
> 保留 `# License` 段现有句子 “No open-source license has been selected for V1...” 不变（发布契约测试断言）。字体许可独立于插件许可，记录在 Release files / 字体说明处。

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run tests/release-contract.test.ts`
Expected: 全部 PASS（README 标题序列与 License 句子未变）。

---

## Task 4: 全量验证 + 同步到已安装插件

**Files:** 同步到 `.obsidian/plugins/curiosity-dashboard/`

- [ ] **Step 1: 类型检查 + 全量测试**

Run: `npm run typecheck && npm test`
Expected: 全绿（含新增 styles/release 用例）。

- [ ] **Step 2: 生产构建 + 打包校验**

Run: `npm run build && npm run package`
Expected: 构建成功；`verify-package.mjs` 输出 “Verified ... 5 ... entries”（含字体与许可，CRC 与内容一致）。

- [ ] **Step 3: 同步到已安装插件目录**

Run:
```bash
DST="F:/JCloudLab/IROL/自媒体选题/.obsidian/plugins/curiosity-dashboard"
SRC="F:/JCloudLab/IROL/自媒体选题/apps/obsidian-curiosity-dashboard"
mkdir -p "$DST/fonts" && \
cp "$SRC/fonts/SmileySans-Oblique.woff2" "$DST/fonts/" && \
cp "$SRC/fonts/OFL.txt" "$DST/fonts/" && \
cp "$SRC/styles.css" "$DST/styles.css" && \
cp "$SRC/main.js" "$DST/main.js" && \
cp "$SRC/manifest.json" "$DST/manifest.json"
```

- [ ] **Step 4: 校验已安装资源与源码哈希一致（验收 #6）**

Run:
```bash
cd "F:/JCloudLab/IROL/自媒体选题" && \
for f in fonts/SmileySans-Oblique.woff2 fonts/OFL.txt styles.css; do \
  a=$(sha256sum "apps/obsidian-curiosity-dashboard/$f" | cut -d' ' -f1); \
  b=$(sha256sum ".obsidian/plugins/curiosity-dashboard/$f" | cut -d' ' -f1); \
  [ "$a" = "$b" ] && echo "OK  $f" || echo "DIFF $f"; done
```
Expected: 三项均 `OK`。

- [ ] **Step 5: 人工冒烟（用户侧）**

在 Obsidian 重载插件（关/开第三方插件开关），确认展示标题（如 hero 标题、模块标题、期数）变为得意黑风格，且正文/路径/表格字体不变；断网或检查无远程字体请求。

---

## Self-Review

- 验收 #1（仅本地字体 URL）→ Task2 @font-face 相对 URL + styles 测试断言无 http/https。✓
- 验收 #2（展示首选 Smiley Sans）→ 变量首选 + 展示选择器用变量 + 测试。✓
- 验收 #3（正文/路径/代码不变）→ 仅改展示选择器；测试断言系统/等宽栈保留、表格不用展示字体。✓
- 验收 #4（ZIP 含 woff2+OFL）→ Task3 releaseFiles 扩展 + 子目录 mkdir。✓
- 验收 #5（test/typecheck/build/package 通过）→ Task4。✓
- 验收 #6（已安装与源码哈希一致）→ Task4 Step4 sha256 校验。✓
- 非目标（不做全局字体/子集/在线/切换 UI）→ 计划未涉及。✓
- 占位符：无。类型一致：releaseFiles 两脚本同列表；变量名 `--curiosity-display-font` 全程一致。
