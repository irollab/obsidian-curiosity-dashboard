import type { TopicRecord } from '@/domain/models';

const VISIBLE_LIMIT = 6;

export function renderProductionQueue(
  parent: HTMLElement,
  topics: TopicRecord[],
  openPath: (path: string) => Promise<void>,
): void {
  const section = parent.createEl('section', {
    cls: 'curiosity-section curiosity-production-queue',
  });
  section.createEl('h2', { text: 'Production Queue' });
  const grid = section.createDiv({ cls: 'curiosity-queue-grid' });
  if (topics.length === 0) {
    grid.createEl('p', { text: '暂无后续制作队列。' });
    return;
  }

  for (const topic of topics.slice(0, VISIBLE_LIMIT)) {
    const card = grid.createEl('article', {
      cls: 'curiosity-window curiosity-queue-card',
    });
    card.createDiv({ cls: 'curiosity-card-edge', attr: { 'aria-hidden': 'true' } });
    card.createDiv({ cls: 'curiosity-kicker', text: `ISSUE ${topic.issue}` });
    const button = card.createEl('button', { text: topic.title, type: 'button' });
    button.addEventListener('click', () => void openPath(topic.path));
    card.createEl('p', {
      text: [
        topic.stage ?? '未设置',
        topic.priority ?? '未设置',
        topic.dueDate ?? '未设置',
      ].join(' · '),
    });
  }

  const overflow = topics.length - VISIBLE_LIMIT;
  if (overflow > 0) {
    section.createEl('p', { cls: 'curiosity-overflow-count', text: `另有 ${overflow} 项` });
  }
}
