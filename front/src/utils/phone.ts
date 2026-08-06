import { Alert, Linking } from 'react-native';

export function normalizePhoneDigits(phone?: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

export function formatPhoneDisplay(phone?: string): string {
  if (!phone) return '';
  const digits = normalizePhoneDigits(phone);
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export async function openPhoneDialer(phone?: string): Promise<boolean> {
  const digits = normalizePhoneDigits(phone);
  if (!digits) {
    Alert.alert('연락처 없음', '전화번호가 등록되어 있지 않습니다.');
    return false;
  }

  const url = `tel:${digits}`;
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('전화 연결 실패', '기기에서 전화 앱을 열 수 없습니다.');
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert('전화 연결 실패', '전화 앱을 여는 중 오류가 발생했습니다.');
    return false;
  }
}
