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
  ready: boolean;
  needsLocalePick: boolean;
  locale: Locale;
  setLocale: (next: Locale) => Promise<void>;
  previewLocale: (next: Locale) => void;
  confirmLocale: (next: Locale) => Promise<void>;
  t: (key: MessageKey, vars?: MessageVars) => string;
  displayKinship: (text: string | undefined) => string;
  displayOrdinal: (label: string | undefined) => string;
  displayViewLabels: (joined: string) => string;
  formatBirthLabel: (month: number, day: number) => string;
  formatDaysUntilLabel: (daysUntil: number) => string;
};

const defaultT = (key: MessageKey, vars?: MessageVars) =>
  translateMessage(key, vars, DEFAULT_LOCALE);

const I18nContext = createContext<I18nValue>({
  ready: false,
  needsLocalePick: false,
  locale: DEFAULT_LOCALE,
  setLocale: async () => {},
  previewLocale: () => {},
  confirmLocale: async () => {},
  t: defaultT,
  displayKinship: text => displayKinship(text, DEFAULT_LOCALE),
  displayOrdinal: label => displayOrdinal(label, DEFAULT_LOCALE),
  displayViewLabels: joined => displayViewLabels(joined, DEFAULT_LOCALE),
  formatBirthLabel: (month, day) => formatBirthLabel(month, day, DEFAULT_LOCALE),
  formatDaysUntilLabel: days => formatDaysUntilLabel(days, DEFAULT_LOCALE),
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);
  const [needsLocalePick, setNeedsLocalePick] = useState(false);

  useEffect(() => {
    let mounted = true;
    void loadAppPrefs()
      .then(prefs => {
        if (!mounted) return;
        const mustPick = !prefs.localeChosen;
        setNeedsLocalePick(mustPick);
        // 첫 실행 선택 화면은 영어 안내. 확정 전에는 한국어 기본값을 씌우지 않는다.
        const nextLocale = mustPick ? 'en' : prefs.locale;
        setActiveLocale(nextLocale);
        setLocaleState(nextLocale);
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const persistLocale = useCallback(async (next: Locale, chosen: boolean) => {
    setActiveLocale(next);
    setLocaleState(next);
    const prefs = await loadAppPrefs();
    await saveAppPrefs({ ...prefs, locale: next, localeChosen: chosen || prefs.localeChosen });
  }, []);

  const setLocale = useCallback(
    async (next: Locale) => {
      await persistLocale(next, true);
    },
    [persistLocale],
  );

  const previewLocale = useCallback((next: Locale) => {
    setActiveLocale(next);
    setLocaleState(next);
  }, []);

  const confirmLocale = useCallback(
    async (next: Locale) => {
      await persistLocale(next, true);
      setNeedsLocalePick(false);
    },
    [persistLocale],
  );

  const value = useMemo<I18nValue>(
    () => ({
      ready,
      needsLocalePick,
      locale,
      setLocale,
      previewLocale,
      confirmLocale,
      t: (key, vars) => translateMessage(key, vars, locale),
      displayKinship: text => displayKinship(text, locale),
      displayOrdinal: label => displayOrdinal(label, locale),
      displayViewLabels: joined => displayViewLabels(joined, locale),
      formatBirthLabel: (month, day) => formatBirthLabel(month, day, locale),
      formatDaysUntilLabel: days => formatDaysUntilLabel(days, locale),
    }),
    [ready, needsLocalePick, locale, setLocale, previewLocale, confirmLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
