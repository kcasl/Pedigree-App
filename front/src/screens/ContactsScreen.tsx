import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ContactDirectoryPanel } from '../components/ContactDirectoryPanel';
import { ScreenHeader, useScreenInsets } from '../components/ScreenHeader';
import { usePedigreeSnapshot } from '../hooks/usePedigreeSnapshot';
import { ui } from '../theme/ui';
import { useI18n } from '../i18n';
import { buildContactDirectoryEntries } from '../utils/contactDirectory';

type Props = {
  onBack: () => void;
};

export function ContactsScreen({ onBack }: Props) {
  const { t } = useI18n();
  const { bottomInset } = useScreenInsets();
  const { store, loading } = usePedigreeSnapshot();
  const entries = store ? buildContactDirectoryEntries(store) : [];

  return (
    <View style={[styles.safe, { paddingBottom: bottomInset + 8 }]}>
      <ScreenHeader title={t('contacts.title')} subtitle={t('contacts.subtitle')} onBack={onBack} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ui.color.accent} />
          <Text style={styles.muted}>{t('contacts.loading')}</Text>
        </View>
      ) : (
        <View style={styles.body}>
          <ContactDirectoryPanel entries={entries} variant="screen" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: ui.color.surface,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  muted: {
    color: ui.color.textMuted,
    fontSize: 13,
    fontWeight: ui.weight.body,
  },
});
