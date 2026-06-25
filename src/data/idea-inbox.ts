import type { IdeaEntry } from '@/domain/models';

export const IDEA_INBOX_FILENAME = '灵感收集箱.md';

const IDEA_LINE = /^-\s+(?:(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s+)?(.+?)\s*$/;

// 解析灵感收集箱内容为条目列表（行号 1-based，跳过标题/空行/非条目行）。
export function parseIdeaInbox(content: string): IdeaEntry[] {
  const entries: IdeaEntry[] = [];
  const lines = content.split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const match = IDEA_LINE.exec(raw);
    if (match === null) continue;
    const text = (match[2] ?? '').trim();
    if (text.length === 0) continue;
    entries.push({ line: index + 1, recordedAt: match[1] ?? '', text });
  }
  return entries;
}

export function ideaInboxPath(topicInboxDir: string): string {
  const dir = topicInboxDir.replace(/\\/g, '/').replace(/\/+$/, '');
  return dir.length === 0 ? IDEA_INBOX_FILENAME : `${dir}/${IDEA_INBOX_FILENAME}`;
}
