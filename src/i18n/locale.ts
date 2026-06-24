export type Locale = 'zh' | 'en';
export type LanguageSetting = 'auto' | 'zh' | 'en';

export function resolveLocale(
  setting: LanguageSetting,
  obsidianLang: string | null,
): Locale {
  if (setting !== 'auto') return setting;
  return typeof obsidianLang === 'string' && obsidianLang.toLowerCase().startsWith('zh')
    ? 'zh'
    : 'en';
}
