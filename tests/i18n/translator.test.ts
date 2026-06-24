import { describe, expect, it } from 'vitest';

import { createTranslator } from '@/i18n/translator';

describe('createTranslator', () => {
  it('resolves static keys per locale', () => {
    expect(createTranslator('zh').t('mission.advance')).toBe('推进阶段');
    expect(createTranslator('en').t('mission.advance')).toBe('Advance stage');
  });

  it('interpolates {tokens} from params', () => {
    expect(createTranslator('en').t('overflow.items', { count: 3 })).toBe('3 more');
    expect(createTranslator('zh').t('overflow.items', { count: 3 })).toBe('另有 3 项');
    expect(createTranslator('en').t('common.labelPath', { label: 'Script', path: 'a/b.md' }))
      .toBe('Script: a/b.md');
  });

  it('maps stage labels and exposes the locale', () => {
    const en = createTranslator('en');
    expect(en.locale).toBe('en');
    expect(en.stageLabel('复盘')).toBe('Review');
    expect(createTranslator('zh').stageLabel('复盘')).toBe('复盘');
  });
});
