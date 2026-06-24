import type { Stage } from '@/domain/stages';

import type { Locale } from './locale';
import { STAGE_LABELS, TRANSLATIONS, type TranslationKey } from './translations';

export type TranslationParams = Record<string, string | number>;

export interface Translator {
  readonly locale: Locale;
  t(key: TranslationKey, params?: TranslationParams): string;
  stageLabel(stage: Stage): string;
}

export function createTranslator(locale: Locale): Translator {
  return {
    locale,
    t(key, params) {
      const template = TRANSLATIONS[key][locale];
      if (params === undefined) return template;
      return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match);
    },
    stageLabel(stage) {
      return STAGE_LABELS[locale][stage];
    },
  };
}
