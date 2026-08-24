import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { APP_COMPANY, APP_CONTACT_EMAIL, APP_VERSION } from '../config/appInfo';
import { useI18n } from '../i18n';
import { ui } from '../theme/ui';

type Props = {
  compact?: boolean;
  align?: 'center' | 'start';
};

export function AppCredits({ compact, align = 'center' }: Props) {
  const { t } = useI18n();
  const start = align === 'start';

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact, start && styles.wrapStart]}>
      <Text style={[styles.line, compact && styles.lineCompact, start && styles.lineStart]}>
        {t('settings.version', { version: APP_VERSION })}
      </Text>
      <Text style={[styles.line, compact && styles.lineCompact, start && styles.lineStart]}>
        {APP_COMPANY}
      </Text>
      <Pressable
        onPress={() => {
          void Linking.openURL(`mailto:${APP_CONTACT_EMAIL}`);
        }}
        hitSlop={8}
      >
        <Text
          style={[
            styles.line,
            styles.email,
            compact && styles.lineCompact,
            start && styles.lineStart,
          ]}
        >
          {t('settings.inquiry', { email: APP_CONTACT_EMAIL })}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 4,
  },
  wrapCompact: {
    gap: 2,
  },
  wrapStart: {
    alignItems: 'flex-start',
  },
  line: {
    color: ui.color.textMuted,
    fontSize: 12,
    fontWeight: ui.weight.body,
    textAlign: 'center',
  },
  lineCompact: {
    fontSize: 11,
  },
  lineStart: {
    textAlign: 'left',
  },
  email: {
    textDecorationLine: 'underline',
  },
});
