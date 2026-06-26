import type { AudienceSignal } from '@/domain/discovery';
import type { Frontmatter, VaultGateway } from '@/ports/vault-gateway';
import type { DashboardSettings } from '@/settings';
import { ideaInboxPath, parseIdeaInbox } from './idea-inbox';

const LIST_ITEM = /^-\s+(?:\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?\s+)?(.+?)\s*$/;

export class AudienceSignalRepository {
  constructor(
    private readonly vault: VaultGateway,
    private readonly settings: DashboardSettings,
  ) {}

  async collect(): Promise<AudienceSignal[]> {
    const signals: AudienceSignal[] = [];
    signals.push(...(await this.fromIdeaInbox()));
    signals.push(...this.fromTopicCards());
    signals.push(...(await this.fromReviews()));
    signals.push(...(await this.fromCommentDoc()));
    return signals;
  }

  private async fromIdeaInbox(): Promise<AudienceSignal[]> {
    const path = ideaInboxPath(this.settings.topicInboxDir);
    if (!this.vault.exists(path)) return [];
    const ideas = parseIdeaInbox(await this.safeRead(path));
    return ideas.map((idea) => ({ text: idea.text, kind: '灵感', source: '灵感收集箱', weight: 1 }));
  }

  private fromTopicCards(): AudienceSignal[] {
    const dir = normalize(this.settings.topicInboxDir);
    const out: AudienceSignal[] = [];
    for (const path of this.vault.listMarkdownPaths().map(normalize)) {
      if (!isInside(path, dir) || path.endsWith('/灵感收集箱.md')) continue;
      const fm = this.safeFrontmatter(path);
      const title = typeof fm?.title === 'string' ? fm.title.trim() : '';
      if (fm?.type !== '选题' || title.length === 0) continue;
      out.push({ text: title, kind: '灵感', source: '待评估选题', weight: 1 });
    }
    return out;
  }

  private async fromReviews(): Promise<AudienceSignal[]> {
    const dir = normalize(this.settings.reviewDir);
    const out: AudienceSignal[] = [];
    for (const path of this.vault.listMarkdownPaths().map(normalize)) {
      if (!isInside(path, dir)) continue;
      const fm = this.safeFrontmatter(path);
      const questions = fm?.audience_questions;
      if (!Array.isArray(questions)) continue;
      for (const q of questions) {
        if (typeof q !== 'string' || q.trim().length === 0) continue;
        out.push({ text: q.trim(), kind: '问题', source: '复盘高问点', weight: 1 });
      }
    }
    return out;
  }

  private async fromCommentDoc(): Promise<AudienceSignal[]> {
    const path = normalize(this.settings.commentDocPath);
    if (path.length === 0 || !this.vault.exists(path)) return [];
    const out: AudienceSignal[] = [];
    for (const line of (await this.safeRead(path)).split(/\r?\n/)) {
      const match = LIST_ITEM.exec(line);
      const text = (match?.[1] ?? '').trim();
      if (text.length === 0) continue;
      out.push({ text, kind: '问题', source: '评论收集档', weight: 1 });
    }
    return out;
  }

  private async safeRead(path: string): Promise<string> {
    try {
      return await this.vault.read(path);
    } catch {
      return '';
    }
  }

  private safeFrontmatter(path: string): Frontmatter | null {
    try {
      return this.vault.getFrontmatter(path);
    } catch {
      return null;
    }
  }
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function isInside(path: string, dir: string): boolean {
  return dir.length === 0 || path.startsWith(`${dir}/`);
}
