import { Alert, Linking } from 'react-native';
import { t } from '../i18n/translate';

export function normalizePhoneDigits(phone?: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/** 010-XXXX-XXXX 처럼 가운데 하이픈을 넣어 보여 준다. */
export function formatPhoneDisplay(phone?: string): string {
  if (!phone) return '';
  const digits = normalizePhoneDigits(phone);
  if (!digits) return '';

  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    }
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }

  if (digits.startsWith('01')) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  }

  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

export async function openPhoneDialer(phone?: string): Promise<boolean> {
  const digits = normalizePhoneDigits(phone);
  if (!digits) {
    Alert.alert(t('phone.noContactTitle'), t('phone.noPhone'));
    return false;
  }

  const url = `tel:${digits}`;
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert(t('phone.dialFailTitle'), t('phone.dialFailNoApp'));
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert(t('phone.dialFailTitle'), t('phone.dialFailError'));
    return false;
  }
}
