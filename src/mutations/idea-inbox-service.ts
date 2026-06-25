import { parseIdeaInbox } from '@/data/idea-inbox';
import type { VaultGateway } from '@/ports/vault-gateway';

// 按行号编辑/删除灵感收集箱里的条目，写回原文件。
export class IdeaInboxService {
  constructor(private readonly vault: VaultGateway) {}

  async edit(inboxPath: string, line: number, text: string): Promise<void> {
    const next = text.trim().replace(/\s+/g, ' ');
    if (next.length === 0) {
      throw new Error('Idea must not be empty');
    }
    await this.rewrite(inboxPath, line, (recordedAt) =>
      recordedAt.length === 0 ? `- ${next}` : `- ${recordedAt} ${next}`);
  }

  async delete(inboxPath: string, line: number): Promise<void> {
    await this.rewrite(inboxPath, line, null);
  }

  private async rewrite(
    inboxPath: string,
    line: number,
    replacement: ((recordedAt: string) => string) | null,
  ): Promise<void> {
    await this.vault.process(inboxPath, (content) => {
      const lines = content.split(/\r?\n/);
      const index = line - 1;
      const target = lines[index];
      if (index < 0 || index >= lines.length || target === undefined) return content;
      const entry = parseIdeaInbox(target)[0];
      if (entry === undefined) return content;
      if (replacement === null) {
        lines.splice(index, 1);
      } else {
        lines[index] = replacement(entry.recordedAt);
      }
      return lines.join('\n');
    });
  }
}
