import type { TopicRecord } from '@/domain/models';
import type { Translator } from '@/i18n/translator';

const VISIBLE_LIMIT = 8;

export function renderThisWeek(
  parent: HTMLElement,
  topics: TopicRecord[],
  openPath: (path: string) => Promise<void>,
  t: Translator,
): void {
  const section = parent.createEl('section', {
    cls: 'curiosity-section curiosity-this-week',
  });
  section.createEl('h2', { text: t.t('thisWeek.title') });
  if (topics.length === 0) {
    section.createEl('p', { text: t.t('thisWeek.empty') });
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
    const stageText = topic.stage === null ? t.t('common.unset') : t.stageLabel(topic.stage);
    item.createSpan({
      cls: 'curiosity-item-meta',
      text: `${stageText} · ${topic.dueDate ?? t.t('common.unset')}`,
    });
  }
  renderOverflow(section, topics.length - VISIBLE_LIMIT, t);
}

function renderOverflow(parent: HTMLElement, count: number, t: Translator): void {
  if (count <= 0) return;
  parent.createEl('p', { cls: 'curiosity-overflow-count', text: t.t('overflow.items', { count }) });
}
