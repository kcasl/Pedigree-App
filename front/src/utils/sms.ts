import { Alert, Linking, Platform } from 'react-native';
import { t } from '../i18n/translate';

export function buildSmsUrl(phones: string[], body?: string): string {
  const numbers = phones
    .map(phone => phone.replace(/\D/g, ''))
    .filter(Boolean)
    .join(',');

  if (!numbers) return '';

  const encodedBody = body?.trim() ? encodeURIComponent(body.trim()) : '';
  if (Platform.OS === 'ios') {
    return encodedBody ? `sms:${numbers}&body=${encodedBody}` : `sms:${numbers}`;
  }
  return encodedBody ? `sms:${numbers}?body=${encodedBody}` : `sms:${numbers}`;
}

export async function openSmsComposer(phones: string[], body?: string): Promise<boolean> {
  const url = buildSmsUrl(phones, body);
  if (!url) {
    Alert.alert(t('sms.noContactTitle'), t('sms.noSelection'));
    return false;
  }

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert(t('sms.appFailTitle'), t('sms.appFailNoApp'));
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert(t('sms.appFailTitle'), t('sms.appFailError'));
    return false;
  }
}
