import type { DashboardModel, MetricRow } from '@/domain/models';

type MetricKey = keyof MetricRow;

const MAX_METRIC_ROWS = 12;
const MAX_COMMENT_EVIDENCE = 8;

const COLUMNS: ReadonlyArray<readonly [MetricKey, string]> = [
  ['platform', '平台'],
  ['collectedAt', '采集时间'],
  ['views', '播放/观看'],
  ['likes', '点赞'],
  ['favorites', '收藏'],
  ['comments', '评论'],
  ['shares', '分享'],
];

export function renderChannelPulse(
  parent: HTMLElement,
  model: DashboardModel,
  openPath: (path: string) => Promise<void>,
): void {
  const section = parent.createEl('section', {
    cls: 'curiosity-section curiosity-channel-pulse',
  });
  section.createEl('h2', { text: 'Channel Pulse' });

  if (model.metrics.length === 0) {
    section.createEl('p', { text: '暂无可验证平台数据。' });
  } else {
    renderMetricsTable(section, model.metrics);
  }

  if (model.reviewPath !== null) {
    const source = section.createEl('button', {
      cls: 'curiosity-review-source',
      text: '数据来源：本地发布复盘',
      type: 'button',
      attr: { 'aria-label': `打开本地发布复盘：${model.reviewPath}` },
    });
    source.addEventListener('click', () => void openPath(model.reviewPath!));
  } else {
    section.createEl('p', { cls: 'curiosity-source-state', text: '未关联本地发布复盘。' });
  }

  const comments = section.createEl('section', {
    cls: 'curiosity-comment-evidence',
    attr: { 'aria-label': '评论区需求' },
  });
  comments.createEl('h3', { text: '评论区需求' });
  if (model.commentEvidence.length === 0) {
    comments.createEl('p', { text: '暂无可验证评论内容' });
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
      text: `另有 ${commentOverflow} 条评论`,
    });
  }
}

function renderMetricsTable(parent: HTMLElement, rows: MetricRow[]): void {
  const visible = COLUMNS.filter(([key]) =>
    key === 'platform' || rows.some((row) => row[key] !== null));
  const wrapper = parent.createDiv({ cls: 'curiosity-table-wrapper' });
  const table = wrapper.createEl('table');
  table.createEl('caption', { text: '本地发布复盘中的平台数据' });
  const header = table.createEl('thead').createEl('tr');
  for (const [, label] of visible) {
    header.createEl('th', { text: label, attr: { scope: 'col' } });
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
      text: `另有 ${rowOverflow} 条平台数据`,
    });
  }
}
