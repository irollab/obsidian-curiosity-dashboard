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
    expect(css).toMatch(/\.curiosity-dashboard \.curiosity-window[^}]*background:\s*var\(--curiosity-panel\)/s);
  });

  it('contains responsive, focus, hidden-panel, accessibility, and fallback contracts', async () => {
    const css = await stylesheet();
    expect(css).toContain('@media (max-width: 1279px)');
    expect(css).toContain('@media (max-width: 700px)');
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
});
