import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { t } from '../i18n/translate';

export const TRIAL_STARTED_KEY = 'app.trial.startedAt.v1';
/** 설치(첫 사용) 후 무료 이용 기간 (6개월) */
export const TRIAL_DURATION_DAYS = 182;
export const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

export const TRIAL_LOCKED_TITLE = '무료 이용 기간 종료';
export const TRIAL_LOCKED_MESSAGE =
  '설치 후 6개월이 지나 열람만 가능합니다. 수정·삭제는 할 수 없습니다.';

export async function ensureTrialStartedAt(): Promise<string> {
  const existing = await AsyncStorage.getItem(TRIAL_STARTED_KEY);
  if (existing && Number.isFinite(Date.parse(existing))) return existing;
  const startedAt = new Date().toISOString();
  await AsyncStorage.setItem(TRIAL_STARTED_KEY, startedAt);
  return startedAt;
}

export function isTrialExpired(startedAtIso: string, nowMs: number = Date.now()): boolean {
  const started = Date.parse(startedAtIso);
  if (!Number.isFinite(started)) return false;
  return nowMs - started >= TRIAL_DURATION_MS;
}

export function notifyTrialLocked(): void {
  Alert.alert(t('trial.title'), t('trial.message'));
}
