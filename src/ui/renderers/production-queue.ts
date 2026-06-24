import type { TopicRecord } from '@/domain/models';
import type { Translator } from '@/i18n/translator';

const VISIBLE_LIMIT = 6;

export function renderProductionQueue(
  parent: HTMLElement,
  topics: TopicRecord[],
  openPath: (path: string) => Promise<void>,
  t: Translator,
): void {
  const section = parent.createEl('section', {
    cls: 'curiosity-section curiosity-production-queue',
  });
  section.createEl('h2', { text: t.t('queue.title') });
  const grid = section.createDiv({ cls: 'curiosity-queue-grid' });
  if (topics.length === 0) {
    grid.createEl('p', { text: t.t('queue.empty') });
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
    const stageText = topic.stage === null ? t.t('common.unset') : t.stageLabel(topic.stage);
    card.createEl('p', {
      text: [
        stageText,
        topic.priority ?? t.t('common.unset'),
        topic.dueDate ?? t.t('common.unset'),
      ].join(' · '),
    });
  }

  const overflow = topics.length - VISIBLE_LIMIT;
  if (overflow > 0) {
    section.createEl('p', {
      cls: 'curiosity-overflow-count',
      text: t.t('overflow.items', { count: overflow }),
    });
  }
}
