import type { TopicRecord } from '@/domain/models';

const VISIBLE_LIMIT = 8;

export function renderThisWeek(
  parent: HTMLElement,
  topics: TopicRecord[],
  openPath: (path: string) => Promise<void>,
): void {
  const section = parent.createEl('section', {
    cls: 'curiosity-section curiosity-this-week',
  });
  section.createEl('h2', { text: 'This Week' });
  if (topics.length === 0) {
    section.createEl('p', { text: '本周暂无已设置截止日期的作品。' });
    return;
  }

  const list = section.createEl('ul', { cls: 'curiosity-list curiosity-week-list' });
  for (const topic of topics.slice(0, VISIBLE_LIMIT)) {
    const item = list.createEl('li');
    const button = item.createEl('button', {
      text: `${topic.issue} · ${topic.title}`,
      type: 'button',
    });
    button.addEventListener('click', () => void openPath(topic.path));
    item.createSpan({
      cls: 'curiosity-item-meta',
      text: `${topic.stage ?? '未设置'} · ${topic.dueDate ?? '未设置'}`,
    });
  }
  renderOverflow(section, topics.length - VISIBLE_LIMIT);
}

function renderOverflow(parent: HTMLElement, count: number): void {
  if (count <= 0) return;
  parent.createEl('p', { cls: 'curiosity-overflow-count', text: `另有 ${count} 项` });
}
