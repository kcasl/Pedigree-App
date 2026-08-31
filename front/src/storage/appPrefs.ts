import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LOCALE, isLocale, type Locale } from '../i18n/types';

export const APP_PREFS_KEY = 'app.prefs.local.v1';

export type AppPrefs = {
  hideEmptyPeopleInSearch: boolean;
  showPhoneOnAnniversaries: boolean;
  locale: Locale;
  /** 첫 실행에서 언어를 고르면 true. 기존 설치는 저장본에 필드가 없어도 true로 본다. */
  localeChosen: boolean;
};

export const DEFAULT_APP_PREFS: AppPrefs = {
  hideEmptyPeopleInSearch: true,
  showPhoneOnAnniversaries: true,
  locale: DEFAULT_LOCALE,
  localeChosen: false,
};

function parsePrefs(raw: string | null): AppPrefs {
  if (!raw) return { ...DEFAULT_APP_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<AppPrefs>;
    return {
      hideEmptyPeopleInSearch:
        typeof parsed.hideEmptyPeopleInSearch === 'boolean'
          ? parsed.hideEmptyPeopleInSearch
          : DEFAULT_APP_PREFS.hideEmptyPeopleInSearch,
      showPhoneOnAnniversaries:
        typeof parsed.showPhoneOnAnniversaries === 'boolean'
          ? parsed.showPhoneOnAnniversaries
          : DEFAULT_APP_PREFS.showPhoneOnAnniversaries,
      locale: isLocale(parsed.locale) ? parsed.locale : DEFAULT_APP_PREFS.locale,
      localeChosen:
        typeof parsed.localeChosen === 'boolean' ? parsed.localeChosen : true,
    };
  } catch {
    return { ...DEFAULT_APP_PREFS };
  }
}

export async function loadAppPrefs(): Promise<AppPrefs> {
  try {
    return parsePrefs(await AsyncStorage.getItem(APP_PREFS_KEY));
  } catch {
    return { ...DEFAULT_APP_PREFS };
  }
}

export async function saveAppPrefs(prefs: AppPrefs): Promise<void> {
  await AsyncStorage.setItem(APP_PREFS_KEY, JSON.stringify(prefs));
}
