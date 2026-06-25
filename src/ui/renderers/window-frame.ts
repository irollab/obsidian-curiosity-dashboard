import type { DashboardModel } from '@/domain/models';
import type { Translator } from '@/i18n/translator';

// 共享的 macOS 窗口标题栏：红黄绿灯 + 居中标题。
// 任务中心与各内容区 section 统一调用，保持一致的窗口外壳风格。
export function renderWindowTitlebar(
  parent: HTMLElement,
  title: string,
  options: { titleId?: string; meta?: string } = {},
): void {
  const bar = parent.createDiv({ cls: 'curiosity-titlebar' });
  const dots = bar.createDiv({
    cls: 'curiosity-traffic-lights',
    attr: { 'aria-hidden': 'true' },
  });
  for (const color of ['red', 'yellow', 'green']) {
    dots.createSpan({ cls: `curiosity-dot is-${color}` });
  }
  const titleEl = bar.createEl('h2', { cls: 'curiosity-window-title', text: title });
  if (options.titleId !== undefined) titleEl.setAttr('id', options.titleId);
  if (options.meta !== undefined) {
    bar.createSpan({ cls: 'curiosity-window-issue', text: options.meta });
  }
}

// 焦点选题（ready/invalid-stage）的标题栏元数据；无焦点时返回空对象，标题栏不渲染期数。
// 各 section 标题栏统一复用，避免每个 renderer 重复实现取焦点选题的逻辑。
export function focusMeta(model: DashboardModel, t: Translator): { meta?: string } {
  const focus = model.focus;
  const topic = focus.kind === 'ready' || focus.kind === 'invalid-stage' ? focus.topic : null;
  return topic === null
    ? {}
    : { meta: t.t('mission.issue', { issue: topic.issue, title: topic.title }) };
}
