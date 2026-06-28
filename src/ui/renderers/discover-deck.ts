import type { AudienceSignal, Hotspot, HotspotSourceResult } from '@/domain/discovery';
import type { DashboardModel } from '@/domain/models';
import type { Translator } from '@/i18n/translator';

import type { DashboardHandlers } from '../dashboard-renderer';
import { bindGuardedAction } from '../guarded-action';
import { renderWindowTitlebar } from './window-frame';

// 热点条目过多时翻页，每页条数。
const HOTSPOT_PAGE_SIZE = 10;

export function renderDiscoverDeck(
  parent: HTMLElement,
  model: DashboardModel,
  handlers: DashboardHandlers,
  t: Translator,
  hotspotsLoading = false,
): void {
  const section = parent.createEl('section', { cls: 'curiosity-section curiosity-discover' });
  renderWindowTitlebar(section, t.t('discover.title'));

  const toolbar = section.createDiv({ cls: 'curiosity-discover-toolbar' });
  const refresh = toolbar.createEl('button', {
    cls: 'curiosity-write-action curiosity-discover-refresh',
    text: hotspotsLoading ? t.t('discover.refreshing') : t.t('discover.refresh'),
    type: 'button',
  });
  refresh.disabled = hotspotsLoading;
  if (!hotspotsLoading) {
    refresh.addEventListener('click', () => void handlers.refreshHotspots());
  }

  const archive = toolbar.createEl('button', {
    cls: 'curiosity-discover-archive', text: t.t('discover.archive'), type: 'button',
  });
  archive.addEventListener('click', () => void handlers.archiveHotspots());

  const fetchedAt = newestFetchedAt(model.hotspots);
  if (fetchedAt > 0) {
    section.createEl('p', {
      cls: 'curiosity-discover-stale',
      attr: { role: 'status' },
      text: t.t('discover.staleAt', { time: formatHotspotTime(fetchedAt) }),
    });
  }

  // 缺少「发现」选题模板（spark-topics）时直接在此提供一键补齐，避免用户被引到无按钮的工作流 tab。
  if (!model.workflowActions.some((action) => action.id === 'spark-topics')) {
    const banner = section.createDiv({
      cls: 'curiosity-discover-template-missing', attr: { role: 'status' },
    });
    banner.createSpan({ text: t.t('discover.templateMissing') });
    const seed = banner.createEl('button', {
      cls: 'curiosity-write-action curiosity-discover-seed',
      text: t.t('discover.seedTemplate'), type: 'button',
    });
    seed.addEventListener('click', () => void handlers.seedPromptTemplates());
  }

  renderPendingTopics(section, model, handlers, t);

  const grid = section.createDiv({ cls: 'curiosity-discover-grid' });
  // 翻页会重建当前页 DOM，故热点选择用 Map 跨页保留（按 url/标题去重）。
  const selectedHotspots = new Map<string, Hotspot>();
  const signalChecks: Array<{ item: AudienceSignal; input: HTMLInputElement }> = [];

  renderHotspotColumn(grid, model.hotspots, selectedHotspots, handlers, t);
  renderSignalColumn(grid, model.audienceSignals, signalChecks, t);

  const actions = section.createDiv({ cls: 'curiosity-discover-actions' });
  actions.createEl('p', { cls: 'curiosity-discover-hint', text: t.t('discover.selectHint') });
  const copy = actions.createEl('button', {
    cls: 'curiosity-write-action curiosity-discover-copy',
    text: t.t('discover.copyButton'), type: 'button',
  });
  copy.addEventListener('click', () => {
    const hotspots = [...selectedHotspots.values()];
    const signals = selected(signalChecks);
    void handlers.copyDiscoveryPrompt(hotspots, signals);
  });
}

// 待评估区：列出无阶段（尚未进入流水线）的选题，提供「立项」一键升入流水线并设为当前作品。
// 这些卡此前在面板里没有入口，切换作品选择器也已把它们过滤掉（切过去会落「未知阶段」）。
function renderPendingTopics(
  parent: HTMLElement,
  model: DashboardModel,
  handlers: DashboardHandlers,
  t: Translator,
): void {
  const pending = model.pickableTopics
    .filter((topic) => topic.stage === null)
    .sort((left, right) => right.issue - left.issue);
  if (pending.length === 0) return;

  const box = parent.createDiv({ cls: 'curiosity-discover-pending' });
  box.createEl('h3', { text: t.t('discover.pendingTitle', { count: String(pending.length) }) });
  const list = box.createEl('ul', { cls: 'curiosity-pending-list' });
  for (const topic of pending) {
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
}

function renderHotspotColumn(
  grid: HTMLElement,
  results: HotspotSourceResult[],
  selectedHotspots: Map<string, Hotspot>,
  handlers: DashboardHandlers,
  t: Translator,
): void {
  const col = grid.createDiv({ cls: 'curiosity-discover-col curiosity-discover-hotspots' });
  col.createEl('h3', { text: t.t('discover.hotspotsHeading') });

  for (const result of results) {
    if (result.status === 'failed') {
      col.createEl('p', {
        cls: 'curiosity-discover-source-failed', attr: { role: 'status' },
        text: t.t('discover.sourceFailed', { label: result.label }),
      });
    }
  }

  const items = results.flatMap((result) => result.items);
  if (items.length === 0) {
    col.createEl('p', { cls: 'curiosity-discover-empty', text: t.t('discover.empty') });
    return;
  }

  // 按来源分类过滤：点某个分类 = 单独聚焦它（其余隐藏）；再点同一个 = 恢复全部。
  const sources = [...new Set(items.map((item) => item.source))];
  let focus: string | null = null; // null = 显示全部
  const list = col.createDiv({ cls: 'curiosity-discover-list' });
  const pager = col.createDiv({ cls: 'curiosity-discover-pager' });
  let page = 0;

  const renderPage = (): void => {
    const filtered = focus === null ? items : items.filter((item) => item.source === focus);
    const totalPages = Math.max(1, Math.ceil(filtered.length / HOTSPOT_PAGE_SIZE));
    if (page >= totalPages) page = totalPages - 1;
    list.empty();
    const start = page * HOTSPOT_PAGE_SIZE;
    for (const item of filtered.slice(start, start + HOTSPOT_PAGE_SIZE)) {
      renderHotspotRow(list, item, selectedHotspots, handlers);
    }
    renderPager(pager, page, totalPages, filtered.length, t, (next) => {
      page = next;
      renderPage();
    });
  };

  const filters = col.createDiv({ cls: 'curiosity-discover-filters' });
  const updateChips = (): void => {
    for (const chip of chips) {
      const isFocus = chip.dataset.source === focus;
      if (isFocus) chip.addClass('is-focus'); else chip.removeClass('is-focus');
      if (focus !== null && !isFocus) chip.addClass('is-dim'); else chip.removeClass('is-dim');
    }
  };

  // 「全部」chip：聚焦状态时点它恢复显示全部。
  const chips: HTMLElement[] = [];
  const allChip = filters.createEl('button', {
    cls: 'curiosity-discover-filter-chip curiosity-discover-filter-all',
    text: t.t('discover.filterAll'), type: 'button',
  });
  allChip.dataset.source = '';
  chips.push(allChip);
  allChip.addEventListener('click', () => {
    focus = null;
    updateChips();
    page = 0;
    renderPage();
  });

  for (const source of sources) {
    const chip = filters.createEl('button', {
      cls: 'curiosity-discover-filter-chip', text: source, type: 'button',
    });
    chip.dataset.source = source;
    tintBySource(chip, source);
    chips.push(chip);
    chip.addEventListener('click', () => {
      // 已聚焦同一项 → 取消（回全部）；否则聚焦该项（其余自动隐藏）。
      focus = focus === source ? null : source;
      updateChips();
      page = 0;
      renderPage();
    });
  }

  renderPage();
}

function renderHotspotRow(
  list: HTMLElement,
  item: Hotspot,
  selectedHotspots: Map<string, Hotspot>,
  handlers: DashboardHandlers,
): void {
  const key = hotspotKey(item);
  const row = list.createDiv({ cls: 'curiosity-discover-row' });
  const input = row.createEl('input', {
    cls: 'curiosity-discover-check', attr: { type: 'checkbox', 'aria-label': item.title },
  });
  input.checked = selectedHotspots.has(key);
  input.addEventListener('change', () => {
    if (input.checked) selectedHotspots.set(key, item);
    else selectedHotspots.delete(key);
  });

  const body = row.createDiv({ cls: 'curiosity-discover-body' });
  if (item.url.trim().length > 0) {
    const link = body.createEl('a', {
      cls: 'curiosity-discover-text curiosity-discover-link',
      text: item.title,
      attr: { role: 'link', tabindex: '0', 'aria-label': item.title },
    });
    link.addEventListener('click', (event) => {
      event.preventDefault();
      handlers.openHotspot(item.url);
    });
  } else {
    body.createSpan({ cls: 'curiosity-discover-text', text: item.title });
  }

  const meta = body.createDiv({ cls: 'curiosity-discover-meta' });
  const tag = meta.createSpan({ cls: 'curiosity-discover-source-tag', text: item.source });
  tintBySource(tag, item.source);
  if (item.publishedAt !== null) {
    meta.createSpan({ cls: 'curiosity-discover-date', text: item.publishedAt });
  }
}

function renderPager(
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

function renderSignalColumn(
  grid: HTMLElement,
  signals: AudienceSignal[],
  checks: Array<{ item: AudienceSignal; input: HTMLInputElement }>,
  t: Translator,
): void {
  const col = grid.createDiv({ cls: 'curiosity-discover-col curiosity-discover-signals' });
  col.createEl('h3', { text: t.t('discover.signalsHeading') });

  if (signals.length === 0) {
    col.createEl('p', { cls: 'curiosity-discover-empty', text: t.t('discover.signalsEmpty') });
    return;
  }

  const sorted = [...signals].sort((a, b) => b.weight - a.weight);
  const list = col.createDiv({ cls: 'curiosity-discover-list' });
  for (const item of sorted) {
    const row = list.createDiv({ cls: 'curiosity-discover-row' });
    const input = row.createEl('input', {
      cls: 'curiosity-discover-check', attr: { type: 'checkbox', 'aria-label': item.text },
    });
    checks.push({ item, input });
    const body = row.createDiv({ cls: 'curiosity-discover-body' });
    body.createSpan({ cls: 'curiosity-discover-text', text: item.text });
    body.createSpan({ cls: 'curiosity-discover-kind', text: `${item.kind} · ${item.source}` });
  }
}

function selected<T>(checks: Array<{ item: T; input: HTMLInputElement }>): T[] {
  return checks.filter((c) => c.input.checked).map((c) => c.item);
}

// 由来源名稳定散列出色相，给分类标签/过滤 chip 上不同底色以便区分。
function sourceHue(source: string): number {
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) % 360;
  }
  return hash;
}

function tintBySource(element: HTMLElement, source: string): void {
  const hue = sourceHue(source);
  element.style.setProperty('background', `hsla(${hue}, 70%, 50%, 0.22)`);
  element.style.setProperty('border-color', `hsla(${hue}, 70%, 60%, 0.45)`);
  element.style.setProperty('color', `hsl(${hue}, 80%, 80%)`);
}

// 选择去重键：优先 url（小写去空白），无 url 时退回标题。
function hotspotKey(item: Hotspot): string {
  const url = item.url.trim();
  return url.length > 0 ? url.toLowerCase() : item.title.trim().toLowerCase();
}

// 取所有来源里最新的抓取时间戳（毫秒），无任何已抓取记录时返回 0。
function newestFetchedAt(results: HotspotSourceResult[]): number {
  return results.reduce((max, result) => Math.max(max, result.fetchedAt), 0);
}

// 把毫秒时间戳格式化为「MM-DD HH:mm」用于「数据时间」展示。
function formatHotspotTime(ms: number): string {
  const date = new Date(ms);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${min}`;
}
