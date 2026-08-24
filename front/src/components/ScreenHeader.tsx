import React from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ui } from '../theme/ui';
import { useI18n } from '../i18n';

type Props = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: React.ReactNode;
};

export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  const statusBarHeight = StatusBar.currentHeight ?? 24;
  const topInset =
    Platform.OS === 'android' ? Math.min(insets.top, statusBarHeight) : insets.top;
  return { topInset, bottomInset: insets.bottom };
}

export function ScreenHeader({ title, subtitle, onBack, right }: Props) {
  const { t } = useI18n();
  const { topInset } = useScreenInsets();

  return (
    <View style={[styles.wrap, { paddingTop: topInset + 8 }]}>
      <View style={styles.row}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          hitSlop={8}
        >
          <Text style={styles.backText}>{t('common.backHome')}</Text>
        </Pressable>
        <View style={styles.titles}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.right}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: ui.color.surface,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: ui.color.borderLight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ui.color.border,
    backgroundColor: ui.color.surface,
  },
  backText: {
    color: ui.color.text,
    fontSize: 13,
    fontWeight: ui.weight.title,
  },
  titles: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: ui.color.text,
    fontSize: 18,
    fontWeight: ui.weight.heading,
  },
  subtitle: {
    marginTop: 1,
    color: ui.color.textMuted,
    fontSize: 12,
    fontWeight: ui.weight.body,
  },
  right: {
    alignItems: 'flex-end',
  },
  pressed: {
    opacity: 0.85,
  },
});
