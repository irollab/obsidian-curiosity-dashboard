import type { DashboardModel } from '@/domain/models';
import { STAGES, stageIndex } from '@/domain/stages';
import type { Translator } from '@/i18n/translator';

const VISIBLE_LIMIT = 8;

export function renderThisWeek(
  parent: HTMLElement,
  model: DashboardModel,
  openPath: (path: string) => Promise<void>,
  t: Translator,
): void {
  const section = parent.createEl('section', {
    cls: 'curiosity-section curiosity-this-week',
  });
  section.createEl('h2', { text: t.t('thisWeek.title') });

  const topics = model.thisWeek;
  if (topics.length === 0) {
    section.createEl('p', { text: t.t('thisWeek.empty') });
    renderProgressSummary(section, model, t);
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

function renderProgressSummary(parent: HTMLElement, model: DashboardModel, t: Translator): void {
  const summary = parent.createDiv({ cls: 'curiosity-week-summary' });
  stat(summary, t.t('thisWeek.statStage'), stageProgressText(model, t));
  const total = model.tasks.length;
  const done = model.tasks.filter((task) => task.checked).length;
  stat(summary, t.t('thisWeek.statChecklist'), `${done}/${total}`);
  stat(summary, t.t('thisWeek.statQueue'), t.t('thisWeek.pendingItems', { count: model.queue.length }));
}

function stageProgressText(model: DashboardModel, t: Translator): string {
  if (model.focus.kind === 'ready') {
    const stage = model.focus.topic.stage;
    return `${t.stageLabel(stage)} · ${stageIndex(stage) + 1}/${STAGES.length}`;
  }
  if (model.focus.kind === 'invalid-stage') return t.t('stage.unknown');
  return t.t('common.unset');
}

function stat(parent: HTMLElement, label: string, value: string): void {
  const item = parent.createDiv({ cls: 'curiosity-week-stat' });
  item.createSpan({ cls: 'curiosity-week-stat-label', text: label });
  item.createEl('strong', { cls: 'curiosity-week-stat-value', text: value });
}

function renderOverflow(parent: HTMLElement, count: number, t: Translator): void {
  if (count <= 0) return;
  parent.createEl('p', { cls: 'curiosity-overflow-count', text: t.t('overflow.items', { count }) });
}
