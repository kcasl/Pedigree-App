import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  type CameraOptions,
  type ImageLibraryOptions,
} from 'react-native-image-picker';
import type { GenderType, Person } from '../types/pedigree';
import {
  isoToDateInput,
  nowIso,
  nowIsoFromNetwork,
  normalizeBirthDateInput,
  parseDateInputToIso,
} from '../utils/date';
import { createId } from '../utils/id';
import { formatPhoneDisplay } from '../utils/phone';
import { ensureCameraPermission, ensurePhotoPermission } from '../utils/permissions';
import { API_BASE_URL } from '../config/api';
import { ENABLE_SERVER_SYNC } from '../config/features';
import { ui } from '../theme/ui';
import { useScaledModalStyles } from '../theme/responsive';
import { useI18n } from '../i18n';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (person: Person) => void;
  auth?: { googleSub: string; accessToken?: string };
  /**
   * 수정 모드일 때 기존 값을 주입합니다.
   * - id는 유지, createdAt(등록일)은 폼에서 수정 가능
   */
  initialPerson?: Person;
  /** info: 연락처·비고 등 / photo: 사진만 / all: 전체 */
  section?: 'info' | 'photo' | 'all';
};

const imagePickerCommon: ImageLibraryOptions = {
  mediaType: 'photo',
  selectionLimit: 1,
  includeBase64: false,
  // 최신 타입 정의에서는 0~1 float 대신 enum/리터럴만 허용하는 경우가 있어 기본값(생략) 사용
};

const cameraOptions: CameraOptions = {
  ...imagePickerCommon,
  saveToPhotos: false,
  cameraType: 'back',
};

export function AddPersonModal({
  visible,
  title,
  onClose,
  onSubmit,
  initialPerson,
  auth,
  section = 'all',
}: Props) {
  const { t } = useI18n();
  const scaled = useScaledModalStyles();
  const [name, setName] = useState(initialPerson?.name ?? '');
  const [phone, setPhone] = useState(initialPerson?.phone ?? '');
  const [birthDate, setBirthDate] = useState(initialPerson?.birthDate ?? '');
  const [photoUri, setPhotoUri] = useState<string | undefined>(
    initialPerson?.photoUri,
  );
  const [note, setNote] = useState(initialPerson?.note ?? '');
  const [gender, setGender] = useState<GenderType>(initialPerson?.gender ?? 'unknown');
  const [registeredDate, setRegisteredDate] = useState('');
  const [networkCreatedAt, setNetworkCreatedAt] = useState<string | undefined>();

  const resolveCreatedAt = (): string | null => {
    const trimmed = registeredDate.trim();
    if (!trimmed) {
      return networkCreatedAt ?? initialPerson?.createdAt ?? nowIso();
    }
    const parsed = parseDateInputToIso(trimmed);
    if (!parsed) return null;
    if (
      !initialPerson &&
      networkCreatedAt &&
      isoToDateInput(networkCreatedAt) === trimmed
    ) {
      return networkCreatedAt;
    }
    return parsed;
  };

  // 모달을 "추가/수정"으로 번갈아 쓸 때 초기값이 바뀌면 폼도 동기화
  useEffect(() => {
    if (!visible) return;

    setName(initialPerson?.name ?? '');
    setPhone(formatPhoneDisplay(initialPerson?.phone));
    setBirthDate(initialPerson?.birthDate ?? '');
    setPhotoUri(initialPerson?.photoUri);
    setNote(initialPerson?.note ?? '');
    setGender(initialPerson?.gender ?? 'unknown');

    if (initialPerson) {
      setRegisteredDate(isoToDateInput(initialPerson.createdAt));
      setNetworkCreatedAt(undefined);
      return;
    }

    setRegisteredDate('');
    setNetworkCreatedAt(undefined);
    let cancelled = false;
    void nowIsoFromNetwork().then(iso => {
      if (cancelled) return;
      setNetworkCreatedAt(iso);
      setRegisteredDate(isoToDateInput(iso));
    });
    return () => {
      cancelled = true;
    };
  }, [visible, initialPerson?.id]);

  const canSave = useMemo(() => name.trim().length > 0, [name]);

  const reset = () => {
    setName(initialPerson?.name ?? '');
    setPhone(formatPhoneDisplay(initialPerson?.phone));
    setBirthDate(initialPerson?.birthDate ?? '');
    setPhotoUri(initialPerson?.photoUri);
    setNote(initialPerson?.note ?? '');
    setGender(initialPerson?.gender ?? 'unknown');
    setRegisteredDate(
      initialPerson ? isoToDateInput(initialPerson.createdAt) : '',
    );
    setNetworkCreatedAt(undefined);
  };

  const pickFromGallery = async () => {
    const ok = await ensurePhotoPermission();
    if (!ok) return;
    const res = await launchImageLibrary(imagePickerCommon);
    if (res.didCancel) return;
    if (res.errorCode) {
      Alert.alert(t('addPerson.photoFail'), res.errorMessage ?? res.errorCode);
      return;
    }
    const uri = res.assets?.[0]?.uri;
    if (uri) {
      if (ENABLE_SERVER_SYNC && auth?.googleSub && auth.accessToken) {
        const uploaded = await uploadPhotoToServer(uri, auth.googleSub, auth.accessToken);
        setPhotoUri(uploaded ?? uri);
      } else {
        setPhotoUri(uri);
      }
    }
  };

  const takePhoto = async () => {
    const ok = await ensureCameraPermission();
    if (!ok) return;
    const res = await launchCamera(cameraOptions);
    if (res.didCancel) return;
    if (res.errorCode) {
      Alert.alert(t('addPerson.cameraFail'), res.errorMessage ?? res.errorCode);
      return;
    }
    const uri = res.assets?.[0]?.uri;
    if (uri) {
      if (ENABLE_SERVER_SYNC && auth?.googleSub && auth.accessToken) {
        const uploaded = await uploadPhotoToServer(uri, auth.googleSub, auth.accessToken);
        setPhotoUri(uploaded ?? uri);
      } else {
        setPhotoUri(uri);
      }
    }
  };

  const uploadPhotoToServer = async (
    uri: string,
    googleSub: string,
    accessToken: string,
  ): Promise<string | null> => {
    try {
      const form = new FormData();
      form.append('file', {
        uri,
        name: `photo_${Date.now()}.jpg`,
        type: 'image/jpeg',
      } as unknown as Blob);

      const params = new URLSearchParams({ google_sub: googleSub });
      const previous =
        photoUri &&
        (photoUri.startsWith('http://') || photoUri.startsWith('https://')) &&
        photoUri.includes('/uploads/')
          ? photoUri
          : undefined;
      if (previous) params.set('previous_url', previous);

      const res = await fetch(`${API_BASE_URL}/v1/uploads/photo?${params.toString()}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { url?: string };
      return data.url ?? null;
    } catch {
      return null;
    }
  };

  const submit = () => {
    if (!canSave) {
      Alert.alert(t('addPerson.requiredTitle'), t('addPerson.requiredName'));
      return;
    }

    const createdAt = resolveCreatedAt();
    if (!createdAt) {
      Alert.alert(t('addPerson.dateErrorTitle'), t('addPerson.registeredDateFormat'));
      return;
    }

    const birthDateTrimmed = birthDate.trim();
    let normalizedBirthDate: string | undefined;
    if (birthDateTrimmed) {
      const parsed = normalizeBirthDateInput(birthDateTrimmed);
      if (!parsed) {
        Alert.alert(
          t('addPerson.dateErrorTitle'),
          t('addPerson.birthDateFormat'),
        );
        return;
      }
      normalizedBirthDate = parsed;
    }

    const person: Person = initialPerson
      ? {
          ...initialPerson,
          name: name.trim(),
          phone: formatPhoneDisplay(phone) || undefined,
          birthDate: normalizedBirthDate,
          createdAt,
          photoUri,
          note: note.trim() || undefined,
          gender,
        }
      : {
          id: createId('person'),
          name: name.trim(),
          phone: formatPhoneDisplay(phone) || undefined,
          birthDate: normalizedBirthDate,
          createdAt,
          photoUri,
          note: note.trim() || undefined,
          gender,
        };

    onSubmit(person);
    reset();
  };

  const close = () => {
    reset();
    onClose();
  };

  const showInfoFields = section !== 'photo';
  const showPhotoFields = section !== 'info';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, scaled.sheet]}>
          <View style={[styles.header, scaled.header]}>
            <Text style={[styles.title, scaled.title]}>{title}</Text>
            <Pressable onPress={close} style={[styles.closeBtn, scaled.closeBtn]}>
              <Text style={[styles.closeText, scaled.closeText]}>{t('common.close')}</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={[styles.body, scaled.body]}
            keyboardShouldPersistTaps="handled"
          >
            {showInfoFields ? (
              <>
            <View style={[styles.field, scaled.field]}>
              <Text style={[styles.label, scaled.label]}>{t('addPerson.nameRequired')}</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t('addPerson.namePlaceholder')}
                placeholderTextColor="#64748b"
                style={[styles.input, scaled.input]}
              />
            </View>

            <View style={[styles.field, scaled.field]}>
              <Text style={[styles.label, scaled.label]}>{t('person.gender')}</Text>
              <View style={[styles.genderRow, scaled.genderRow]}>
                <Pressable
                  onPress={() => setGender('male')}
                  style={[
                    styles.genderBtn,
                    scaled.genderBtn,
                    gender === 'male' && styles.genderBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.genderBtnText,
                      scaled.genderBtnText,
                      gender === 'male' && styles.genderBtnTextActive,
                    ]}
                  >
                    {t('person.male')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setGender('female')}
                  style={[
                    styles.genderBtn,
                    scaled.genderBtn,
                    gender === 'female' && styles.genderBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.genderBtnText,
                      scaled.genderBtnText,
                      gender === 'female' && styles.genderBtnTextActive,
                    ]}
                  >
                    {t('person.female')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setGender('unknown')}
                  style={[
                    styles.genderBtn,
                    scaled.genderBtn,
                    gender === 'unknown' && styles.genderBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.genderBtnText,
                      scaled.genderBtnText,
                      gender === 'unknown' && styles.genderBtnTextActive,
                    ]}
                  >
                    {t('person.unknown')}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={[styles.field, scaled.field]}>
              <Text style={[styles.label, scaled.label]}>{t('person.phone')}</Text>
              <TextInput
                value={phone}
                onChangeText={text => setPhone(formatPhoneDisplay(text))}
                placeholder={t('addPerson.phonePlaceholder')}
                placeholderTextColor="#64748b"
                keyboardType="phone-pad"
                style={[styles.input, scaled.input]}
              />
            </View>

            <View style={[styles.field, scaled.field]}>
              <Text style={[styles.label, scaled.label]}>{t('person.birthDate')}</Text>
              <TextInput
                value={birthDate}
                onChangeText={setBirthDate}
                placeholder={t('addPerson.birthPlaceholder')}
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, scaled.input, styles.birthDateInput]}
              />
              <Text style={[styles.fieldHint, scaled.fieldHint]}>
                {t('addPerson.birthHint')}
              </Text>
            </View>

            <View style={[styles.field, scaled.field]}>
              <Text style={[styles.label, scaled.label]}>{t('person.registered')}</Text>
              <TextInput
                value={registeredDate}
                onChangeText={setRegisteredDate}
                placeholder={t('addPerson.registeredPlaceholder')}
                placeholderTextColor="#64748b"
                style={[styles.input, scaled.input]}
              />
              {!initialPerson ? (
                <Text style={[styles.fieldHint, scaled.fieldHint]}>
                  {t('addPerson.networkHint')}
                </Text>
              ) : (
                <Text style={[styles.fieldHint, scaled.fieldHint]}>{t('addPerson.editDateHint')}</Text>
              )}
            </View>

            <View style={[styles.field, scaled.field]}>
              <View style={styles.noteHeader}>
                <Text style={[styles.label, scaled.label]}>{t('addPerson.noteLabel')}</Text>
                <Text style={[styles.noteCount, scaled.noteCount]}>{note.length}/100</Text>
              </View>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={t('addPerson.notePlaceholder')}
                placeholderTextColor="#64748b"
                maxLength={100}
                multiline
                style={[styles.input, scaled.input, styles.noteInput, scaled.noteInput]}
              />
            </View>
              </>
            ) : null}

            {showPhotoFields ? (
            <View style={[styles.field, scaled.field]}>
            <View style={[styles.photoRow, scaled.photoRow]}>
              <Pressable onPress={takePhoto} style={[styles.photoBtn, scaled.photoBtn]}>
                <Text style={[styles.photoBtnText, scaled.photoBtnText]}>{t('addPerson.camera')}</Text>
              </Pressable>
              <Pressable onPress={pickFromGallery} style={[styles.photoBtn, scaled.photoBtn]}>
                <Text style={[styles.photoBtnText, scaled.photoBtnText]}>{t('addPerson.gallery')}</Text>
              </Pressable>
              <Pressable
                onPress={() => setPhotoUri(undefined)}
                style={[styles.photoBtn, scaled.photoBtn, styles.photoBtnDanger]}
              >
                <Text style={[styles.photoBtnText, scaled.photoBtnText, styles.photoBtnDangerText]}>{t('addPerson.remove')}</Text>
              </Pressable>
              <View style={[styles.photoInfo, scaled.photoInfo]}>
                <Text style={[styles.photoInfoText, scaled.photoInfoText]} numberOfLines={1}>
                  {photoUri ? t('addPerson.photoSelected') : t('addPerson.photoNone')}
                </Text>
              </View>
            </View>
            </View>
            ) : null}
          </ScrollView>

          <View style={[styles.footer, scaled.footer]}>
            <Pressable
              onPress={submit}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.saveBtn,
                scaled.saveBtn,
                !canSave && styles.saveBtnDisabled,
                pressed && canSave && styles.saveBtnPressed,
              ]}
            >
              <Text style={[styles.saveText, scaled.saveText]}>{t('common.save')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: ui.color.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: ui.color.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: ui.color.borderLight,
    overflow: 'hidden',
    maxHeight: '88%',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: ui.color.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: ui.color.text,
    fontSize: 16,
    fontWeight: ui.weight.heading,
  },
  closeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: ui.color.surfaceMuted,
    borderWidth: 1,
    borderColor: ui.color.border,
  },
  closeText: {
    color: ui.color.text,
    fontSize: 12,
    fontWeight: ui.weight.title,
  },
  body: {
    padding: 16,
    gap: 14,
  },
  field: {
    gap: 6,
  },
  label: {
    color: ui.color.label,
    fontSize: 12,
    fontWeight: ui.weight.label,
  },
  fieldHint: {
    color: ui.color.textMuted,
    fontSize: 11,
    fontWeight: ui.weight.body,
  },
  input: {
    color: ui.color.text,
    backgroundColor: ui.color.surface,
    borderWidth: 1,
    borderColor: ui.color.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    fontWeight: ui.weight.body,
  },
  birthDateInput: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    letterSpacing: 0.3,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteCount: {
    color: ui.color.textMuted,
    fontSize: 11,
    fontWeight: ui.weight.title,
  },
  noteInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  genderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  genderBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.color.border,
    backgroundColor: ui.color.surface,
    paddingVertical: 11,
  },
  genderBtnActive: {
    borderColor: ui.color.accent,
    backgroundColor: ui.color.accentBg,
  },
  genderBtnText: {
    color: ui.color.label,
    fontSize: 13,
    fontWeight: ui.weight.title,
  },
  genderBtnTextActive: {
    color: ui.color.accentDark,
    fontWeight: ui.weight.heading,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  photoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: ui.color.surface,
    borderWidth: 1,
    borderColor: ui.color.border,
  },
  photoBtnText: {
    color: ui.color.text,
    fontSize: 12,
    fontWeight: ui.weight.title,
  },
  photoBtnDanger: {
    borderColor: ui.color.dangerBorder,
    backgroundColor: ui.color.dangerBg,
  },
  photoBtnDangerText: {
    color: ui.color.danger,
    fontWeight: ui.weight.title,
  },
  photoInfo: {
    flex: 1,
    paddingHorizontal: 10,
  },
  photoInfoText: {
    color: ui.color.textSecondary,
    fontSize: 12,
    fontWeight: ui.weight.body,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: ui.color.borderLight,
  },
  saveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: ui.color.accent,
    paddingVertical: 13,
  },
  saveBtnPressed: {
    opacity: 0.9,
  },
  saveBtnDisabled: {
    backgroundColor: '#93c5fd',
    opacity: 0.6,
  },
  saveText: {
    color: ui.color.surface,
    fontSize: 15,
    fontWeight: ui.weight.heading,
  },
});

