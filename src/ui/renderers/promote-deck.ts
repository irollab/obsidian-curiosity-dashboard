import type { DashboardModel, TopicRecord } from '@/domain/models';
import type { Translator } from '@/i18n/translator';

import type { DashboardHandlers } from '../dashboard-renderer';
import { bindGuardedAction } from '../guarded-action';
import { renderPager } from './pager';
import { renderWindowTitlebar } from './window-frame';

// 待评估卡过多时翻页，每页条数。
const PROMOTE_PAGE_SIZE = 10;

// 「立项」tab：列出无阶段（尚未进入流水线）的待评估选题，提供「立项」一键升入流水线并设为当前作品。
// 这些卡在别处没有入口，作品选择器也已把它们过滤掉（切过去会落「未知阶段」）。
export function renderPromoteDeck(
  parent: HTMLElement,
  model: DashboardModel,
  handlers: DashboardHandlers,
  t: Translator,
): void {
  const section = parent.createEl('section', { cls: 'curiosity-section curiosity-promote' });
  renderWindowTitlebar(section, t.t('tab.promote'));

  const pending = model.pickableTopics
    .filter((topic) => topic.stage === null)
    .sort((left, right) => right.issue - left.issue);

  if (pending.length === 0) {
    section.createEl('p', { cls: 'curiosity-promote-empty', attr: { role: 'status' }, text: t.t('promote.empty') });
    return;
  }

  section.createEl('p', {
    cls: 'curiosity-promote-hint',
    text: t.t('discover.pendingTitle', { count: String(pending.length) }),
  });
  const list = section.createEl('ul', { cls: 'curiosity-pending-list' });
  const pager = section.createDiv({ cls: 'curiosity-discover-pager curiosity-promote-pager' });

  let page = 0;
  const renderPage = (): void => {
    const totalPages = Math.max(1, Math.ceil(pending.length / PROMOTE_PAGE_SIZE));
    if (page >= totalPages) page = totalPages - 1;
    list.empty();
    const start = page * PROMOTE_PAGE_SIZE;
    for (const topic of pending.slice(start, start + PROMOTE_PAGE_SIZE)) {
      renderPendingItem(list, topic, model, handlers, t);
    }
    renderPager(pager, page, totalPages, pending.length, t, (next) => {
      page = next;
      renderPage();
    });
  };
  renderPage();
}

function renderPendingItem(
  list: HTMLElement,
  topic: TopicRecord,
  model: DashboardModel,
  handlers: DashboardHandlers,
  t: Translator,
): void {
  const item = list.createEl('li', { cls: 'curiosity-pending-item' });
  item.createSpan({ cls: 'curiosity-pending-issue', text: t.t('hero.issuePill', { issue: topic.issue }) });
  item.createSpan({ cls: 'curiosity-pending-title', text: topic.title });
  const promote = item.createEl('button', {
    cls: 'curiosity-write-action curiosity-pending-promote',
    text: t.t('action.promote'),
    type: 'button',
  });
  promote.disabled = model.mobileReadOnly;
  if (model.mobileReadOnly) {
    promote.setAttr('title', t.t('common.mobileReadonlyMode'));
  } else {
    bindGuardedAction(promote, () => handlers.promoteTopic(topic.path));
  }
}
