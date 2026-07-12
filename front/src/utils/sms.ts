import { Alert, Linking, Platform } from 'react-native';

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
    Alert.alert('연락처 없음', '문자를 보낼 연락처를 선택해 주세요.');
    return false;
  }

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('문자 앱 열기 실패', '기기에서 문자 앱을 열 수 없습니다.');
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert('문자 앱 열기 실패', '문자 앱을 여는 중 오류가 발생했습니다.');
    return false;
  }
}
