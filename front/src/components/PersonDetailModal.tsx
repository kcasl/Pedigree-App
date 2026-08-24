import React from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Person } from '../types/pedigree';
import { ui } from '../theme/ui';
import { useScaledModalStyles } from '../theme/responsive';
import { formatKoreanDate } from '../utils/date';
import { formatPhoneDisplay } from '../utils/phone';
import { useI18n } from '../i18n';

type Props = {
  visible: boolean;
  person?: Person;
  kinshipLabel?: string;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

export function PersonDetailModal({
  visible,
  person,
  kinshipLabel,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  const { t, displayKinship } = useI18n();
  const scaled = useScaledModalStyles();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={[styles.backdrop, scaled.backdropPad]} onPress={onClose}>
        <Pressable style={[styles.card, scaled.card]} onPress={() => {}}>
          <View style={[styles.header, scaled.header, scaled.headerCompact]}>
            <Text style={[styles.title, scaled.title]}>{t('person.detailTitle')}</Text>
            <Pressable onPress={onClose} style={[styles.closeBtn, scaled.closeBtn]}>
              <Text style={[styles.closeText, scaled.closeText]}>{t('common.close')}</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={[styles.body, scaled.body, scaled.bodyCompact]}>
            <View style={[styles.topRow, scaled.topRow]}>
              {person?.photoUri ? (
                <Image source={{ uri: person.photoUri }} style={[styles.avatar, scaled.avatar]} />
              ) : (
                <View style={[styles.avatarFallback, scaled.avatar]}>
                  <Text style={[styles.avatarFallbackText, scaled.avatarFallbackText]}>
                    {person?.name?.slice(0, 1) ?? '?'}
                  </Text>
                </View>
              )}
              <View style={[styles.topText, scaled.topText]}>
                <Text style={[styles.name, scaled.name]}>
                  {displayKinship(person?.name) || t('common.unnamed')}
                </Text>
                {kinshipLabel ? (
                  <Text style={[styles.label, scaled.label]}>{kinshipLabel}</Text>
                ) : null}
              </View>
            </View>

            <View style={[styles.section, scaled.section]}>
              <Text style={[styles.label, scaled.label]}>{t('person.registered')}</Text>
              <Text style={[styles.value, scaled.value]}>
                {formatKoreanDate(person?.createdAt) || t('person.dash')}
              </Text>
            </View>
            <View style={[styles.section, scaled.section]}>
              <Text style={[styles.label, scaled.label]}>{t('person.phone')}</Text>
              <Text style={[styles.value, scaled.value]}>
                {person?.phone ? formatPhoneDisplay(person.phone) : t('person.dash')}
              </Text>
            </View>
            <View style={[styles.section, scaled.section]}>
              <Text style={[styles.label, scaled.label]}>{t('person.birthDate')}</Text>
              <Text style={[styles.value, scaled.value]}>{person?.birthDate ?? t('person.dash')}</Text>
            </View>
            <View style={[styles.section, scaled.section]}>
              <Text style={[styles.label, scaled.label]}>{t('person.gender')}</Text>
              <Text style={[styles.value, scaled.value]}>
                {person?.gender === 'male'
                  ? t('person.male')
                  : person?.gender === 'female'
                    ? t('person.female')
                    : t('person.dash')}
              </Text>
            </View>
            <View style={[styles.section, scaled.section]}>
              <Text style={[styles.label, scaled.label]}>{t('person.note')}</Text>
              <Text style={[styles.value, scaled.value]}>{person?.note ?? t('person.dash')}</Text>
            </View>
          </ScrollView>

          {onEdit || onDelete ? (
            <View style={[styles.footer, scaled.footer, scaled.footerRow]}>
              {onEdit ? (
                <Pressable style={[styles.primaryBtn, scaled.primaryBtn]} onPress={onEdit}>
                  <Text style={[styles.primaryText, scaled.primaryText]}>{t('person.edit')}</Text>
                </Pressable>
              ) : null}
              {onDelete ? (
                <Pressable style={[styles.dangerBtn, scaled.dangerBtn]} onPress={onDelete}>
                  <Text style={[styles.dangerText, scaled.dangerText]}>{t('common.delete')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: ui.color.overlay,
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    backgroundColor: ui.color.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ui.color.border,
    overflow: 'hidden',
    maxHeight: '86%',
    ...ui.shadow.card,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 6,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: ui.color.badgeBg,
    borderWidth: 1,
    borderColor: ui.color.borderLight,
  },
  avatarFallback: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: ui.color.badgeBg,
    borderWidth: 1,
    borderColor: ui.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: ui.color.text,
    fontSize: 22,
    fontWeight: ui.weight.heading,
  },
  topText: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: ui.color.text,
    fontSize: 18,
    fontWeight: ui.weight.heading,
  },
  section: {
    gap: 4,
  },
  label: {
    color: ui.color.label,
    fontSize: 12,
    fontWeight: ui.weight.title,
  },
  value: {
    color: ui.color.text,
    fontSize: 14,
    fontWeight: ui.weight.label,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: ui.color.borderLight,
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: ui.color.accent,
    paddingVertical: 13,
  },
  primaryText: {
    color: ui.color.surface,
    fontSize: 14,
    fontWeight: ui.weight.heading,
  },
  dangerBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: ui.color.dangerBg,
    borderWidth: 1,
    borderColor: ui.color.dangerBorder,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  dangerText: {
    color: ui.color.danger,
    fontSize: 13,
    fontWeight: ui.weight.heading,
  },
});
