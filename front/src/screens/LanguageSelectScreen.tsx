import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppCredits } from '../components/AppCredits';
import { useScreenInsets } from '../components/ScreenHeader';
import { LOCALES, LOCALE_NATIVE_LABEL, t, useI18n, type Locale } from '../i18n';
import { ui } from '../theme/ui';

/**
 * 첫 실행 언어 선택.
 * 선택지는 앱에 세팅된 LOCALES(각 언어 원어 표기).
 * 안내 문구는 아직 기본 언어가 없으므로 항상 영어.
 */
export function LanguageSelectScreen() {
  const { confirmLocale } = useI18n();
  const { topInset, bottomInset } = useScreenInsets();
  const [picked, setPicked] = useState<Locale>('en');

  return (
    <View style={[styles.safe, { paddingTop: topInset + 28, paddingBottom: bottomInset + 24 }]}>
      <View style={styles.body}>
        <Text style={styles.kicker}>PEDIGREE</Text>
        <Text style={styles.title}>{t('languageSelect.title', undefined, 'en')}</Text>
        <Text style={styles.subtitle}>{t('languageSelect.subtitle', undefined, 'en')}</Text>
        <View style={styles.rule} />

        <View style={styles.list}>
          {LOCALES.map(code => {
            const active = picked === code;
            return (
              <Pressable
                key={code}
                onPress={() => setPicked(code)}
                style={({ pressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {LOCALE_NATIVE_LABEL[code]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => {
            void confirmLocale(picked);
          }}
          style={({ pressed }) => [styles.continueBtn, pressed && styles.pressed]}
        >
          <Text style={styles.continueText}>{t('languageSelect.continue', undefined, 'en')}</Text>
        </Pressable>
      </View>
      <AppCredits compact />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f6f1e8',
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  kicker: {
    letterSpacing: 3.4,
    fontSize: 11,
    fontWeight: ui.weight.title,
    color: '#8a734c',
    marginBottom: 14,
    textAlign: 'center',
  },
  title: {
    textAlign: 'center',
    color: '#1c2a3a',
    fontSize: 28,
    lineHeight: 36,
    fontWeight: ui.weight.heading,
  },
  subtitle: {
    marginTop: 10,
    color: '#7a8696',
    fontSize: 15,
    fontWeight: ui.weight.body,
    textAlign: 'center',
  },
  rule: {
    marginTop: 18,
    marginBottom: 22,
    alignSelf: 'center',
    width: 42,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#c4a574',
  },
  list: {
    gap: 10,
  },
  chip: {
    backgroundColor: '#fffdf8',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    paddingVertical: 14,
    alignItems: 'center',
  },
  chipActive: {
    borderColor: ui.color.accent,
    backgroundColor: ui.color.accentBg,
  },
  chipText: {
    color: '#1c2a3a',
    fontSize: 17,
    fontWeight: ui.weight.title,
  },
  chipTextActive: {
    color: ui.color.accentDark,
  },
  continueBtn: {
    marginTop: 22,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.color.accent,
  },
  continueText: {
    color: ui.color.surface,
    fontSize: 16,
    fontWeight: ui.weight.heading,
  },
  pressed: {
    opacity: 0.9,
  },
});
