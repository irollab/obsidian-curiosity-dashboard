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
