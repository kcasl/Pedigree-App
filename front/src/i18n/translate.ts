import { dictionaries, type MessageKey } from './messages';
import { translateKinship, translateJoinedViewLabels, translateOrdinal } from './kinship';
import { DEFAULT_LOCALE, type Locale } from './types';

export type MessageVars = Record<string, string | number>;

let activeLocale: Locale = DEFAULT_LOCALE;

export function getActiveLocale(): Locale {
  return activeLocale;
}

export function setActiveLocale(locale: Locale): void {
  activeLocale = locale;
}

export function interpolate(template: string, vars?: MessageVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = vars[key];
    return value == null ? `{${key}}` : String(value);
  });
}

export function translate(locale: Locale, key: MessageKey, vars?: MessageVars): string {
  const table = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
  const fallback = dictionaries[DEFAULT_LOCALE][key];
  const raw = table[key] ?? fallback ?? key;
  return interpolate(raw, vars);
}

export function t(key: MessageKey, vars?: MessageVars, locale: Locale = activeLocale): string {
  return translate(locale, key, vars);
}

export function displayKinship(text: string | undefined, locale: Locale = activeLocale): string {
  return translateKinship(text, locale);
}

export function displayOrdinal(label: string | undefined, locale: Locale = activeLocale): string {
  if (!label) return '';
  return translateOrdinal(label, locale);
}

export function displayViewLabels(joined: string, locale: Locale = activeLocale): string {
  return translateJoinedViewLabels(joined, locale, key => t(key as MessageKey, undefined, locale));
}

export function formatBirthLabel(month: number, day: number, locale: Locale = activeLocale): string {
  return t('anniversary.birthLabel', { month, day }, locale);
}

export function formatDaysUntilLabel(daysUntil: number, locale: Locale = activeLocale): string {
  if (daysUntil === 0) return t('anniversary.today', undefined, locale);
  if (daysUntil === 1) return t('anniversary.tomorrow', undefined, locale);
  return t('anniversary.inDays', { n: daysUntil }, locale);
}

export { translateKinship, translateOrdinal, translateJoinedViewLabels };
export type { MessageKey };
