import { describe, expect, it } from 'vitest';

import { resolveLocale } from '@/i18n/locale';

describe('resolveLocale', () => {
  it('returns the explicit locale when not auto', () => {
    expect(resolveLocale('zh', 'en')).toBe('zh');
    expect(resolveLocale('en', 'zh')).toBe('en');
  });

  it('auto follows a Chinese Obsidian language', () => {
    expect(resolveLocale('auto', 'zh')).toBe('zh');
    expect(resolveLocale('auto', 'zh-TW')).toBe('zh');
    expect(resolveLocale('auto', 'zh-CN')).toBe('zh');
  });

  it('auto falls back to English for non-Chinese or missing language', () => {
    expect(resolveLocale('auto', 'en')).toBe('en');
    expect(resolveLocale('auto', 'fr')).toBe('en');
    expect(resolveLocale('auto', '')).toBe('en');
    expect(resolveLocale('auto', null)).toBe('en');
  });
});
