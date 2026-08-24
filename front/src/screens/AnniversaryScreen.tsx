import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PersonDetailModal } from '../components/PersonDetailModal';
import { ScreenHeader, useScreenInsets } from '../components/ScreenHeader';
import { usePedigreeSnapshot } from '../hooks/usePedigreeSnapshot';
import { loadAppPrefs } from '../storage/appPrefs';
import { ui } from '../theme/ui';
import {
  buildAnniversaryList,
  type AnniversaryEntry,
} from '../utils/anniversaries';
import { collectFamilyDirectory } from '../utils/familyDirectory';
import { formatPhoneDisplay } from '../utils/phone';
import { parseBirthDateParts } from '../utils/date';
import { useI18n } from '../i18n';

type Props = {
  onBack: () => void;
};

export function AnniversaryScreen({ onBack }: Props) {
  const { t, displayKinship, formatBirthLabel, formatDaysUntilLabel } = useI18n();
  const { bottomInset } = useScreenInsets();
  const { store, loading } = usePedigreeSnapshot();
  const [showPhone, setShowPhone] = useState(true);
  const [selected, setSelected] = useState<AnniversaryEntry | null>(null);

  useEffect(() => {
    loadAppPrefs().then(prefs => setShowPhone(prefs.showPhoneOnAnniversaries));
  }, []);

  const entries = useMemo(() => {
    if (!store) return [];
    return buildAnniversaryList(collectFamilyDirectory(store));
  }, [store]);

  return (
    <View style={[styles.safe, { paddingBottom: bottomInset }]}>
      <ScreenHeader title={t('anniversary.title')} subtitle={t('anniversary.subtitle')} onBack={onBack} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ui.color.accent} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={item => item.key}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>{t('anniversary.empty')}</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, item.isToday && styles.rowToday, pressed && styles.pressed]}
              onPress={() => setSelected(item)}
            >
              <View style={[styles.badge, item.isToday && styles.badgeToday]}>
                <Text style={[styles.badgeText, item.isToday && styles.badgeTextToday]}>
                  {formatDaysUntilLabel(item.daysUntil)}
                </Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.name}>
                  {item.person.name?.trim()
                    ? displayKinship(item.person.name)
                    : displayKinship(item.kinshipLabel)}
                </Text>
                <Text style={styles.meta}>
                  {displayKinship(item.kinshipLabel)} · {(() => {
                    const parts = parseBirthDateParts(item.person.birthDate);
                    return parts
                      ? formatBirthLabel(parts.month, parts.day)
                      : item.birthLabel;
                  })()}
                  {item.turningAge != null ? ` · ${t('anniversary.ageYears', { age: item.turningAge })}` : ''}
                </Text>
                {showPhone && item.person.phone ? (
                  <Text style={styles.phone}>{formatPhoneDisplay(item.person.phone)}</Text>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      )}
      <PersonDetailModal
        visible={selected != null}
        person={selected?.person}
        kinshipLabel={
          selected
            ? [
                displayKinship(selected.kinshipLabel),
                (() => {
                  const parts = parseBirthDateParts(selected.person.birthDate);
                  return parts ? formatBirthLabel(parts.month, parts.day) : selected.birthLabel;
                })(),
                formatDaysUntilLabel(selected.daysUntil),
              ].join(' · ')
            : undefined
        }
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f7f4ef',
  },
  list: {
    padding: 16,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: ui.color.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ui.color.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...ui.shadow.card,
  },
  rowToday: {
    borderColor: '#d4786a',
    backgroundColor: '#fff7f4',
  },
  pressed: { opacity: 0.9 },
  badge: {
    minWidth: 64,
    borderRadius: 12,
    backgroundColor: ui.color.accentBg,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  badgeToday: {
    backgroundColor: '#ffe4dc',
  },
  badgeText: {
    color: ui.color.accentDark,
    fontSize: 12,
    fontWeight: ui.weight.title,
    textAlign: 'center',
  },
  badgeTextToday: {
    color: '#9a3b2f',
  },
  rowText: { flex: 1, gap: 2 },
  name: {
    color: ui.color.text,
    fontSize: 15,
    fontWeight: ui.weight.title,
  },
  meta: {
    color: ui.color.textSecondary,
    fontSize: 12,
    fontWeight: ui.weight.body,
  },
  phone: {
    color: ui.color.label,
    fontSize: 12,
    fontWeight: ui.weight.body,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    color: ui.color.textMuted,
    fontSize: 14,
    fontWeight: ui.weight.body,
  },
});
