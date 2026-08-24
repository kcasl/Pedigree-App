import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadAppPrefs, saveAppPrefs } from '../storage/appPrefs';
import {
  displayKinship,
  displayOrdinal,
  displayViewLabels,
  formatBirthLabel,
  formatDaysUntilLabel,
  setActiveLocale,
  t as translateMessage,
  type MessageKey,
  type MessageVars,
} from './translate';
import { DEFAULT_LOCALE, type Locale } from './types';

type I18nValue = {
  locale: Locale;
  setLocale: (next: Locale) => Promise<void>;
  t: (key: MessageKey, vars?: MessageVars) => string;
  displayKinship: (text: string | undefined) => string;
  displayOrdinal: (label: string | undefined) => string;
  displayViewLabels: (joined: string) => string;
  formatBirthLabel: (month: number, day: number) => string;
  formatDaysUntilLabel: (daysUntil: number) => string;
};

const I18nContext = createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  setLocale: async () => {},
  t: (key, vars) => translateMessage(key, vars, DEFAULT_LOCALE),
  displayKinship: text => displayKinship(text, DEFAULT_LOCALE),
  displayOrdinal: label => displayOrdinal(label, DEFAULT_LOCALE),
  displayViewLabels: joined => displayViewLabels(joined, DEFAULT_LOCALE),
  formatBirthLabel: (month, day) => formatBirthLabel(month, day, DEFAULT_LOCALE),
  formatDaysUntilLabel: days => formatDaysUntilLabel(days, DEFAULT_LOCALE),
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    let mounted = true;
    void loadAppPrefs().then(prefs => {
      if (!mounted) return;
      setActiveLocale(prefs.locale);
      setLocaleState(prefs.locale);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setActiveLocale(next);
    setLocaleState(next);
    const prefs = await loadAppPrefs();
    await saveAppPrefs({ ...prefs, locale: next });
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translateMessage(key, vars, locale),
      displayKinship: text => displayKinship(text, locale),
      displayOrdinal: label => displayOrdinal(label, locale),
      displayViewLabels: joined => displayViewLabels(joined, locale),
      formatBirthLabel: (month, day) => formatBirthLabel(month, day, locale),
      formatDaysUntilLabel: days => formatDaysUntilLabel(days, locale),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
