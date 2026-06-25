import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const REQUIRED_TOKENS = {
  '--curiosity-bg': '#05060d',
  '--curiosity-panel': '#10121f',
  '--curiosity-panel-2': '#181b28',
  '--curiosity-line': '#303447',
  '--curiosity-text': '#f7f8ff',
  '--curiosity-blue': '#0a84ff',
  '--curiosity-cyan': '#00e5ff',
  '--curiosity-green': '#30d158',
  '--curiosity-purple': '#bf5af2',
  '--curiosity-pink': '#ff375f',
  '--curiosity-orange': '#ff9f0a',
} as const;

async function stylesheet(): Promise<string> {
  return (await readFile(new URL('../styles.css', import.meta.url), 'utf8')).toLowerCase();
}

function blockAfter(css: string, marker: string): string {
  const markerIndex = css.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing CSS marker: ${marker}`);
  const markerOpen = marker.indexOf('{');
  const open = markerOpen >= 0
    ? markerIndex + markerOpen
    : css.indexOf('{', markerIndex + marker.length);
  if (open < 0) throw new Error(`Missing CSS block: ${marker}`);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return css.slice(open + 1, index);
  }
  throw new Error(`Unclosed CSS block: ${marker}`);
}

function hexLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = hexLuminance(first);
  const secondLuminance = hexLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function solidColors(block: string): { background: string; foreground: string } {
  const background = block.match(/background:\s*(#[0-9a-f]{6})\s*;/)?.[1];
  const foreground = block.match(/(?:^|\n)\s*color:\s*(#[0-9a-f]{6})\s*;/)?.[1];
  if (background === undefined || foreground === undefined) {
    throw new Error(`Expected solid background and foreground colors in: ${block}`);
  }
  return { background, foreground };
}

describe('dashboard stylesheet contract', () => {
  it('defines the approved exact palette on the dashboard root', async () => {
    const css = await stylesheet();
    expect(css).toMatch(/\.curiosity-dashboard\s*\{/);
    for (const [token, value] of Object.entries(REQUIRED_TOKENS)) {
      expect(css).toContain(`${token}: ${value}`);
    }
  });

  it('keeps component selectors scoped to the dashboard or its own modal roots', async () => {
    const css = await stylesheet();
    const selectorBlocks = css.matchAll(/(^|\})\s*([^@{}][^{}]*)\{/gm);
    for (const [, , selectorText] of selectorBlocks) {
      for (const selector of selectorText!.split(',')) {
        const normalized = selector.trim();
        if (
          normalized.startsWith('@') ||
          normalized === 'from' ||
          normalized === 'to' ||
          /^\d+%$/.test(normalized)
        ) continue;
        expect(normalized).toMatch(/^\.(curiosity-dashboard|curiosity-modal)/);
      }
    }
  });

  it('uses neutral surfaces without colored gradients or colored glow', async () => {
    const css = await stylesheet();
    expect(css).not.toMatch(/\.curiosity-(window|section|subcard|queue-card)[^{]*\{[^}]*gradient\(/s);
    expect(css).not.toMatch(/box-shadow\s*:[^;]*(#0a84ff|#00e5ff|#30d158|#bf5af2|#ff375f|#ff9f0a)/);
    expect(css).toMatch(/\.curiosity-dashboard \.curiosity-window[^}]*background:\s*transparent/s);
  });

  it('contains responsive, focus, hidden-panel, accessibility, and fallback contracts', async () => {
    const css = await stylesheet();
    expect(blockAfter(css, '.curiosity-dashboard')).toContain('container-type: inline-size');
    expect(css).toContain('@container curiosity-dashboard (max-width: 1279px)');
    expect(css).toContain('@container curiosity-dashboard (max-width: 900px)');
    expect(css).toContain('@container curiosity-dashboard (max-width: 700px)');
    expect(css).not.toContain('@media (max-width: 1279px)');
    expect(css).not.toContain('@media (max-width: 900px)');
    expect(blockAfter(css, '@media (max-width: 700px)')).not.toContain('.curiosity-dashboard');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('@media (prefers-contrast: more)');
    expect(css).toMatch(/:focus-visible/);
    expect(css).toMatch(/\.curiosity-dashboard \.curiosity-tab-panel\[hidden\]\s*\{\s*display:\s*none/s);
    expect(css).toMatch(/@supports not \(backdrop-filter: blur\(1px\)\)/);
  });

  it('keeps disabled mobile write actions visible and makes only tables and dock scrollable', async () => {
    const css = await stylesheet();
    expect(css).not.toMatch(/\.curiosity-write-action[^}]*display:\s*none/s);
    expect(css).toMatch(/\.curiosity-dashboard \.curiosity-write-action:disabled/);
    expect(css).toMatch(/\.curiosity-dashboard \.curiosity-table-wrapper[^}]*overflow-x:\s*auto/s);
    expect(css).toMatch(/\.curiosity-dashboard \.curiosity-dock[^}]*overflow-x:\s*auto/s);
  });

  it('contains the dock inside the dashboard leaf and stacks the queue below 1280px', async () => {
    const css = await stylesheet();
    const dock = blockAfter(css, '.curiosity-dashboard .curiosity-dock');
    expect(dock).toContain('position: sticky');
    expect(dock).toContain('max-width: 100%');
    expect(dock).not.toMatch(/position:\s*fixed|left:\s*50%|100vw|transform:\s*translate/);
    expect(css).not.toContain('100vw');

    const desktopNarrow = blockAfter(css, '@container curiosity-dashboard (max-width: 1279px)');
    expect(blockAfter(desktopNarrow, '.curiosity-dashboard .curiosity-queue-grid'))
      .toContain('grid-template-columns: minmax(0, 1fr)');
  });

  it('keeps saturated primary and current-stage controls above 4.5:1 contrast', async () => {
    const css = await stylesheet();
    for (const selector of [
      '.curiosity-dashboard .curiosity-primary',
      '.curiosity-dashboard .curiosity-primary:hover:not(:disabled)',
      '.curiosity-dashboard .curiosity-stage-track li.is-current',
    ]) {
      const { background, foreground } = solidColors(blockAfter(css, selector));
      expect(contrastRatio(background, foreground), selector).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('allows plugin modals to scroll vertically without leaking horizontally', async () => {
    const css = await stylesheet();
    const modal = blockAfter(css, '\n.curiosity-modal {');
    expect(modal).toContain('overflow-x: hidden');
    expect(modal).toContain('overflow-y: auto');
    expect(modal).toContain('max-height: min(86vh, 720px)');
    expect(modal).toContain('overscroll-behavior: contain');
  });

  it('lays out the tasks panel full-width by resetting inherited grid placement', async () => {
    const css = await stylesheet();
    expect(blockAfter(css, '.curiosity-tab-panel--tasks {'))
      .toContain('grid-template-columns: minmax(0, 1fr)');
    // Higher-specificity, order-independent reset of the overview grid-area names
    // that .curiosity-mission / .curiosity-this-week carry globally.
    const reset = blockAfter(css, '.curiosity-tab-panel--tasks > .curiosity-mission');
    expect(reset).toContain('grid-area: auto');
    expect(css).toContain('.curiosity-tab-panel--tasks > .curiosity-this-week');
  });

  it('loads Smiley Sans as a local offline display webfont with safe fallback', async () => {
    const css = await stylesheet();
    const face = blockAfter(css, '@font-face');
    expect(face).toContain('font-family: "smiley sans"');
    expect(face).toMatch(/src:\s*url\(["']?fonts\/smileysans-oblique\.woff2["']?\)/);
    expect(face).not.toContain('http://');
    expect(face).not.toContain('https://');
    expect(face).toContain('font-display: swap');
    expect(css).toMatch(/--curiosity-display-font:\s*"smiley sans",[^;]*georgia[^;]*songti sc[^;]*serif/);
  });

  it('styles the workflow deck cards, groups, and empty state inside the dashboard scope', async () => {
    const css = await stylesheet();
    const workflowCard = blockAfter(css, '.curiosity-dashboard .curiosity-workflow-card {');
    // 内容卡统一为半透明叠加层（与任务中心 subcard 一致）
    expect(workflowCard).toContain('background: var(--curiosity-glass-card-bg)');
    // 容器（window/section/tab）保持磨砂玻璃：::before + 固定背景图
    expect(css).toContain('background-attachment: fixed');
    // 分组改为胶囊分段控制器
    expect(blockAfter(css, '.curiosity-dashboard .curiosity-segmented'))
      .toContain('border-radius: 999px');
    expect(blockAfter(css, '.curiosity-dashboard .curiosity-segment.is-active'))
      .toContain('background: var(--curiosity-green)');
    expect(css).toContain('.curiosity-dashboard .curiosity-workflow-skipped');
    expect(blockAfter(css, '.curiosity-dashboard .curiosity-workflow-empty'))
      .toContain('text-align: center');
  });

  it('applies the display font only to display selectors and keeps body/code stacks', async () => {
    const css = await stylesheet();
    for (const selector of [
      '.curiosity-dashboard .curiosity-hero-title',
      '.curiosity-dashboard .curiosity-current-title',
      '.curiosity-dashboard .curiosity-window-title',
      '.curiosity-dashboard .curiosity-issue-pill',
      '.curiosity-modal .curiosity-modal-content h2',
    ]) {
      expect(blockAfter(css, selector)).toContain('var(--curiosity-display-font)');
    }
    expect(css).toContain('font-family: -apple-system, blinkmacsystemfont, "segoe ui", sans-serif');
    expect(css).toContain('font-family: ui-monospace, "sfmono-regular", consolas, monospace');
    expect(blockAfter(css, '.curiosity-dashboard .curiosity-table-wrapper table'))
      .not.toContain('var(--curiosity-display-font)');
  });
});
