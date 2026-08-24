export const LOCALES = ['ko', 'en', 'ja', 'zh'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ko';

export const LOCALE_NATIVE_LABEL: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
  zh: '中文',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function collatorLocale(locale: Locale): string {
  return locale === 'zh' ? 'zh-CN' : locale;
}
