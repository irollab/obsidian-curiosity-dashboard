import type { Translator } from '@/i18n/translator';

// 通用翻页条：重渲染时清空并按当前页/总页数重建。totalPages<=1 时不显示。
// 复用既有 discover 分页样式与文案键（prevPage/nextPage/pageInfo）。
export function renderPager(
  pager: HTMLElement,
  page: number,
  totalPages: number,
  total: number,
  t: Translator,
  onChange: (next: number) => void,
): void {
  pager.empty();
  if (totalPages <= 1) return;

  const prev = pager.createEl('button', {
    cls: 'curiosity-discover-page-btn', text: t.t('discover.prevPage'), type: 'button',
  });
  prev.disabled = page === 0;
  if (page > 0) prev.addEventListener('click', () => onChange(page - 1));

  pager.createSpan({
    cls: 'curiosity-discover-page-info',
    text: t.t('discover.pageInfo', {
      page: String(page + 1), total: String(totalPages), count: String(total),
    }),
  });

  const next = pager.createEl('button', {
    cls: 'curiosity-discover-page-btn', text: t.t('discover.nextPage'), type: 'button',
  });
  next.disabled = page >= totalPages - 1;
  if (page < totalPages - 1) next.addEventListener('click', () => onChange(page + 1));
}
