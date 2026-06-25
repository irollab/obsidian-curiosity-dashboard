import type { DashboardModel, MetricRow } from '@/domain/models';
import type { TranslationKey } from '@/i18n/translations';
import type { Translator } from '@/i18n/translator';

import { renderWindowTitlebar } from './window-frame';

type MetricKey = keyof MetricRow;

const MAX_METRIC_ROWS = 12;
const MAX_COMMENT_EVIDENCE = 8;

const COLUMNS: ReadonlyArray<readonly [MetricKey, TranslationKey]> = [
  ['platform', 'pulse.col.platform'],
  ['collectedAt', 'pulse.col.collectedAt'],
  ['views', 'pulse.col.views'],
  ['likes', 'pulse.col.likes'],
  ['favorites', 'pulse.col.favorites'],
  ['comments', 'pulse.col.comments'],
  ['shares', 'pulse.col.shares'],
];

export function renderChannelPulse(
  parent: HTMLElement,
  model: DashboardModel,
  openPath: (path: string) => Promise<void>,
  t: Translator,
): void {
  const section = parent.createEl('section', {
    cls: 'curiosity-section curiosity-channel-pulse',
  });
  renderWindowTitlebar(section, t.t('pulse.title'));

  if (model.metrics.length === 0) {
    section.createEl('p', { text: t.t('pulse.empty') });
  } else {
    renderMetricsTable(section, model.metrics, t);
  }

  if (model.reviewPath !== null) {
    const source = section.createEl('button', {
      cls: 'curiosity-review-source',
      text: t.t('pulse.sourceButton'),
      type: 'button',
      attr: { 'aria-label': t.t('pulse.sourceButtonAria', { path: model.reviewPath }) },
    });
    source.addEventListener('click', () => void openPath(model.reviewPath!));
  } else {
    section.createEl('p', { cls: 'curiosity-source-state', text: t.t('pulse.noSource') });
  }

  const comments = section.createEl('section', {
    cls: 'curiosity-comment-evidence',
    attr: { 'aria-label': t.t('pulse.commentsTitle') },
  });
  comments.createEl('h3', { text: t.t('pulse.commentsTitle') });
  if (model.commentEvidence.length === 0) {
    comments.createEl('p', { text: t.t('pulse.commentsEmpty') });
    return;
  }
  const list = comments.createEl('ul');
  for (const evidence of model.commentEvidence.slice(0, MAX_COMMENT_EVIDENCE)) {
    list.createEl('li').createEl('blockquote', { text: evidence });
  }
  const commentOverflow = model.commentEvidence.length - MAX_COMMENT_EVIDENCE;
  if (commentOverflow > 0) {
    comments.createEl('p', {
      cls: 'curiosity-overflow-count',
      text: t.t('pulse.overflowComments', { count: commentOverflow }),
    });
  }
}

function renderMetricsTable(parent: HTMLElement, rows: MetricRow[], t: Translator): void {
  const visible = COLUMNS.filter(([key]) =>
    key === 'platform' || rows.some((row) => row[key] !== null));
  const wrapper = parent.createDiv({ cls: 'curiosity-table-wrapper' });
  const table = wrapper.createEl('table');
  table.createEl('caption', { text: t.t('pulse.tableCaption') });
  const header = table.createEl('thead').createEl('tr');
  for (const [, key] of visible) {
    header.createEl('th', { text: t.t(key), attr: { scope: 'col' } });
  }
  const body = table.createEl('tbody');
  for (const row of rows.slice(0, MAX_METRIC_ROWS)) {
    const tr = body.createEl('tr');
    for (const [key] of visible) tr.createEl('td', { text: row[key] ?? '—' });
  }
  const rowOverflow = rows.length - MAX_METRIC_ROWS;
  if (rowOverflow > 0) {
    parent.createEl('p', {
      cls: 'curiosity-overflow-count',
      text: t.t('pulse.overflowRows', { count: rowOverflow }),
    });
  }
}
