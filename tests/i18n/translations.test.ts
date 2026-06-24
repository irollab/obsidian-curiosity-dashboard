import { describe, expect, it } from 'vitest';

import { STAGE_LABELS, TRANSLATIONS, type TranslationKey } from '@/i18n/translations';
import { STAGES } from '@/domain/stages';

describe('TRANSLATIONS catalog', () => {
  it('provides non-empty zh and en for every key', () => {
    for (const key of Object.keys(TRANSLATIONS) as TranslationKey[]) {
      expect(TRANSLATIONS[key].zh.length, `${key}.zh`).toBeGreaterThan(0);
      expect(TRANSLATIONS[key].en.length, `${key}.en`).toBeGreaterThan(0);
    }
  });

  it('maps every stage in both locales', () => {
    for (const stage of STAGES) {
      expect(STAGE_LABELS.zh[stage]).toBe(stage);
      expect(STAGE_LABELS.en[stage].length).toBeGreaterThan(0);
    }
  });
});
