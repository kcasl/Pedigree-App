import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import { t } from '../i18n/translate';

async function requestAndroidPermission(
  permission: string,
  rationaleTitle: string,
  rationaleMessage: string,
): Promise<boolean> {
  try {
    const already = await PermissionsAndroid.check(permission as any);
    if (already) return true;

    const res = await PermissionsAndroid.request(permission as any, {
      title: rationaleTitle,
      message: rationaleMessage,
      buttonPositive: t('permission.allow'),
      buttonNegative: t('permission.deny'),
    });

    if (res === PermissionsAndroid.RESULTS.GRANTED) return true;

    const neverAskAgain = res === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
    if (neverAskAgain) {
      Alert.alert(
        t('permission.neededTitle'),
        t('permission.neededBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('permission.openSettings'), onPress: () => Linking.openSettings() },
        ],
      );
    }
    return false;
  } catch {
    return false;
  }
}

export async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  return requestAndroidPermission(
    PermissionsAndroid.PERMISSIONS.CAMERA,
    t('permission.cameraTitle'),
    t('permission.cameraBody'),
  );
}

export async function ensurePhotoPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const version = typeof Platform.Version === 'number' ? Platform.Version : 0;
  if (version >= 33) {
    // Android 13+
    return requestAndroidPermission(
      'android.permission.READ_MEDIA_IMAGES',
      t('permission.photoTitle'),
      t('permission.photoBody'),
    );
  }

  // Android 12 이하
  return requestAndroidPermission(
    PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
    t('permission.storageTitle'),
    t('permission.storageBody'),
  );
}

