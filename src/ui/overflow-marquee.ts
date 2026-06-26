/**
 * 文字溢出时启用横向跑马灯：测量 track 裁剪窗口与 label 实宽，
 * 溢出则写入位移变量并加 is-overflow 触发 CSS 动画看全；
 * 无布局度量的测试桩（clientWidth/scrollWidth 非 number）安全跳过。
 *
 * track 为 content-box 裁剪窗口（padding 留在外层按钮上不参与裁剪），
 * 文字在 track 内被裁断，左右 padding 始终保持留白。
 */
export function enableOverflowMarquee(track: HTMLElement, label: HTMLElement): void {
  const apply = (): void => {
    const trackWidth = track.clientWidth;
    const labelWidth = label.scrollWidth;
    if (typeof trackWidth !== 'number' || typeof labelWidth !== 'number') return;
    if (labelWidth <= trackWidth + 1) return;
    label.style.setProperty('--curiosity-chip-shift', `${trackWidth - labelWidth}px`);
    label.addClass('is-overflow');
  };
  apply();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply);
}
