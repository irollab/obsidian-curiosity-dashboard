import type { DashboardModel, MetricRow } from '@/domain/models';
import type { TranslationKey } from '@/i18n/translations';
import type { Translator } from '@/i18n/translator';

import { focusMeta, renderWindowTitlebar } from './window-frame';

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
  renderWindowTitlebar(section, t.t('pulse.title'), focusMeta(model, t));

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

// 各指标列的强调色（与样式表中的列色调对应），用于值的高亮与高值放大。
const METRIC_ACCENT: Record<MetricKey, string> = {
  platform: '',
  collectedAt: '',
  views: '#3da9fc',
  likes: '#ef5b7d',
  favorites: '#ffc24b',
  comments: '#7c5cff',
  shares: '#2ec27e',
};

// 把形如「1.2万」「3,200」「85w」的中文数据文案解析为可比较的数值，用于判定高值。
function parseMetricValue(raw: string | null): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (text.length === 0 || text === '—' || text === '-') return null;
  const match = /^([\d.]+)\s*(亿|万|w|k)?/i.exec(text);
  if (match === null) return null;
  const base = Number.parseFloat(match[1] ?? '');
  if (!Number.isFinite(base)) return null;
  const unit = (match[2] ?? '').toLowerCase();
  if (unit === '亿') return base * 1e8;
  if (unit === '万' || unit === 'w') return base * 1e4;
  if (unit === 'k') return base * 1e3;
  return base;
}

function renderMetricsTable(parent: HTMLElement, rows: MetricRow[], t: Translator): void {
  const visible = COLUMNS.filter(([key]) =>
    key === 'platform' || key === 'collectedAt' || rows.some((row) => row[key] !== null));
  // 每个指标列的「高值阈值」：取该列所有有效值的最大值作为突出基准。
  const maxima: Partial<Record<string, number>> = {};
  for (const [key] of visible) {
    const accent = METRIC_ACCENT[key];
    if (accent === undefined || accent.length === 0) continue;
    const values = rows.map((row) => parseMetricValue(row[key])).filter(
      (v): v is number => v !== null,
    );
    if (values.length > 0) maxima[key] = Math.max(...values);
  }

  const wrapper = parent.createDiv({ cls: 'curiosity-table-wrapper' });
  const table = wrapper.createEl('table');
  table.createEl('caption', { text: t.t('pulse.tableCaption') });
  const header = table.createEl('thead').createEl('tr');
  for (const [key, translationKey] of visible) {
    const th = header.createEl('th', { text: t.t(translationKey), attr: { scope: 'col' } });
    if (key in METRIC_ACCENT) {
      th.style.setProperty('color', METRIC_ACCENT[key] as string);
    }
  }
  const body = table.createEl('tbody');
  for (const row of rows.slice(0, MAX_METRIC_ROWS)) {
    const tr = body.createEl('tr');
    for (const [key] of visible) {
      const td = tr.createEl('td');
      if (key === 'platform') {
        const tag = td.createSpan({ cls: 'curiosity-pulse-platform', text: row[key] ?? '—' });
        tintPlatform(tag, row[key] ?? '');
        continue;
      }
      const value = row[key] ?? '—';
      td.createEl('span', { text: value });
      const accent = METRIC_ACCENT[key];
      if (accent !== undefined && accent.length > 0 && value !== '—') {
        td.style.setProperty('color', accent);
        const numeric = parseMetricValue(row[key] as string | null);
        const max = maxima[key];
        if (numeric !== null && max !== undefined && max > 0 && numeric >= max) {
          td.addClass('curiosity-pulse-top');
        }
      }
    }
  }
  const rowOverflow = rows.length - MAX_METRIC_ROWS;
  if (rowOverflow > 0) {
    parent.createEl('p', {
      cls: 'curiosity-overflow-count',
      text: t.t('pulse.overflowRows', { count: rowOverflow }),
    });
  }
}

// 平台名稳定散列出色相，给平台标签上区分底色。
function platformHue(platform: string): number {
  let hash = 0;
  for (let i = 0; i < platform.length; i += 1) {
    hash = (hash * 31 + platform.charCodeAt(i)) % 360;
  }
  return hash;
}

function tintPlatform(element: HTMLElement, platform: string): void {
  if (platform.length === 0) return;
  const hue = platformHue(platform);
  element.style.setProperty('background', `hsla(${hue}, 65%, 50%, 0.22)`);
  element.style.setProperty('border-color', `hsla(${hue}, 65%, 60%, 0.45)`);
  element.style.setProperty('color', `hsl(${hue}, 80%, 82%)`);
}
