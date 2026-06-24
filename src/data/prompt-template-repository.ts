import { normalizeStage } from '@/domain/stages';
import type { WorkflowAction, WorkflowGroup } from '@/domain/workflow';
import type { VaultGateway } from '@/ports/vault-gateway';

interface ParsedTemplate {
  frontmatter: Record<string, string>;
  body: string;
}

interface PrefetchedEntry {
  path: string;
  content: string;
}

export class PromptTemplateRepository {
  private readonly actions: WorkflowAction[];
  private readonly skippedPaths: string[];

  private constructor(entries: PrefetchedEntry[]) {
    const actions: WorkflowAction[] = [];
    const skipped: string[] = [];
    for (const { path, content } of entries) {
      const action = toAction(content, path);
      if (action === null) skipped.push(path);
      else actions.push(action);
    }
    actions.sort(
      (a, b) =>
        groupRank(a.group) - groupRank(b.group) || a.order - b.order || a.label.localeCompare(b.label),
    );
    this.actions = actions;
    this.skippedPaths = skipped;
  }

  static async load(vault: VaultGateway, promptDir: string): Promise<PromptTemplateRepository> {
    const dir = normalize(promptDir);
    const paths = vault
      .listMarkdownPaths()
      .map(normalize)
      .filter((path) => dir.length > 0 && path.startsWith(`${dir}/`))
      .sort();

    const entries: PrefetchedEntry[] = [];
    for (const path of paths) {
      try {
        entries.push({ path, content: await vault.read(path) });
      } catch {
        // 读失败的文件直接忽略（不计入 skipped，因为根本没读到）
      }
    }
    return new PromptTemplateRepository(entries);
  }

  all(): WorkflowAction[] {
    return this.actions;
  }

  skipped(): string[] {
    return this.skippedPaths;
  }

  present(): boolean {
    return this.actions.length > 0;
  }
}

function toAction(content: string, path: string): WorkflowAction | null {
  const parsed = parseTemplate(content);
  const id = parsed.frontmatter.id?.trim() ?? '';
  const label = parsed.frontmatter.label?.trim() ?? '';
  if (id.length === 0 || label.length === 0) return null;
  const output = parsed.frontmatter.output?.trim() ?? '';
  return {
    id,
    label,
    description: parsed.frontmatter.description?.trim() ?? '',
    group: toGroup(parsed.frontmatter.stage),
    order: toOrder(parsed.frontmatter.order),
    needsFocus: parsed.frontmatter.needs_focus?.trim() === 'true',
    output: output.length === 0 ? null : normalize(output),
    body: parsed.body,
    sourcePath: path,
  };
}

function toGroup(value: string | undefined): WorkflowGroup {
  return normalizeStage(value?.trim()) ?? 'general';
}

function toOrder(value: string | undefined): number {
  const parsed = Number.parseInt(value?.trim() ?? '', 10);
  return Number.isSafeInteger(parsed) ? parsed : 999;
}

function groupRank(group: WorkflowGroup): number {
  const order: Record<WorkflowGroup, number> = {
    选题: 0,
    策划: 1,
    制作: 2,
    发布: 3,
    复盘: 4,
    general: 5,
  };
  return order[group];
}

function parseTemplate(content: string): ParsedTemplate {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (match === null) return { frontmatter: {}, body: content };
  const rawFrontmatter = match[1] ?? '';
  const body = match[2] ?? '';
  const frontmatter: Record<string, string> = {};
  for (const line of rawFrontmatter.split(/\r?\n/)) {
    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
    if (pair === null) continue;
    const key = pair[1];
    const value = pair[2] ?? '';
    if (key === undefined) continue;
    frontmatter[key] = unquote(value);
  }
  return { frontmatter, body };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}
