# Obsidian Curiosity Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first Obsidian plugin that renders the existing creator vault as a cinematic, macOS-inspired production dashboard with safe task, stage, and template actions.

**Architecture:** A custom `ItemView` renders seven dashboard modules from a framework-free TypeScript model. Pure parsers and repositories sit behind a narrow `VaultGateway`, allowing Vitest coverage without booting Obsidian; the Obsidian adapter owns Metadata Cache access, safe file processing, resource URLs, and events.

**Tech Stack:** Obsidian API 1.13.1, TypeScript 6.0.3, esbuild 0.28.1, Vitest 4.1.9, Node.js 24, vanilla DOM/CSS.

---

## File map

```text
obsidian-curiosity-dashboard/
├── .github/workflows/ci.yml                 # build and test on pushes and pull requests
├── docs/
│   ├── fields.md                             # supported frontmatter and Markdown formats
│   ├── installation.md                       # manual installation and configuration
│   └── superpowers/
│       ├── plans/                            # this implementation plan
│       └── specs/                            # approved product design
├── examples/
│   ├── topic.md                              # focus topic and checklist example
│   └── review.md                             # cross-platform review example
├── scripts/package.mjs                       # create release zip from built artifacts
├── src/
│   ├── adapters/obsidian-vault-gateway.ts    # Obsidian API implementation of VaultGateway
│   ├── data/association-resolver.ts           # unique issue-based script/asset/review fallback
│   ├── data/dashboard-data-service.ts        # compose the complete dashboard model
│   ├── data/focus-resolver.ts                # enforce zero/one/many focus states
│   ├── data/review-metrics-service.ts        # select and parse review data
│   ├── data/topic-repository.ts              # topic, week, queue, and path queries
│   ├── domain/checklist.ts                    # pure checklist parsing and toggling
│   ├── domain/models.ts                       # shared domain and view-model types
│   ├── domain/review-table.ts                 # pure Markdown table parsing
│   ├── domain/stages.ts                       # fixed workflow and transition rules
│   ├── mutations/template-creation-service.ts# safe template-backed file creation
│   ├── mutations/vault-mutation-service.ts   # task and stage writes
│   ├── ports/vault-gateway.ts                 # testable vault boundary
│   ├── ui/create-file-modal.ts                # path/title confirmation modal
│   ├── ui/dashboard-renderer.ts               # orchestrate seven UI modules
│   ├── ui/renderers/channel-pulse.ts          # metrics and comment evidence panel
│   ├── ui/renderers/dock.ts                   # real command dock
│   ├── ui/renderers/hero.ts                   # image hero and current action
│   ├── ui/renderers/mission-control.ts        # stage, tasks, and quick links
│   ├── ui/renderers/production-queue.ts       # next/review/explore cards
│   ├── ui/renderers/quick-actions.ts          # safe creation actions
│   ├── ui/renderers/this-week.ts              # Monday-Sunday schedule
│   ├── curiosity-dashboard-view.ts            # ItemView lifecycle and refresh
│   ├── main.ts                                # plugin lifecycle, commands, settings
│   └── settings.ts                            # settings model and tab
├── tests/
│   ├── data/dashboard-data-service.test.ts
│   ├── data/focus-resolver.test.ts
│   ├── data/review-metrics-service.test.ts
│   ├── data/topic-repository.test.ts
│   ├── data/association-resolver.test.ts
│   ├── domain/checklist.test.ts
│   ├── domain/review-table.test.ts
│   ├── domain/stages.test.ts
│   ├── mutations/template-creation-service.test.ts
│   ├── mutations/vault-mutation-service.test.ts
│   └── support/fake-vault-gateway.ts
├── .gitignore
├── esbuild.config.mjs
├── manifest.json
├── package.json
├── styles.css
├── tsconfig.json
├── versions.json
└── vitest.config.ts
```

## Task 1: Scaffold the plugin, build, and test harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.config.mjs`
- Create: `vitest.config.ts`
- Create: `manifest.json`
- Create: `versions.json`
- Create: `.gitignore`
- Create: `src/main.ts`
- Create: `tests/scaffold.test.ts`

- [ ] **Step 1: Add package and compiler configuration**

Create `package.json`:

```json
{
  "name": "obsidian-curiosity-dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "npm run typecheck && node esbuild.config.mjs production",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "package": "npm run build && node scripts/package.mjs"
  },
  "devDependencies": {
    "@types/node": "26.0.0",
    "esbuild": "0.28.1",
    "obsidian": "1.13.1",
    "typescript": "6.0.3",
    "vitest": "4.1.9"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useDefineForClassFields": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", coverage: { reporter: ["text", "json"] } },
});
```

- [ ] **Step 2: Add the build and manifest files**

Create `esbuild.config.mjs`:

```js
import esbuild from "esbuild";

const production = process.argv[2] === "production";
const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  minify: production,
  outfile: "main.js",
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
```

Create `manifest.json`:

```json
{
  "id": "curiosity-dashboard",
  "name": "Curiosity Dashboard",
  "version": "0.1.0",
  "minAppVersion": "1.9.0",
  "description": "A cinematic, macOS-inspired production dashboard for creator vaults.",
  "author": "irol",
  "authorUrl": "https://github.com/irollab",
  "isDesktopOnly": false
}
```

Create `versions.json`:

```json
{ "0.1.0": "1.9.0" }
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
main.js
*.zip
coverage/
.DS_Store
```

- [ ] **Step 3: Add the smallest loadable plugin**

Create `src/main.ts`:

```ts
import { Notice, Plugin } from "obsidian";

export default class CuriosityDashboardPlugin extends Plugin {
  override async onload(): Promise<void> {
    this.addCommand({
      id: "open-curiosity-dashboard",
      name: "Open dashboard",
      callback: () => new Notice("Curiosity Dashboard is loaded"),
    });
  }
}
```

- [ ] **Step 4: Install, build, and verify the harness**

Create `tests/scaffold.test.ts`:

```ts
import { expect, it } from "vitest";

it("runs the plugin test harness", () => {
  expect("curiosity-dashboard").toBe("curiosity-dashboard");
});
```

Run:

```powershell
npm install
npm test
npm run build
```

Expected: one Vitest test passes; `npm run build` creates `main.js` with no type errors.

- [ ] **Step 5: Commit the scaffold**

```powershell
git add package.json package-lock.json tsconfig.json esbuild.config.mjs vitest.config.ts manifest.json versions.json .gitignore src/main.ts tests/scaffold.test.ts
git commit -m "chore: scaffold Obsidian plugin"
```

## Task 2: Define workflow stages and shared models

**Files:**
- Create: `src/domain/stages.ts`
- Create: `src/domain/models.ts`
- Create: `tests/domain/stages.test.ts`

- [ ] **Step 1: Write failing stage tests**

```ts
// tests/domain/stages.test.ts
import { describe, expect, it } from "vitest";
import { nextStage, normalizeStage, stageIndex } from "@/domain/stages";

describe("workflow stages", () => {
  it("normalizes only supported Chinese stages", () => {
    expect(normalizeStage("制作")).toBe("制作");
    expect(normalizeStage("unknown")).toBeNull();
    expect(normalizeStage(undefined)).toBeNull();
  });

  it("moves forward once and stops at review", () => {
    expect(nextStage("策划")).toBe("制作");
    expect(nextStage("复盘")).toBeNull();
    expect(stageIndex("发布")).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test and confirm the import fails**

Run: `npm test -- tests/domain/stages.test.ts`

Expected: FAIL because `src/domain/stages.ts` does not exist.

- [ ] **Step 3: Implement stages and view models**

```ts
// src/domain/stages.ts
export const STAGES = ["选题", "策划", "制作", "发布", "复盘"] as const;
export type Stage = (typeof STAGES)[number];

export function normalizeStage(value: unknown): Stage | null {
  return typeof value === "string" && (STAGES as readonly string[]).includes(value)
    ? (value as Stage)
    : null;
}

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

export function nextStage(stage: Stage): Stage | null {
  return STAGES[stageIndex(stage) + 1] ?? null;
}
```

```ts
// src/domain/models.ts
import type { Stage } from "./stages";

export interface TopicRecord {
  path: string;
  basename: string;
  title: string;
  issue: number;
  status: string;
  stage: Stage | null;
  priority: string | null;
  dueDate: string | null;
  nextAction: string | null;
  homepageFocus: boolean;
  scriptPath: string | null;
  assetPath: string | null;
  reviewPath: string | null;
}

export interface ChecklistTask {
  line: number;
  text: string;
  checked: boolean;
}

export interface MetricRow {
  platform: string;
  collectedAt: string | null;
  views: string | null;
  likes: string | null;
  favorites: string | null;
  comments: string | null;
  shares: string | null;
}

export type FocusState =
  | { kind: "none" }
  | { kind: "multiple"; topics: TopicRecord[] }
  | { kind: "invalid-stage"; topic: TopicRecord }
  | { kind: "ready"; topic: TopicRecord };

export interface DashboardModel {
  focus: FocusState;
  tasks: ChecklistTask[];
  thisWeek: TopicRecord[];
  queue: TopicRecord[];
  metrics: MetricRow[];
  reviewPath: string | null;
  commentEvidence: string[];
  backgroundUrl: string | null;
  mobileReadOnly: boolean;
  associationCandidates: { scriptPath: string[]; assetPath: string[]; reviewPath: string[] };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- tests/domain/stages.test.ts; npm run typecheck`

Expected: stage tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit the domain model**

```powershell
git add src/domain tests/domain
git commit -m "feat: define dashboard domain model"
```

## Task 3: Add settings and the vault gateway boundary

**Files:**
- Create: `src/ports/vault-gateway.ts`
- Create: `src/adapters/obsidian-vault-gateway.ts`
- Create: `src/settings.ts`
- Create: `tests/support/fake-vault-gateway.ts`

- [ ] **Step 1: Define the gateway and test fake**

```ts
// src/ports/vault-gateway.ts
export type Frontmatter = Record<string, unknown>;

export interface VaultGateway {
  listPaths(): string[];
  listMarkdownPaths(): string[];
  getFrontmatter(path: string): Frontmatter | null;
  read(path: string): Promise<string>;
  process(path: string, transform: (content: string) => string): Promise<void>;
  updateFrontmatter(path: string, mutate: (frontmatter: Frontmatter) => void): Promise<void>;
  create(path: string, content: string): Promise<void>;
  exists(path: string): boolean;
  resourceUrl(path: string): string | null;
}
```

```ts
// tests/support/fake-vault-gateway.ts
import type { Frontmatter, VaultGateway } from "@/ports/vault-gateway";

export class FakeVaultGateway implements VaultGateway {
  readonly files = new Map<string, string>();
  readonly metadata = new Map<string, Frontmatter>();

  listPaths(): string[] { return [...this.files.keys()]; }
  listMarkdownPaths(): string[] { return [...this.files.keys()].filter((p) => p.endsWith(".md")); }
  getFrontmatter(path: string): Frontmatter | null { return this.metadata.get(path) ?? null; }
  async read(path: string): Promise<string> { const value = this.files.get(path); if (value === undefined) throw new Error(`Missing file: ${path}`); return value; }
  async process(path: string, transform: (content: string) => string): Promise<void> { this.files.set(path, transform(await this.read(path))); }
  async updateFrontmatter(path: string, mutate: (frontmatter: Frontmatter) => void): Promise<void> { const fm = { ...(this.metadata.get(path) ?? {}) }; mutate(fm); this.metadata.set(path, fm); }
  async create(path: string, content: string): Promise<void> { if (this.exists(path)) throw new Error(`File exists: ${path}`); this.files.set(path, content); }
  exists(path: string): boolean { return this.files.has(path); }
  resourceUrl(path: string): string | null { return this.exists(path) ? `app://vault/${encodeURIComponent(path)}` : null; }
}
```

- [ ] **Step 2: Implement the Obsidian adapter**

```ts
// src/adapters/obsidian-vault-gateway.ts
import { App, TFile, normalizePath } from "obsidian";
import type { Frontmatter, VaultGateway } from "@/ports/vault-gateway";

export class ObsidianVaultGateway implements VaultGateway {
  constructor(private readonly app: App) {}

  listPaths(): string[] { return this.app.vault.getAllLoadedFiles().map((file) => file.path); }
  listMarkdownPaths(): string[] { return this.app.vault.getMarkdownFiles().map((file) => file.path); }
  getFrontmatter(path: string): Frontmatter | null {
    const file = this.requireFile(path);
    return this.app.metadataCache.getFileCache(file)?.frontmatter ?? null;
  }
  read(path: string): Promise<string> { return this.app.vault.cachedRead(this.requireFile(path)); }
  process(path: string, transform: (content: string) => string): Promise<void> { return this.app.vault.process(this.requireFile(path), transform); }
  updateFrontmatter(path: string, mutate: (frontmatter: Frontmatter) => void): Promise<void> { return this.app.fileManager.processFrontMatter(this.requireFile(path), mutate); }
  create(path: string, content: string): Promise<void> { return this.app.vault.create(normalizePath(path), content).then(() => undefined); }
  exists(path: string): boolean { return this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null; }
  resourceUrl(path: string): string | null {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return file instanceof TFile ? this.app.vault.getResourcePath(file) : null;
  }
  private requireFile(path: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) throw new Error(`Markdown file not found: ${path}`);
    return file;
  }
}
```

- [ ] **Step 3: Add defaults and a settings tab**

```ts
// src/settings.ts
import { App, PluginSettingTab, Setting } from "obsidian";
import type CuriosityDashboardPlugin from "./main";

export interface DashboardSettings {
  topicDir: string;
  scriptDir: string;
  assetDir: string;
  reviewDir: string;
  topicTemplate: string;
  scriptTemplate: string;
  reviewTemplate: string;
  backgroundPath: string;
  openOnStartup: boolean;
  defaultTab: "overview" | "tasks" | "data";
  enableMobileView: boolean;
}

export const DEFAULT_SETTINGS: DashboardSettings = {
  topicDir: "10-选题池",
  scriptDir: "40-脚本大纲",
  assetDir: "20-素材库",
  reviewDir: "60-发布复盘",
  topicTemplate: "99-模板/选题卡模板.md",
  scriptTemplate: "99-模板/脚本大纲模板.md",
  reviewTemplate: "99-模板/发布复盘模板.md",
  backgroundPath: "",
  openOnStartup: false,
  defaultTab: "overview",
  enableMobileView: true,
};

export class DashboardSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: CuriosityDashboardPlugin) { super(app, plugin); }
  display(): void {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "Curiosity Dashboard" });
    this.addText("Topic directory", "topicDir");
    this.addText("Script directory", "scriptDir");
    this.addText("Asset directory", "assetDir");
    this.addText("Review directory", "reviewDir");
    this.addText("Topic template", "topicTemplate");
    this.addText("Script template", "scriptTemplate");
    this.addText("Review template", "reviewTemplate");
    this.addText("Background image", "backgroundPath");
    new Setting(this.containerEl).setName("Open on startup").addToggle((toggle) => toggle.setValue(this.plugin.settings.openOnStartup).onChange(async (value) => { this.plugin.settings.openOnStartup = value; await this.plugin.saveSettings(); }));
    new Setting(this.containerEl).setName("Default tab").addDropdown((dropdown) => dropdown.addOptions({ overview: "Overview", tasks: "Tasks", data: "Data" }).setValue(this.plugin.settings.defaultTab).onChange(async (value) => { this.plugin.settings.defaultTab = value as DashboardSettings["defaultTab"]; await this.plugin.saveSettings(); }));
    new Setting(this.containerEl).setName("Enable simplified mobile view").addToggle((toggle) => toggle.setValue(this.plugin.settings.enableMobileView).onChange(async (value) => { this.plugin.settings.enableMobileView = value; await this.plugin.saveSettings(); }));
  }
  private addText(name: string, key: "topicDir" | "scriptDir" | "assetDir" | "reviewDir" | "topicTemplate" | "scriptTemplate" | "reviewTemplate" | "backgroundPath"): void {
    new Setting(this.containerEl).setName(name).addText((text) => text.setValue(this.plugin.settings[key]).onChange(async (value) => { this.plugin.settings[key] = value.trim(); await this.plugin.saveSettings(); }));
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`

Expected: exit 0; if Obsidian's `processFrontMatter` callback type is stricter, type the adapter callback as `Record<string, unknown>` without casting to `any`.

- [ ] **Step 5: Commit the gateway and settings**

```powershell
git add src/ports src/adapters src/settings.ts tests/support
git commit -m "feat: add vault gateway and settings"
```

## Task 4: Parse topics and resolve the current focus

**Files:**
- Create: `src/data/association-resolver.ts`
- Create: `src/data/topic-repository.ts`
- Create: `src/data/focus-resolver.ts`
- Create: `tests/data/association-resolver.test.ts`
- Create: `tests/data/topic-repository.test.ts`
- Create: `tests/data/focus-resolver.test.ts`

- [ ] **Step 1: Write repository and focus tests**

```ts
// tests/data/topic-repository.test.ts
import { expect, it } from "vitest";
import { TopicRepository } from "@/data/topic-repository";
import { FakeVaultGateway } from "../support/fake-vault-gateway";

it("uses frontmatter issue then falls back to filename", () => {
  const vault = new FakeVaultGateway();
  vault.files.set("10-选题池/已立项/39-Test.md", "# Explicit title");
  vault.metadata.set("10-选题池/已立项/39-Test.md", { type: "选题", status: "已立项", issue: 40, stage: "制作", homepage_focus: true });
  const [topic] = new TopicRepository(vault, "10-选题池").all();
  expect(topic?.issue).toBe(40);
  expect(topic?.title).toBe("Test");
});
```

```ts
// tests/data/focus-resolver.test.ts
import { expect, it } from "vitest";
import { resolveFocus } from "@/data/focus-resolver";
import type { TopicRecord } from "@/domain/models";

const topic = (issue: number, stage: TopicRecord["stage"], homepageFocus = true): TopicRecord => ({ path: `${issue}.md`, basename: `${issue}`, title: `${issue}`, issue, status: "已立项", stage, priority: null, dueDate: null, nextAction: null, homepageFocus, scriptPath: null, assetPath: null, reviewPath: null });

it("returns none, multiple, invalid-stage, and ready explicitly", () => {
  expect(resolveFocus([]).kind).toBe("none");
  expect(resolveFocus([topic(1, "策划"), topic(2, "制作")]).kind).toBe("multiple");
  expect(resolveFocus([topic(1, null)]).kind).toBe("invalid-stage");
  expect(resolveFocus([topic(1, "制作")]).kind).toBe("ready");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/data/topic-repository.test.ts tests/data/focus-resolver.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement repository and focus resolution**

```ts
// src/data/focus-resolver.ts
import type { FocusState, TopicRecord } from "@/domain/models";

export function resolveFocus(topics: TopicRecord[]): FocusState {
  const focused = topics.filter((topic) => topic.homepageFocus);
  if (focused.length === 0) return { kind: "none" };
  if (focused.length > 1) return { kind: "multiple", topics: focused };
  const topic = focused[0]!;
  return topic.stage === null ? { kind: "invalid-stage", topic } : { kind: "ready", topic };
}
```

Implement `src/data/topic-repository.ts` with these public methods and exact rules:

```ts
import type { TopicRecord } from "@/domain/models";
import { normalizeStage } from "@/domain/stages";
import type { VaultGateway } from "@/ports/vault-gateway";

export class TopicRepository {
  constructor(private readonly vault: VaultGateway, private readonly topicDir: string) {}

  all(): TopicRecord[] {
    const prefix = `${this.topicDir.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "")}/`;
    return this.vault.listMarkdownPaths().filter((path) => path.startsWith(prefix)).map((path) => this.toTopic(path)).filter((topic): topic is TopicRecord => topic !== null);
  }

  productionQueue(): TopicRecord[] {
    return this.all().filter((topic) => topic.status === "已立项" && !topic.homepageFocus).sort(compareTopics);
  }

  thisWeek(now = new Date()): TopicRecord[] {
    const [start, end] = mondayRange(now);
    return this.all().filter((topic) => {
      if (topic.stage === "复盘" || topic.dueDate === null) return false;
      const due = new Date(`${topic.dueDate}T00:00:00`);
      return Number.isFinite(due.valueOf()) && due >= start && due <= end;
    }).sort(compareTopics);
  }

  private toTopic(path: string): TopicRecord | null {
    const fm = this.vault.getFrontmatter(path);
    if (fm?.type !== "选题") return null;
    const basename = path.split("/").pop()!.replace(/\.md$/, "");
    const issue = typeof fm.issue === "number" ? fm.issue : Number.parseInt(basename.match(/^(\d+)/)?.[1] ?? "", 10);
    if (!Number.isFinite(issue)) return null;
    return { path, basename, title: stringValue(fm.title) ?? basename.replace(/^\d+-/, ""), issue, status: stringValue(fm.status) ?? "", stage: normalizeStage(fm.stage), priority: stringValue(fm.priority), dueDate: stringValue(fm.due_date), nextAction: stringValue(fm.next_action), homepageFocus: fm.homepage_focus === true, scriptPath: stringValue(fm.script_path), assetPath: stringValue(fm.asset_path), reviewPath: stringValue(fm.review_path) };
  }
}

const stringValue = (value: unknown): string | null => typeof value === "string" && value.trim() !== "" ? value.trim() : null;
const compareTopics = (a: TopicRecord, b: TopicRecord): number => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.issue - b.issue;
function mondayRange(now: Date): [Date, Date] { const start = new Date(now); const day = (start.getDay() + 6) % 7; start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - day); const end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999); return [start, end]; }
```

- [ ] **Step 4: Run repository tests**

Create `src/data/association-resolver.ts`:

```ts
import type { TopicRecord } from "@/domain/models";
import type { VaultGateway } from "@/ports/vault-gateway";
import type { DashboardSettings } from "@/settings";

export class AssociationResolver {
  constructor(private readonly vault: VaultGateway, private readonly settings: DashboardSettings) {}
  resolve(topic: TopicRecord): TopicRecord {
    return { ...topic, scriptPath: topic.scriptPath ?? this.unique(this.candidates(this.settings.scriptDir, topic.issue)), assetPath: topic.assetPath ?? this.unique(this.candidates(this.settings.assetDir, topic.issue)), reviewPath: topic.reviewPath ?? this.unique(this.candidates(this.settings.reviewDir, topic.issue)) };
  }
  candidates(directory: string, issue: number): string[] {
    const prefix = `${directory.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "")}/`; const issuePattern = new RegExp(`^(?:第)?0*${issue}(?:期|-|_|$)`);
    return this.vault.listPaths().filter((path) => path.startsWith(prefix)).filter((path) => issuePattern.test(path.slice(prefix.length).split("/").pop() ?? ""));
  }
  private unique(candidates: string[]): string | null { return candidates.length === 1 ? candidates[0]! : null; }
}
```

Create `tests/data/association-resolver.test.ts`:

```ts
import { expect, it } from "vitest";
import { AssociationResolver } from "@/data/association-resolver";
import { DEFAULT_SETTINGS } from "@/settings";
import type { TopicRecord } from "@/domain/models";
import { FakeVaultGateway } from "../support/fake-vault-gateway";
const topic: TopicRecord = { path: "39.md", basename: "39", title: "Test", issue: 39, status: "已立项", stage: "制作", priority: null, dueDate: null, nextAction: null, homepageFocus: true, scriptPath: null, assetPath: null, reviewPath: null };
it("uses a unique issue match and rejects ambiguous matches", () => {
  const vault = new FakeVaultGateway(); vault.files.set("40-脚本大纲/39-Test.md", ""); vault.files.set("60-发布复盘/第39期-Test.md", ""); vault.files.set("60-发布复盘/39-Other.md", "");
  const resolved = new AssociationResolver(vault, DEFAULT_SETTINGS).resolve(topic);
  expect(resolved.scriptPath).toBe("40-脚本大纲/39-Test.md"); expect(resolved.reviewPath).toBeNull();
});
```

Run: `npm test -- tests/data/topic-repository.test.ts tests/data/focus-resolver.test.ts tests/data/association-resolver.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit topic discovery**

```powershell
git add src/data/topic-repository.ts src/data/focus-resolver.ts src/data/association-resolver.ts tests/data
git commit -m "feat: query topics and resolve focus"
```

## Task 5: Parse and safely toggle the current checklist

**Files:**
- Create: `src/domain/checklist.ts`
- Create: `src/mutations/vault-mutation-service.ts`
- Create: `tests/domain/checklist.test.ts`
- Create: `tests/mutations/vault-mutation-service.test.ts`

- [ ] **Step 1: Write failing checklist tests**

```ts
// tests/domain/checklist.test.ts
import { expect, it } from "vitest";
import { parseChecklistSection, toggleChecklistLine } from "@/domain/checklist";

const markdown = "# Topic\n\n## 本期执行清单\n\n- [x] 技术路线确认\n- [ ] 页面开发\n\n## 其他\n- [ ] 不应读取";

it("parses only the exact checklist section", () => {
  expect(parseChecklistSection(markdown)).toEqual([
    { line: 5, text: "技术路线确认", checked: true },
    { line: 6, text: "页面开发", checked: false },
  ]);
});

it("toggles only the requested task line", () => {
  expect(toggleChecklistLine(markdown, 6)).toContain("- [x] 页面开发");
  expect(() => toggleChecklistLine(markdown, 8)).toThrow("Checklist task not found");
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- tests/domain/checklist.test.ts`

Expected: FAIL because the parser is missing.

- [ ] **Step 3: Implement pure parsing and safe mutation**

```ts
// src/domain/checklist.ts
import type { ChecklistTask } from "./models";

const TASK = /^(\s*)- \[([ xX])\]\s+(.+?)\s*$/;

export function parseChecklistSection(markdown: string, heading = "本期执行清单"): ChecklistTask[] {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (headingIndex < 0) return [];
  const tasks: ChecklistTask[] = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (/^#{1,6}\s/.test(line.trim())) break;
    const match = line.match(TASK);
    if (match) tasks.push({ line: index + 1, text: match[3]!, checked: match[2]!.toLowerCase() === "x" });
  }
  return tasks;
}

export function toggleChecklistLine(markdown: string, oneBasedLine: number): string {
  const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const index = oneBasedLine - 1;
  const line = lines[index];
  const match = line?.match(TASK);
  if (!match) throw new Error(`Checklist task not found at line ${oneBasedLine}`);
  lines[index] = line!.replace(/- \[[ xX]\]/, match[2]!.toLowerCase() === "x" ? "- [ ]" : "- [x]");
  return lines.join(newline);
}
```

```ts
// src/mutations/vault-mutation-service.ts
import { toggleChecklistLine } from "@/domain/checklist";
import { nextStage, type Stage } from "@/domain/stages";
import type { VaultGateway } from "@/ports/vault-gateway";

export class VaultMutationService {
  constructor(private readonly vault: VaultGateway) {}
  toggleTask(path: string, line: number): Promise<void> { return this.vault.process(path, (content) => toggleChecklistLine(content, line)); }
  async advanceStage(path: string, current: Stage): Promise<Stage> {
    const next = nextStage(current);
    if (next === null) throw new Error("Review is the terminal stage");
    await this.vault.updateFrontmatter(path, (frontmatter) => { if (frontmatter.stage !== current) throw new Error("Stage changed; refresh and try again"); frontmatter.stage = next; });
    return next;
  }
  async setAssociationPath(path: string, field: "script_path" | "asset_path" | "review_path", value: string): Promise<void> {
    if (!this.vault.exists(value)) throw new Error(`Associated path not found: ${value}`);
    await this.vault.updateFrontmatter(path, (frontmatter) => { const existing = frontmatter[field]; if (typeof existing === "string" && existing !== value) throw new Error(`${field} is already set; edit the topic explicitly to replace it`); frontmatter[field] = value; });
  }
}
```

- [ ] **Step 4: Test task and stage writes**

Create `tests/mutations/vault-mutation-service.test.ts`:

```ts
import { expect, it } from "vitest";
import { VaultMutationService } from "@/mutations/vault-mutation-service";
import { FakeVaultGateway } from "../support/fake-vault-gateway";

it("toggles only the selected checklist line", async () => {
  const vault = new FakeVaultGateway();
  vault.files.set("topic.md", "## 本期执行清单\n- [ ] A\n- [ ] B");
  await new VaultMutationService(vault).toggleTask("topic.md", 2);
  expect(vault.files.get("topic.md")).toBe("## 本期执行清单\n- [x] A\n- [ ] B");
});

it("rejects a stale stage and advances a current one", async () => {
  const vault = new FakeVaultGateway();
  vault.files.set("topic.md", "# Topic");
  vault.metadata.set("topic.md", { stage: "策划" });
  const service = new VaultMutationService(vault);
  await expect(service.advanceStage("topic.md", "制作")).rejects.toThrow("Stage changed");
  await expect(service.advanceStage("topic.md", "策划")).resolves.toBe("制作");
  expect(vault.metadata.get("topic.md")?.stage).toBe("制作");
  vault.files.set("40-脚本大纲/39.md", "# Script");
  await service.setAssociationPath("topic.md", "script_path", "40-脚本大纲/39.md");
  expect(vault.metadata.get("topic.md")?.script_path).toBe("40-脚本大纲/39.md");
});
```

Run:

`npm test -- tests/domain/checklist.test.ts tests/mutations/vault-mutation-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit checklist writes**

```powershell
git add src/domain/checklist.ts src/mutations tests/domain/checklist.test.ts tests/mutations
git commit -m "feat: parse and safely update checklist"
```

## Task 6: Parse review tables and comment evidence

**Files:**
- Create: `src/domain/review-table.ts`
- Create: `src/data/review-metrics-service.ts`
- Create: `tests/domain/review-table.test.ts`
- Create: `tests/data/review-metrics-service.test.ts`

- [ ] **Step 1: Write failing parser tests with both supported formats**

```ts
// tests/domain/review-table.test.ts
import { expect, it } from "vitest";
import { parseReviewMetrics } from "@/domain/review-table";

it("reads only present fields from a cross-platform table", () => {
  const md = "| 平台 | 播放/观看 | 点赞 | 收藏 | 评论 | 分享 |\n| --- | ---: | ---: | ---: | ---: | ---: |\n| 小红书 | 2408 | 96 | 165 | 9 | 29 |";
  expect(parseReviewMetrics(md)[0]).toMatchObject({ platform: "小红书", views: "2408", likes: "96", favorites: "165", comments: "9", shares: "29" });
});

it("uses the latest non-empty row in a single-platform snapshot", () => {
  const md = "平台：抖音\n| 时间点 | 采集时间 | 播放/阅读 | 点赞 | 收藏 | 评论 | 转发 |\n| --- | --- | ---: | ---: | ---: | ---: | ---: |\n| 2小时 | 2026-06-16 | 100 | 2 | 3 | 0 | 0 |\n| 24小时 | 2026-06-17 | 300 | 8 | 12 | 1 | 2 |";
  expect(parseReviewMetrics(md)[0]).toMatchObject({ platform: "抖音", collectedAt: "2026-06-17", views: "300", shares: "2" });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- tests/domain/review-table.test.ts`

Expected: FAIL because `parseReviewMetrics` is missing.

- [ ] **Step 3: Implement the Markdown table parser**

Create `src/domain/review-table.ts` with pure helpers that:

```ts
import type { MetricRow } from "./models";

const aliases = {
  views: ["播放/观看", "播放/阅读", "播放", "观看"], likes: ["点赞"], favorites: ["收藏"],
  comments: ["评论"], shares: ["分享", "转发"], collectedAt: ["采集时间"], platform: ["平台"],
} as const;

export function parseReviewMetrics(markdown: string): MetricRow[] {
  const tables = extractTables(markdown);
  for (const table of tables) {
    const platformColumn = column(table.headers, aliases.platform);
    const viewsColumn = column(table.headers, aliases.views);
    if (platformColumn >= 0 && viewsColumn >= 0) return table.rows.map((row) => metric(row[platformColumn] ?? "", table.headers, row));
    const timeColumn = column(table.headers, aliases.collectedAt);
    if (timeColumn >= 0 && viewsColumn >= 0) {
      const platform = markdown.match(/平台[：:]\s*([^\n]+)/)?.[1]?.trim() ?? "未标明平台";
      const latest = [...table.rows].reverse().find((row) => row.some((cell) => cell !== ""));
      return latest ? [metric(platform, table.headers, latest)] : [];
    }
  }
  return [];
}

function metric(platform: string, headers: string[], row: string[]): MetricRow {
  const value = (names: readonly string[]): string | null => { const index = column(headers, names); return index >= 0 && row[index]?.trim() ? row[index]!.trim() : null; };
  return { platform, collectedAt: value(aliases.collectedAt), views: value(aliases.views), likes: value(aliases.likes), favorites: value(aliases.favorites), comments: value(aliases.comments), shares: value(aliases.shares) };
}

const column = (headers: string[], names: readonly string[]): number => headers.findIndex((header) => names.includes(header.trim()));
const split = (line: string): string[] => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
function extractTables(markdown: string): Array<{ headers: string[]; rows: string[][] }> {
  const lines = markdown.split(/\r?\n/); const result: Array<{ headers: string[]; rows: string[][] }> = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index]!.includes("|") || !/^\s*\|?\s*:?-+/.test(lines[index + 1]!)) continue;
    const headers = split(lines[index]!); const rows: string[][] = []; index += 2;
    while (index < lines.length && lines[index]!.includes("|")) { rows.push(split(lines[index]!)); index += 1; }
    result.push({ headers, rows }); index -= 1;
  }
  return result;
}
```

- [ ] **Step 4: Implement selection and comment evidence**

Create `src/data/review-metrics-service.ts`:

```ts
import { parseReviewMetrics } from "@/domain/review-table";
import type { MetricRow } from "@/domain/models";
import type { VaultGateway } from "@/ports/vault-gateway";

export interface ReviewResult { path: string | null; metrics: MetricRow[]; commentEvidence: string[]; }

export class ReviewMetricsService {
  constructor(private readonly vault: VaultGateway, private readonly reviewDir: string) {}
  async load(explicitPath: string | null): Promise<ReviewResult> {
    const path = explicitPath && this.vault.exists(explicitPath) ? explicitPath : this.latestDatedReview();
    if (path === null) return { path: null, metrics: [], commentEvidence: [] };
    const markdown = await this.vault.read(path);
    return { path, metrics: parseReviewMetrics(markdown), commentEvidence: extractCommentEvidence(markdown) };
  }
  private latestDatedReview(): string | null {
    const prefix = `${this.reviewDir.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "")}/`;
    return this.vault.listMarkdownPaths().filter((path) => path.startsWith(prefix)).map((path) => {
      const fm = this.vault.getFrontmatter(path);
      const date = typeof fm?.created === "string" ? fm.created : typeof fm?.publish_date === "string" ? fm.publish_date : null;
      return { path, date };
    }).filter((item): item is { path: string; date: string } => item.date !== null).sort((a, b) => b.date.localeCompare(a.date))[0]?.path ?? null;
  }
}

function extractCommentEvidence(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/); const evidence: string[] = []; let active = false;
  for (const line of lines) {
    const heading = line.match(/^#{2,6}\s+(.+)$/)?.[1]?.trim();
    if (heading) { active = ["评论区需求", "评论反馈", "评论样本"].includes(heading); continue; }
    if (active) { const bullet = line.match(/^\s*-\s+(.+)$/)?.[1]?.trim(); if (bullet) evidence.push(bullet); }
  }
  return evidence;
}
```

Create `tests/data/review-metrics-service.test.ts`:

```ts
import { expect, it } from "vitest";
import { ReviewMetricsService } from "@/data/review-metrics-service";
import { FakeVaultGateway } from "../support/fake-vault-gateway";

it("prefers an explicit review and preserves empty metrics", async () => {
  const vault = new FakeVaultGateway();
  vault.files.set("60-发布复盘/explicit.md", "## 评论区需求\n- 想要安装教程");
  vault.metadata.set("60-发布复盘/explicit.md", { type: "发布复盘" });
  await expect(new ReviewMetricsService(vault, "60-发布复盘").load("60-发布复盘/explicit.md")).resolves.toEqual({ path: "60-发布复盘/explicit.md", metrics: [], commentEvidence: ["想要安装教程"] });
});

it("uses the latest review with an explicit date", async () => {
  const vault = new FakeVaultGateway();
  for (const [name, date] of [["old", "2026-06-01"], ["new", "2026-06-22"]] as const) {
    const path = `60-发布复盘/${name}.md`; vault.files.set(path, "| 平台 | 播放/观看 |\n| --- | ---: |\n| B站 | 10 |"); vault.metadata.set(path, { type: "发布复盘", created: date });
  }
  const result = await new ReviewMetricsService(vault, "60-发布复盘").load(null);
  expect(result.path).toBe("60-发布复盘/new.md"); expect(result.metrics[0]?.views).toBe("10");
});
```

Run: `npm test -- tests/domain/review-table.test.ts tests/data/review-metrics-service.test.ts`

Expected: PASS with no calculated or invented fields.

- [ ] **Step 5: Commit review parsing**

```powershell
git add src/domain/review-table.ts src/data/review-metrics-service.ts tests/domain/review-table.test.ts tests/data/review-metrics-service.test.ts
git commit -m "feat: parse local review metrics"
```

## Task 7: Add safe template-backed creation

**Files:**
- Create: `src/mutations/template-creation-service.ts`
- Create: `tests/mutations/template-creation-service.test.ts`

- [ ] **Step 1: Write failing filename and overwrite tests**

```ts
// tests/mutations/template-creation-service.test.ts
import { expect, it } from "vitest";
import { TemplateCreationService, sanitizeTitle } from "@/mutations/template-creation-service";
import { FakeVaultGateway } from "../support/fake-vault-gateway";

it("sanitizes only forbidden filename characters", () => { expect(sanitizeTitle('A:B/C*D? "E"')).toBe("A-B-C-D-E"); });
it("renders variables and refuses overwrite", async () => {
  const vault = new FakeVaultGateway(); vault.files.set("99-模板/topic.md", "# {{title}}\ncreated: {{date}}");
  const service = new TemplateCreationService(vault, () => new Date("2026-06-22T08:00:00"));
  await service.create({ templatePath: "99-模板/topic.md", targetPath: "10-选题池/39-Test.md", title: "Test", issue: 39 });
  expect(vault.files.get("10-选题池/39-Test.md")).toContain("# Test");
  await expect(service.create({ templatePath: "99-模板/topic.md", targetPath: "10-选题池/39-Test.md", title: "Test", issue: 39 })).rejects.toThrow("already exists");
  await expect(service.create({ templatePath: "99-模板/topic.md", targetPath: "../outside.md", title: "Test", issue: 39 })).rejects.toThrow("inside the vault");
  await expect(service.create({ templatePath: "missing.md", targetPath: "safe.md", title: "Test", issue: 39 })).rejects.toThrow("Template not found");
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- tests/mutations/template-creation-service.test.ts`

Expected: FAIL because the service is missing.

- [ ] **Step 3: Implement creation and Vault path validation**

```ts
// src/mutations/template-creation-service.ts
import type { VaultGateway } from "@/ports/vault-gateway";

export interface CreateRequest { templatePath: string; targetPath: string; title: string; issue: number; }
export const sanitizeTitle = (title: string): string => title.replace(/[<>:"/\\|?*]+/g, "-").replace(/(?:-\s*)+/g, "-").replace(/^-|-$/g, "").replace(/\s+/g, " ").trim();

export class TemplateCreationService {
  constructor(private readonly vault: VaultGateway, private readonly now: () => Date = () => new Date()) {}
  async create(request: CreateRequest): Promise<void> {
    if (/^(?:[A-Za-z]:[\\/]|[\\/])/.test(request.targetPath) || request.targetPath.replaceAll("\\", "/").split("/").includes("..")) throw new Error("Target path must stay inside the vault");
    if (!this.vault.exists(request.templatePath)) throw new Error(`Template not found: ${request.templatePath}`);
    if (this.vault.exists(request.targetPath)) throw new Error(`Target already exists: ${request.targetPath}`);
    const template = await this.vault.read(request.templatePath);
    const date = this.now().toISOString().slice(0, 10);
    const content = template.replaceAll("{{title}}", request.title).replaceAll("{{issue}}", String(request.issue)).replaceAll("{{date}}", date);
    await this.vault.create(request.targetPath, content);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/mutations/template-creation-service.test.ts`

Expected: PASS for rendering, missing template, traversal rejection, and overwrite rejection.

- [ ] **Step 5: Commit template creation**

```powershell
git add src/mutations/template-creation-service.ts tests/mutations/template-creation-service.test.ts
git commit -m "feat: create files safely from templates"
```

## Task 8: Compose the complete dashboard model

**Files:**
- Create: `src/data/dashboard-data-service.ts`
- Create: `tests/data/dashboard-data-service.test.ts`

- [ ] **Step 1: Write the failing composition test**

Create `tests/data/dashboard-data-service.test.ts`:

```ts
import { expect, it } from "vitest";
import { DashboardDataService } from "@/data/dashboard-data-service";
import { DEFAULT_SETTINGS } from "@/settings";
import { FakeVaultGateway } from "../support/fake-vault-gateway";

it("composes local topics, tasks, review data, and background", async () => {
  const vault = new FakeVaultGateway();
  vault.files.set("10-选题池/39-Focus.md", "## 本期执行清单\n- [x] A\n- [ ] B");
  vault.metadata.set("10-选题池/39-Focus.md", { type: "选题", status: "已立项", issue: 39, stage: "制作", homepage_focus: true, review_path: "60-发布复盘/review.md" });
  vault.files.set("10-选题池/40-Queue.md", "# Queue");
  vault.metadata.set("10-选题池/40-Queue.md", { type: "选题", status: "已立项", stage: "策划" });
  vault.files.set("60-发布复盘/review.md", "| 平台 | 播放/观看 |\n| --- | ---: |\n| B站 | 100 |");
  vault.metadata.set("60-发布复盘/review.md", { type: "发布复盘", created: "2026-06-22" });
  vault.files.set("80-制作资产/background.png", "binary-placeholder");
  const model = await new DashboardDataService(vault, { ...DEFAULT_SETTINGS, backgroundPath: "80-制作资产/background.png" }).load(true);
  expect(model.focus.kind).toBe("ready"); expect(model.tasks).toHaveLength(2); expect(model.queue).toHaveLength(1);
  expect(model.metrics[0]?.views).toBe("100"); expect(model.backgroundUrl).toContain("background.png"); expect(model.mobileReadOnly).toBe(true);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- tests/data/dashboard-data-service.test.ts`

Expected: FAIL because the service is missing.

- [ ] **Step 3: Implement aggregation without hidden inference**

```ts
// src/data/dashboard-data-service.ts
import { parseChecklistSection } from "@/domain/checklist";
import type { DashboardModel } from "@/domain/models";
import type { DashboardSettings } from "@/settings";
import type { VaultGateway } from "@/ports/vault-gateway";
import { AssociationResolver } from "./association-resolver";
import { resolveFocus } from "./focus-resolver";
import { ReviewMetricsService } from "./review-metrics-service";
import { TopicRepository } from "./topic-repository";

export class DashboardDataService {
  constructor(private readonly vault: VaultGateway, private readonly settings: DashboardSettings) {}
  async load(mobileReadOnly: boolean): Promise<DashboardModel> {
    const topics = new TopicRepository(this.vault, this.settings.topicDir);
    const rawFocus = resolveFocus(topics.all()); const resolver = new AssociationResolver(this.vault, this.settings);
    const focus = rawFocus.kind === "ready" ? { ...rawFocus, topic: resolver.resolve(rawFocus.topic) } : rawFocus.kind === "invalid-stage" ? { ...rawFocus, topic: resolver.resolve(rawFocus.topic) } : rawFocus;
    const focusTopic = focus.kind === "ready" || focus.kind === "invalid-stage" ? focus.topic : null;
    const associationCandidates = focusTopic === null ? { scriptPath: [], assetPath: [], reviewPath: [] } : { scriptPath: focusTopic.scriptPath ? [] : resolver.candidates(this.settings.scriptDir, focusTopic.issue), assetPath: focusTopic.assetPath ? [] : resolver.candidates(this.settings.assetDir, focusTopic.issue), reviewPath: focusTopic.reviewPath ? [] : resolver.candidates(this.settings.reviewDir, focusTopic.issue) };
    const tasks = focus.kind === "ready" || focus.kind === "invalid-stage" ? parseChecklistSection(await this.vault.read(focus.topic.path)) : [];
    const review = await new ReviewMetricsService(this.vault, this.settings.reviewDir).load(focus.kind === "ready" ? focus.topic.reviewPath : null);
    return { focus, tasks, thisWeek: topics.thisWeek(), queue: topics.productionQueue(), metrics: review.metrics, reviewPath: review.path, commentEvidence: review.commentEvidence, backgroundUrl: this.settings.backgroundPath ? this.vault.resourceUrl(this.settings.backgroundPath) : null, mobileReadOnly, associationCandidates };
  }
}
```

- [ ] **Step 4: Run composition and full unit tests**

Run: `npm test`

Expected: all domain, data, and mutation tests PASS.

- [ ] **Step 5: Commit aggregation**

```powershell
git add src/data/dashboard-data-service.ts tests/data/dashboard-data-service.test.ts
git commit -m "feat: compose dashboard data model"
```

## Task 9: Register the custom ItemView and reactive refresh

**Files:**
- Create: `src/curiosity-dashboard-view.ts`
- Modify: `src/main.ts`
- Modify: `src/settings.ts`

- [ ] **Step 1: Add the ItemView shell**

Create `src/curiosity-dashboard-view.ts`:

```ts
import { ItemView, Platform, WorkspaceLeaf } from "obsidian";
import type CuriosityDashboardPlugin from "./main";
import { DASHBOARD_VIEW_TYPE } from "./main";

export class CuriosityDashboardView extends ItemView {
  private activeTab: "overview" | "tasks" | "data";
  constructor(leaf: WorkspaceLeaf, private readonly plugin: CuriosityDashboardPlugin) { super(leaf); this.activeTab = plugin.settings.defaultTab; }
  getViewType(): string { return DASHBOARD_VIEW_TYPE; }
  getDisplayText(): string { return "Curiosity Dashboard"; }
  getIcon(): string { return "telescope"; }
  override async onOpen(): Promise<void> { await this.refresh(); }
  async refresh(): Promise<void> {
    if (Platform.isMobile && !this.plugin.settings.enableMobileView) { this.contentEl.empty(); this.contentEl.createEl("p", { text: "移动端简化视图已在设置中关闭。" }); return; }
    const model = await this.plugin.dataService().load(Platform.isMobile);
    this.contentEl.empty(); this.contentEl.addClass("curiosity-dashboard");
    this.contentEl.createDiv({ cls: "curiosity-loading", text: model.focus.kind === "ready" ? model.focus.topic.title : "Dashboard needs attention" });
  }
}
```

- [ ] **Step 2: Register commands and startup behavior**

Replace the Notice-only plugin with this complete lifecycle:

```ts
import { Plugin, WorkspaceLeaf } from "obsidian";
import { ObsidianVaultGateway } from "./adapters/obsidian-vault-gateway";
import { CuriosityDashboardView } from "./curiosity-dashboard-view";
import { DashboardDataService } from "./data/dashboard-data-service";
import { TemplateCreationService } from "./mutations/template-creation-service";
import { VaultMutationService } from "./mutations/vault-mutation-service";
import type { VaultGateway } from "./ports/vault-gateway";
import { DashboardSettingTab, DEFAULT_SETTINGS, type DashboardSettings } from "./settings";

export const DASHBOARD_VIEW_TYPE = "curiosity-dashboard-view";

export default class CuriosityDashboardPlugin extends Plugin {
  settings: DashboardSettings = DEFAULT_SETTINGS;
  gateway!: VaultGateway;
  private refreshTimer: number | null = null;

override async onload(): Promise<void> {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  this.gateway = new ObsidianVaultGateway(this.app);
  this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new CuriosityDashboardView(leaf, this));
  this.addSettingTab(new DashboardSettingTab(this.app, this));
  this.addRibbonIcon("telescope", "Open Curiosity Dashboard", () => void this.activateView());
  this.addCommand({ id: "open-curiosity-dashboard", name: "Open dashboard", callback: () => void this.activateView() });
  this.registerEvent(this.app.vault.on("modify", () => this.scheduleRefresh()));
  this.registerEvent(this.app.vault.on("create", () => this.scheduleRefresh()));
  this.registerEvent(this.app.vault.on("delete", () => this.scheduleRefresh()));
  this.registerEvent(this.app.metadataCache.on("changed", () => this.scheduleRefresh()));
  if (this.settings.openOnStartup) this.app.workspace.onLayoutReady(() => void this.activateView());
}

  async saveSettings(): Promise<void> { await this.saveData(this.settings); }
  dataService(): DashboardDataService { return new DashboardDataService(this.gateway, this.settings); }
  mutationService(): VaultMutationService { return new VaultMutationService(this.gateway); }
  templateService(): TemplateCreationService { return new TemplateCreationService(this.gateway); }
  private scheduleRefresh(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      for (const leaf of this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)) void (leaf.view as CuriosityDashboardView).refresh();
    }, 200);
  }
  async activateView(): Promise<void> {
    let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0] ?? null;
    if (leaf === null) { leaf = this.app.workspace.getLeaf("tab"); await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true }); }
    this.app.workspace.revealLeaf(leaf);
  }
}
```

Implement `scheduleRefresh()` with one 200 ms timer registered by `registerInterval`, and refresh only active dashboard leaves. `activateView()` reuses an existing dashboard leaf or opens a new tab; it must not detach unrelated leaves.

- [ ] **Step 3: Add save and service accessors**

Confirm the complete class above exposes typed `settings`, `gateway`, `saveSettings()`, `dataService()`, `mutationService()`, and `templateService()`. Add cleanup:

```ts
override onunload(): void {
  if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
}
```

- [ ] **Step 4: Build**

Run: `npm run build`

Expected: `main.js` builds and the ItemView types compile.

- [ ] **Step 5: Commit the ItemView lifecycle**

```powershell
git add src/main.ts src/settings.ts src/curiosity-dashboard-view.ts
git commit -m "feat: register reactive dashboard view"
```

## Task 10: Render Hero and Mission Control interactions

**Files:**
- Create: `src/ui/dashboard-renderer.ts`
- Create: `src/ui/renderers/hero.ts`
- Create: `src/ui/renderers/mission-control.ts`
- Modify: `src/curiosity-dashboard-view.ts`

- [ ] **Step 1: Define renderer handlers**

```ts
// src/ui/dashboard-renderer.ts
import type { DashboardModel, TopicRecord } from "@/domain/models";
import type { Stage } from "@/domain/stages";
import { renderHero } from "./renderers/hero";
import { renderMissionControl } from "./renderers/mission-control";

export interface DashboardHandlers {
  openPath(path: string): void;
  toggleTask(path: string, line: number): Promise<void>;
  confirmAdvance(path: string, stage: Stage): Promise<void>;
  createTopic(): void;
  createScript(topic: TopicRecord): void;
  createReview(topic: TopicRecord): void;
  openSettings(): void;
  selectTab(tab: "overview" | "tasks" | "data"): Promise<void>;
  setAssociation(topicPath: string, field: "script_path" | "asset_path" | "review_path", value: string): Promise<void>;
}

export class DashboardRenderer {
  render(container: HTMLElement, model: DashboardModel, handlers: DashboardHandlers, activeTab: "overview" | "tasks" | "data"): void {
    container.empty(); container.addClass("curiosity-dashboard");
    renderHero(container.createDiv(), model, handlers);
    const content = container.createDiv({ cls: "curiosity-content" });
    const tabs = content.createDiv({ cls: "curiosity-view-tabs", attr: { role: "tablist" } });
    for (const tab of ["overview", "tasks", "data"] as const) { const button = tabs.createEl("button", { text: tab[0]!.toUpperCase() + tab.slice(1), attr: { role: "tab", "aria-selected": String(tab === activeTab) } }); button.addClass(tab === activeTab ? "is-active" : "is-inactive"); button.addEventListener("click", () => void handlers.selectTab(tab)); }
    if (activeTab !== "data") renderMissionControl(content, model, handlers);
  }
}
```

- [ ] **Step 2: Render all focus states in Hero**

Create `src/ui/renderers/hero.ts`; it renders four explicit states: setup CTA for none, conflict list for multiple, disabled stage action for invalid-stage, and title/issue/stage/next action for ready:

```ts
import type { DashboardModel } from "@/domain/models";
import type { DashboardHandlers } from "../dashboard-renderer";

export function renderHero(parent: HTMLElement, model: DashboardModel, handlers: DashboardHandlers): void {
  const hero = parent.createDiv({ cls: "curiosity-hero" });
  if (model.backgroundUrl) hero.style.setProperty("--curiosity-background", `url("${model.backgroundUrl.replaceAll('"', "%22")}")`);
  hero.createDiv({ cls: "curiosity-menu-bar", text: "●  Content Studio     Mission   Queue   Scripts   Reviews" });
  const body = hero.createDiv({ cls: "curiosity-hero-body" });
  body.createDiv({ cls: "curiosity-kicker", text: "CURRENT MISSION" });
  body.createEl("h1", { cls: "curiosity-hero-title", text: "Chase your curiosity" });
  if (model.focus.kind === "none") { body.createEl("p", { text: "尚未设置当前作品。" }); body.createEl("button", { text: "Open settings" }).addEventListener("click", handlers.openSettings); return; }
  if (model.focus.kind === "multiple") { body.createEl("p", { text: "检测到多个当前作品，请只保留一个 homepage_focus: true。" }); for (const topic of model.focus.topics) body.createEl("button", { text: topic.title }).addEventListener("click", () => handlers.openPath(topic.path)); return; }
  const topic = model.focus.topic;
  body.createDiv({ cls: "curiosity-issue-pill", text: `ISSUE ${topic.issue}` });
  body.createEl("h2", { text: topic.title });
  body.createEl("p", { text: topic.nextAction ?? "下一步未设置" });
  const open = body.createEl("button", { text: "继续当前任务" }); open.addEventListener("click", () => handlers.openPath(topic.path));
  if (model.focus.kind === "invalid-stage") open.setAttr("aria-description", "当前阶段无效，阶段推进已禁用");
}
```

Never insert an HTML string from frontmatter.

- [ ] **Step 3: Render stage controls and tasks**

Create `src/ui/renderers/mission-control.ts`:

```ts
import type { DashboardModel } from "@/domain/models";
import { STAGES, stageIndex } from "@/domain/stages";
import type { DashboardHandlers } from "../dashboard-renderer";

export function renderMissionControl(parent: HTMLElement, model: DashboardModel, handlers: DashboardHandlers): void {
  if (model.focus.kind !== "ready") return;
  const topic = model.focus.topic; const windowEl = parent.createDiv({ cls: "curiosity-window curiosity-mission" });
  const bar = windowEl.createDiv({ cls: "curiosity-titlebar" });
  const dots = bar.createDiv({ cls: "curiosity-traffic-lights" }); for (const color of ["red", "yellow", "green"]) dots.createSpan({ cls: `curiosity-dot is-${color}` });
  bar.createSpan({ text: `Issue ${topic.issue} — ${topic.title}` });
  const stages = windowEl.createDiv({ cls: "curiosity-stage-track", attr: { "aria-label": "制作阶段" } });
  for (const [index, stage] of STAGES.entries()) stages.createSpan({ cls: index < stageIndex(topic.stage!) ? "is-complete" : index === stageIndex(topic.stage!) ? "is-current" : "is-pending", text: index < stageIndex(topic.stage!) ? `${stage} ✓` : stage });
  const grid = windowEl.createDiv({ cls: "curiosity-mission-grid" }); const tasks = grid.createDiv({ cls: "curiosity-subcard" }); tasks.createEl("h3", { text: "本期执行清单" });
  if (model.tasks.length === 0) tasks.createEl("p", { text: "未找到「本期执行清单」" });
  for (const task of model.tasks) { const button = tasks.createEl("button", { cls: "curiosity-task curiosity-write-action", text: `${task.checked ? "✓" : "○"} ${task.text}` }); button.disabled = model.mobileReadOnly; button.addEventListener("click", () => void handlers.toggleTask(topic.path, task.line)); }
  const links = grid.createDiv({ cls: "curiosity-subcard" }); links.createEl("h3", { text: "Quick Look" });
  for (const [label, path] of [["选题卡", topic.path], ["脚本", topic.scriptPath], ["素材", topic.assetPath], ["复盘", topic.reviewPath]] as const) if (path) links.createEl("button", { text: label }).addEventListener("click", () => handlers.openPath(path));
  for (const [label, field, candidates] of [["脚本", "script_path", model.associationCandidates.scriptPath], ["素材", "asset_path", model.associationCandidates.assetPath], ["复盘", "review_path", model.associationCandidates.reviewPath]] as const) if (candidates.length > 1) { links.createEl("p", { text: `${label}存在多个候选，请选择：` }); for (const candidate of candidates) { const select = links.createEl("button", { cls: "curiosity-write-action", text: candidate }); select.disabled = model.mobileReadOnly; select.addEventListener("click", () => void handlers.setAssociation(topic.path, field, candidate)); } }
  const advance = windowEl.createEl("button", { cls: "curiosity-primary curiosity-write-action", text: "推进阶段" }); advance.disabled = model.mobileReadOnly || topic.stage === "复盘"; advance.addEventListener("click", () => void handlers.confirmAdvance(topic.path, topic.stage!));
}
```

- [ ] **Step 4: Connect handlers in the ItemView**

Replace the temporary view rendering with `DashboardRenderer` and these handlers:

```ts
const renderer = new DashboardRenderer();
renderer.render(this.contentEl, model, {
  openPath: (path) => void this.app.workspace.openLinkText(path, "", false),
  toggleTask: async (path, line) => { try { await this.plugin.mutationService().toggleTask(path, line); await this.refresh(); } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); } },
  confirmAdvance: async (path, stage) => { if (!window.confirm(`从「${stage}」推进到下一阶段？`)) return; try { await this.plugin.mutationService().advanceStage(path, stage); await this.refresh(); } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); } },
  createTopic: () => this.openCreate("topic", null),
  createScript: (topic) => this.openCreate("script", topic),
  createReview: (topic) => this.openCreate("review", topic),
  openSettings: () => { this.app.setting.open(); this.app.setting.openTabById(this.plugin.manifest.id); },
  selectTab: async (tab) => { this.activeTab = tab; this.plugin.settings.defaultTab = tab; await this.plugin.saveSettings(); await this.refresh(); },
  setAssociation: async (topicPath, field, value) => { try { await this.plugin.mutationService().setAssociationPath(topicPath, field, value); await this.refresh(); } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); } },
}, this.activeTab);
```

Run: `npm run build`

Expected: renderer and handlers compile without unsafe HTML casts.

- [ ] **Step 5: Commit the primary UI**

```powershell
git add src/ui src/curiosity-dashboard-view.ts
git commit -m "feat: render hero and mission control"
```

## Task 11: Render This Week, Queue, Channel Pulse, Actions, and Dock

**Files:**
- Create: `src/ui/renderers/this-week.ts`
- Create: `src/ui/renderers/production-queue.ts`
- Create: `src/ui/renderers/channel-pulse.ts`
- Create: `src/ui/renderers/quick-actions.ts`
- Create: `src/ui/renderers/dock.ts`
- Modify: `src/ui/dashboard-renderer.ts`

- [ ] **Step 1: Add This Week and Production Queue**

Create `src/ui/renderers/this-week.ts` and `src/ui/renderers/production-queue.ts`:

```ts
// this-week.ts
import type { TopicRecord } from "@/domain/models";
export function renderThisWeek(parent: HTMLElement, topics: TopicRecord[], openPath: (path: string) => void): void {
  const section = parent.createEl("section", { cls: "curiosity-section" }); section.createEl("h2", { text: "This Week" });
  if (topics.length === 0) { section.createEl("p", { text: "本周暂无已设置截止日期的作品。" }); return; }
  const list = section.createEl("ul", { cls: "curiosity-list" });
  for (const topic of topics) { const item = list.createEl("li"); const button = item.createEl("button", { text: `${topic.issue} · ${topic.title}` }); button.addEventListener("click", () => openPath(topic.path)); item.createSpan({ text: `${topic.stage ?? "未设置"} · ${topic.dueDate ?? "未设置"}` }); }
}
```

```ts
// production-queue.ts
import type { TopicRecord } from "@/domain/models";
export function renderProductionQueue(parent: HTMLElement, topics: TopicRecord[], openPath: (path: string) => void): void {
  const section = parent.createEl("section", { cls: "curiosity-section" }); section.createEl("h2", { text: "Production Queue" }); const grid = section.createDiv({ cls: "curiosity-queue-grid" });
  for (const topic of topics.slice(0, 6)) { const card = grid.createEl("article", { cls: "curiosity-window curiosity-queue-card" }); card.createDiv({ cls: "curiosity-card-edge" }); card.createDiv({ cls: "curiosity-kicker", text: `ISSUE ${topic.issue}` }); const open = card.createEl("button", { text: topic.title }); open.addEventListener("click", () => openPath(topic.path)); card.createEl("p", { text: `${topic.stage ?? "未设置"} · ${topic.priority ?? "未设置"} · ${topic.dueDate ?? "未设置"}` }); }
  if (topics.length === 0) grid.createEl("p", { text: "暂无后续制作队列。" });
}
```

- [ ] **Step 2: Add Channel Pulse**

Create `src/ui/renderers/channel-pulse.ts`:

```ts
import type { DashboardModel, MetricRow } from "@/domain/models";
export function renderChannelPulse(parent: HTMLElement, model: DashboardModel, openPath: (path: string) => void): void {
  const section = parent.createEl("section", { cls: "curiosity-section" }); section.createEl("h2", { text: "Channel Pulse" });
  if (model.metrics.length === 0) { section.createEl("p", { text: "暂无可验证平台数据。" }); if (model.reviewPath) section.createEl("button", { text: "打开复盘" }).addEventListener("click", () => openPath(model.reviewPath!)); return; }
  const columns: Array<[keyof MetricRow, string]> = [["platform", "平台"], ["collectedAt", "采集时间"], ["views", "播放/观看"], ["likes", "点赞"], ["favorites", "收藏"], ["comments", "评论"], ["shares", "分享"]];
  const visible = columns.filter(([key]) => key === "platform" || model.metrics.some((row) => row[key] !== null)); const table = section.createEl("table"); const head = table.createEl("thead").createEl("tr"); for (const [, label] of visible) head.createEl("th", { text: label });
  const body = table.createEl("tbody"); for (const row of model.metrics) { const tr = body.createEl("tr"); for (const [key] of visible) tr.createEl("td", { text: row[key] ?? "—" }); }
  if (model.reviewPath) section.createEl("button", { text: "数据来源：本地发布复盘" }).addEventListener("click", () => openPath(model.reviewPath!));
  if (model.commentEvidence.length > 0) { const quotes = section.createDiv({ cls: "curiosity-comment-evidence" }); quotes.createEl("h3", { text: "已有评论需求" }); for (const item of model.commentEvidence) quotes.createEl("blockquote", { text: item }); }
}
```

- [ ] **Step 3: Add Quick Actions and Dock**

Create `src/ui/renderers/quick-actions.ts` and `src/ui/renderers/dock.ts`:

```ts
// quick-actions.ts
import type { DashboardModel } from "@/domain/models";
import type { DashboardHandlers } from "../dashboard-renderer";
export function renderQuickActions(parent: HTMLElement, model: DashboardModel, handlers: DashboardHandlers): void {
  const section = parent.createEl("section", { cls: "curiosity-section" }); section.createEl("h2", { text: "Quick Actions" }); const row = section.createDiv({ cls: "curiosity-actions" });
  const topicButton = row.createEl("button", { cls: "curiosity-write-action", text: "创建选题卡" }); topicButton.disabled = model.mobileReadOnly; topicButton.addEventListener("click", handlers.createTopic);
  if (model.focus.kind !== "ready") return;
  const topic = model.focus.topic;
  for (const [label, action] of [["创建脚本", () => handlers.createScript(topic)], ["创建复盘", () => handlers.createReview(topic)]] as const) { const button = row.createEl("button", { cls: "curiosity-write-action", text: label }); button.disabled = model.mobileReadOnly; button.addEventListener("click", action); }
}
```

```ts
// dock.ts
import type { DashboardModel } from "@/domain/models";
import type { DashboardHandlers } from "../dashboard-renderer";
export function renderDock(parent: HTMLElement, model: DashboardModel, handlers: DashboardHandlers): void {
  const dock = parent.createEl("nav", { cls: "curiosity-dock", attr: { "aria-label": "Dashboard shortcuts" } }); const focus = model.focus.kind === "ready" ? model.focus.topic : null;
  const actions: Array<[string, string | null, () => void]> = [["Ideas", null, handlers.createTopic], ["Mission", focus?.path ?? null, () => focus && handlers.openPath(focus.path)], ["Script", focus?.scriptPath ?? null, () => focus?.scriptPath && handlers.openPath(focus.scriptPath)], ["Review", focus?.reviewPath ?? null, () => focus?.reviewPath && handlers.openPath(focus.reviewPath)], ["Settings", "settings", handlers.openSettings]];
  for (const [label, availability, action] of actions) { const button = dock.createEl("button", { text: label, attr: { "aria-label": label } }); button.disabled = availability === null && label !== "Ideas"; button.addEventListener("click", action); }
}
```

- [ ] **Step 4: Add renderer composition**

Import and call module renderers in `DashboardRenderer.render()` with tab-specific visibility:

```ts
if (activeTab === "overview" || activeTab === "tasks") renderThisWeek(content, model.thisWeek, handlers.openPath);
if (activeTab === "overview") renderProductionQueue(content, model.queue, handlers.openPath);
if (activeTab === "overview" || activeTab === "data") renderChannelPulse(content, model, handlers.openPath);
if (activeTab === "overview") renderQuickActions(content, model, handlers);
renderDock(container, model, handlers);
```

Ensure every clickable element has a visible label or `aria-label`.

Run: `npm run build`

Expected: all seven modules compile and empty states render without throwing.

- [ ] **Step 5: Commit secondary modules**

```powershell
git add src/ui
git commit -m "feat: render dashboard modules and dock"
```

## Task 12: Add confirmation and file-creation modals

**Files:**
- Create: `src/ui/create-file-modal.ts`
- Create: `src/ui/confirm-stage-modal.ts`
- Modify: `src/curiosity-dashboard-view.ts`

- [ ] **Step 1: Implement stage confirmation**

Create `src/ui/confirm-stage-modal.ts`:

```ts
import { App, Modal, Setting } from "obsidian";
import { nextStage, type Stage } from "@/domain/stages";

export class ConfirmStageModal extends Modal {
  static ask(app: App, current: Stage): Promise<boolean> { return new Promise((resolve) => new ConfirmStageModal(app, current, resolve).open()); }
  private settled = false;
  private constructor(app: App, private readonly current: Stage, private readonly resolveResult: (value: boolean) => void) { super(app); }
  override onOpen(): void {
    const next = nextStage(this.current); this.contentEl.createEl("h2", { text: "推进制作阶段" }); this.contentEl.createEl("p", { text: next ? `从「${this.current}」推进到「${next}」？` : "当前已经是最终阶段。" });
    new Setting(this.contentEl).addButton((button) => button.setButtonText("取消").onClick(() => this.finish(false))).addButton((button) => button.setCta().setButtonText("推进").setDisabled(next === null).onClick(() => this.finish(true)));
  }
  override onClose(): void { this.contentEl.empty(); if (!this.settled) { this.settled = true; this.resolveResult(false); } }
  private finish(value: boolean): void { if (this.settled) return; this.settled = true; this.resolveResult(value); this.close(); }
}
```

- [ ] **Step 2: Implement file creation confirmation**

Create `src/ui/create-file-modal.ts`:

```ts
import { App, Modal, Setting } from "obsidian";
import type { CreateRequest } from "@/mutations/template-creation-service";

export interface CreateFileDefaults extends CreateRequest { heading: string; }
export class CreateFileModal extends Modal {
  static ask(app: App, defaults: CreateFileDefaults): Promise<CreateRequest | null> { return new Promise((resolve) => new CreateFileModal(app, defaults, resolve).open()); }
  private title: string; private targetPath: string; private issue: number; private settled = false;
  private constructor(app: App, private readonly defaults: CreateFileDefaults, private readonly resolveResult: (value: CreateRequest | null) => void) { super(app); this.title = defaults.title; this.targetPath = defaults.targetPath; this.issue = defaults.issue; }
  override onOpen(): void {
    this.contentEl.createEl("h2", { text: this.defaults.heading });
    new Setting(this.contentEl).setName("期数").addText((text) => text.setValue(String(this.issue)).onChange((value) => { this.issue = Number.parseInt(value, 10); }));
    new Setting(this.contentEl).setName("标题").addText((text) => text.setValue(this.title).onChange((value) => { this.title = value.trim(); }));
    new Setting(this.contentEl).setName("目标路径").addText((text) => text.setValue(this.targetPath).onChange((value) => { this.targetPath = value.trim(); }));
    const error = this.contentEl.createEl("p", { cls: "curiosity-form-error" });
    new Setting(this.contentEl).addButton((button) => button.setButtonText("取消").onClick(() => this.finish(null))).addButton((button) => button.setCta().setButtonText("创建").onClick(() => {
      if (!Number.isInteger(this.issue) || this.issue < 1 || !this.title || !this.targetPath || /^(?:[A-Za-z]:[\\/]|[\\/])/.test(this.targetPath) || this.targetPath.replaceAll("\\", "/").split("/").includes("..")) { error.setText("请输入正整数期数、标题和 Vault 内的安全目标路径。"); return; }
      this.finish({ templatePath: this.defaults.templatePath, targetPath: this.targetPath, title: this.title, issue: this.issue });
    }));
  }
  override onClose(): void { this.contentEl.empty(); if (!this.settled) { this.settled = true; this.resolveResult(null); } }
  private finish(value: CreateRequest | null): void { if (this.settled) return; this.settled = true; this.resolveResult(value); this.close(); }
}
```

- [ ] **Step 3: Wire the three creation actions**

Use naming rules:

```ts
const names = {
  topic: `${issue}-${sanitizeTitle(title)}.md`,
  script: `${issue}-${sanitizeTitle(title)}成稿.md`,
  review: `第${issue}期-${sanitizeTitle(title)}-综合复盘.md`,
};
```

Call `TemplateCreationService.create()` only after modal confirmation. On success, open the new file and refresh. On mobile, creation controls stay disabled.

Replace the temporary `window.confirm` call with `ConfirmStageModal.ask()`, and add this view method:

```ts
private async openCreate(kind: "topic" | "script" | "review", topic: TopicRecord | null): Promise<void> {
  const issue = kind === "topic" ? (topic?.issue ?? 0) + 1 : topic?.issue ?? 1; const title = kind === "topic" ? "新选题" : topic?.title ?? ""; const safe = sanitizeTitle(title); const settings = this.plugin.settings;
  const config = kind === "topic"
    ? { heading: "创建选题卡", templatePath: settings.topicTemplate, targetPath: `${settings.topicDir}/${issue || 1}-${safe}.md` }
    : kind === "script"
      ? { heading: "创建脚本", templatePath: settings.scriptTemplate, targetPath: `${settings.scriptDir}/${issue}-${safe}成稿.md` }
      : { heading: "创建发布复盘", templatePath: settings.reviewTemplate, targetPath: `${settings.reviewDir}/第${issue}期-${safe}-综合复盘.md` };
  const request = await CreateFileModal.ask(this.app, { ...config, issue, title }); if (request === null) return;
  try { await this.plugin.templateService().create(request); await this.app.workspace.openLinkText(request.targetPath, "", false); await this.refresh(); }
  catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
}
```

- [ ] **Step 4: Build and manually verify modal cancellation**

Run: `npm run build`

Expected: build passes; closing either modal produces no file write.

- [ ] **Step 5: Commit safe UI writes**

```powershell
git add src/ui src/curiosity-dashboard-view.ts
git commit -m "feat: add confirmed dashboard actions"
```

## Task 13: Implement the approved macOS visual system and responsive behavior

**Files:**
- Create: `styles.css`

- [ ] **Step 1: Add design tokens and layout containment**

Start `styles.css` with scoped tokens only:

```css
.curiosity-dashboard {
  --curiosity-bg: #05060d;
  --curiosity-panel: #10121f;
  --curiosity-panel-2: #181b28;
  --curiosity-line: #303447;
  --curiosity-text: #f7f8ff;
  --curiosity-blue: #0a84ff;
  --curiosity-cyan: #00e5ff;
  --curiosity-green: #30d158;
  --curiosity-purple: #bf5af2;
  --curiosity-pink: #ff375f;
  --curiosity-orange: #ff9f0a;
  min-height: 100%; color: var(--curiosity-text); background: var(--curiosity-bg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.curiosity-dashboard *, .curiosity-dashboard *::before, .curiosity-dashboard *::after { box-sizing: border-box; }
```

- [ ] **Step 2: Style Hero, neutral cards, and macOS components**

Use the image only in Hero, with a dark readability overlay. Main cards use `#10121f`; secondary cards use `#181b28`; no large-card gradients or outer glow. Add traffic lights using `#ff5f57`, `#febc2e`, and `#30d158`, a neutral segmented control, 18-24px window radii, and a blurred Dock. High-saturation colors may appear only on buttons, labels, stage pills, and 1-3px edges.

```css
.curiosity-hero { min-height: 680px; position: relative; padding: 72px 42px 130px; background-image: linear-gradient(90deg, rgba(2,3,8,.88), rgba(2,3,8,.16) 65%), var(--curiosity-background, none); background-size: cover; background-position: center; }
.curiosity-menu-bar { position: absolute; inset: 0 0 auto; height: 34px; padding: 9px 18px; background: rgba(16,18,31,.72); border-bottom: 1px solid rgba(255,255,255,.18); backdrop-filter: blur(24px) saturate(145%); font-size: 11px; }
.curiosity-hero-body { max-width: 650px; position: relative; z-index: 1; }
.curiosity-hero-title { margin: 20px 0; color: #fff; font: italic clamp(4.5rem, 8vw, 7rem)/.86 Georgia, "Times New Roman", serif; letter-spacing: -.055em; }
.curiosity-kicker { color: var(--curiosity-cyan); font-size: 10px; font-weight: 700; letter-spacing: .14em; }
.curiosity-content { padding: 64px 38px 110px; }
.curiosity-window { overflow: hidden; border: 1px solid var(--curiosity-line); border-radius: 20px; background: var(--curiosity-panel); }
.curiosity-titlebar { height: 42px; display: grid; grid-template-columns: 72px 1fr 72px; align-items: center; padding: 0 14px; background: #171925; border-bottom: 1px solid var(--curiosity-line); text-align: center; font-size: 11px; }
.curiosity-traffic-lights { display: flex; gap: 7px; }.curiosity-dot { width: 11px; height: 11px; border-radius: 50%; }.curiosity-dot.is-red { background: #ff5f57; }.curiosity-dot.is-yellow { background: #febc2e; }.curiosity-dot.is-green { background: var(--curiosity-green); }
.curiosity-stage-track { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin: 22px; padding: 4px; border: 1px solid var(--curiosity-line); border-radius: 10px; background: #0c0e17; }.curiosity-stage-track span { padding: 8px; border-radius: 7px; text-align: center; }.curiosity-stage-track .is-complete { background: var(--curiosity-green); color: #001306; }.curiosity-stage-track .is-current { background: var(--curiosity-purple); color: white; }.curiosity-stage-track .is-pending { color: rgba(255,255,255,.55); }
.curiosity-mission-grid { display: grid; grid-template-columns: 1.35fr .65fr; gap: 14px; padding: 0 22px 22px; }.curiosity-subcard { padding: 16px; border: 1px solid var(--curiosity-line); border-radius: 14px; background: var(--curiosity-panel-2); }
.curiosity-queue-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }.curiosity-queue-card { min-height: 150px; }.curiosity-card-edge { height: 3px; background: var(--curiosity-cyan); }
.curiosity-primary { margin: 0 22px 22px; padding: 10px 16px; border: 0; border-radius: 9px; background: var(--curiosity-blue); color: white; }
.curiosity-dock { position: fixed; z-index: 10; left: 50%; bottom: 18px; display: flex; gap: 8px; transform: translateX(-50%); padding: 9px; border: 1px solid rgba(255,255,255,.2); border-radius: 18px; background: rgba(20,22,34,.72); backdrop-filter: blur(28px) saturate(150%); }.curiosity-dock button { min-width: 58px; min-height: 42px; border-radius: 11px; }
```

- [ ] **Step 3: Add responsive and mobile read-only styles**

```css
@media (max-width: 1279px) {
  .curiosity-grid, .curiosity-mission-grid, .curiosity-queue-grid { grid-template-columns: 1fr; }
  .curiosity-menu-links { display: none; }
  .curiosity-hero-title { font-size: clamp(3.2rem, 11vw, 5.2rem); }
}
@media (max-width: 700px) {
  .curiosity-content { padding: 28px 16px 88px; }
  .curiosity-hero { min-height: 540px; padding: 48px 16px 110px; }
  .curiosity-stage-track { grid-template-columns: 1fr; }
  .curiosity-dock { position: sticky; bottom: 8px; overflow-x: auto; }
  .curiosity-write-action { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .curiosity-dashboard * { animation-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```

- [ ] **Step 4: Build and inspect at target widths**

Run: `npm run build`

Manual: inspect 1280, 1440, 1920, 900, and 390 CSS-pixel widths in an isolated development Vault. Confirm no horizontal overflow except the intentional mobile Dock scroll.

- [ ] **Step 5: Commit visual styling**

```powershell
git add styles.css
git commit -m "feat: add clean macOS dashboard styling"
```

## Task 14: Add integration fixtures, documentation, CI, and release packaging

**Files:**
- Create: `examples/topic.md`
- Create: `examples/review.md`
- Create: `docs/fields.md`
- Create: `docs/installation.md`
- Create: `README.md`
- Create: `scripts/package.mjs`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`

- [ ] **Step 1: Add exact sample data**

Create `examples/topic.md` with `type: 选题`, `status: 已立项`, `issue: 39`, `homepage_focus: true`, `stage: 制作`, `next_action`, `due_date`, and a `## 本期执行清单` containing checked and unchecked tasks. Create `examples/review.md` with a cross-platform table and an explicit `## 评论区需求` section; label all values as example data.

```markdown
---
type: 选题
status: 已立项
issue: 39
homepage_focus: true
stage: 制作
next_action: 完成首页开发验证
due_date: 2026-06-24
priority: P1
---
# 示例：Obsidian 首页重构
## 本期执行清单
- [x] 技术路线确认
- [ ] 完成首页开发验证
- [ ] 录制演示
```

```markdown
---
type: 发布复盘
status: 已发布
created: 2026-06-22
tags: [示例数据]
---
# 示例复盘（以下数字仅用于演示解析）
| 平台 | 采集时间 | 播放/观看 | 点赞 | 收藏 | 评论 | 分享 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 示例平台A | 2026-06-22 | 100 | 10 | 8 | 2 | 1 |
## 评论区需求
- 示例：希望提供安装说明。
```

- [ ] **Step 2: Add user documentation**

`docs/fields.md` documents every supported field, five valid stages, exact task heading, both review table formats, fallback rules, and all empty states. `docs/installation.md` documents manual installation into `.obsidian/plugins/curiosity-dashboard/`, required artifacts, enabling Community Plugins, configuration, and uninstalling without data loss.

`README.md` includes the product statement, seven modules, privacy guarantee, install link, configuration summary, build commands, screenshots policy, and a clear note that no background image ships in the repository. Do not add a license file in V1; repository reuse remains reserved until the owner selects a license.

Use these exact top-level README headings: `What it does`, `Screenshots`, `Install`, `Configure your vault`, `Supported data`, `Privacy and safety`, `Development`, `Release files`, and `License`. Under `License`, state: `No open-source license has been selected for V1. All rights are reserved unless the repository owner adds a license later.`

- [ ] **Step 3: Add packaging and CI**

Create `scripts/package.mjs`:

```js
import { cp, mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const dir = "dist/curiosity-dashboard";
await rm("dist", { recursive: true, force: true });
await mkdir(dir, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) await cp(file, `${dir}/${file}`);
execFileSync("tar", ["-a", "-c", "-f", "dist/curiosity-dashboard-0.1.0.zip", "-C", "dist", "curiosity-dashboard"], { stdio: "inherit" });
```

Create `.github/workflows/ci.yml` to run on push and pull requests with Node 24, `npm ci`, `npm test`, and `npm run build` on `windows-latest` and `macos-latest`.

```yaml
name: CI
on:
  push:
  pull_request:
jobs:
  verify:
    strategy:
      matrix:
        os: [windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
```

- [ ] **Step 4: Run the complete verification suite**

Run:

```powershell
npm ci
npm test
npm run typecheck
npm run build
npm run package
git diff --check
```

Expected:

- all Vitest suites PASS;
- typecheck and build exit 0;
- `dist/curiosity-dashboard-0.1.0.zip` contains only `main.js`, `manifest.json`, and `styles.css` under `curiosity-dashboard/`;
- `git diff --check` prints nothing.

- [ ] **Step 5: Perform isolated Vault smoke tests**

Copy the three artifacts to a separate development Vault. Verify: no/single/multiple focus states; task toggle; stale-stage protection; stage confirmation; three template creations; duplicate-file rejection; missing background fallback; metric parsing; narrow layout; mobile read-only. Confirm the plugin makes no network request in Obsidian Developer Tools.

- [ ] **Step 6: Prepare, but do not silently apply, the main-Vault onboarding patch**

Show the user this exact addition for `10-选题池/已立项/39-Obsidian太像文件夹我用Codex重做了首页.md` and request approval before applying it:

```yaml
issue: 39
homepage_focus: true
stage: 制作
next_action: 完成插件开发验证
```

Append this section only if it does not already exist:

```markdown
## 本期执行清单

- [x] 技术路线与设计确认
- [ ] 完成插件开发验证
- [ ] 创建脚本大纲与成稿
- [ ] 录制演示并发布
```

Configure the background path through plugin settings; never copy the original image into the public repository.

- [ ] **Step 7: Commit release readiness**

```powershell
git add examples docs README.md scripts .github package.json package-lock.json
git commit -m "docs: add installation and release workflow"
```

- [ ] **Step 8: Final branch verification before publishing**

Run:

```powershell
git status --short
git log --oneline --decorate -15
npm test
npm run build
```

Expected: clean working tree, one focused commit per task, all tests PASS, and production build succeeds. Do not push, tag, or create a GitHub Release until the user explicitly approves publication.
