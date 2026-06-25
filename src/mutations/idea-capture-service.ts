import type { VaultGateway } from '@/ports/vault-gateway';

// 极速灵感捕获：把一行念头（带时间戳）追加到灵感收集箱；文件不存在则新建。
export class IdeaCaptureService {
  constructor(
    private readonly vault: VaultGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async capture(inboxPath: string, idea: string, heading: string): Promise<void> {
    const text = idea.trim().replace(/\s+/g, ' ');
    if (text.length === 0) {
      throw new Error('Idea must not be empty');
    }
    const line = `- ${formatDateTime(this.now())} ${text}`;
    if (this.vault.exists(inboxPath)) {
      await this.vault.process(inboxPath, (content) => `${content.replace(/\s+$/, '')}\n${line}\n`);
    } else {
      await this.vault.create(inboxPath, `${heading}\n\n${line}\n`);
    }
  }
}

function formatDateTime(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}
