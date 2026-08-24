import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { PersonDetailModal } from '../components/PersonDetailModal';
import { ScreenHeader, useScreenInsets } from '../components/ScreenHeader';
import { usePedigreeSnapshot } from '../hooks/usePedigreeSnapshot';
import { ui } from '../theme/ui';
import { loadAppPrefs } from '../storage/appPrefs';
import {
  collectFamilyDirectory,
  searchFamilyDirectory,
  type FamilyDirectoryEntry,
} from '../utils/familyDirectory';
import { formatPhoneDisplay } from '../utils/phone';
import { useI18n } from '../i18n';

type Props = {
  onBack: () => void;
};

export function FamilySearchScreen({ onBack }: Props) {
  const { t, displayKinship, displayViewLabels } = useI18n();
  const { bottomInset } = useScreenInsets();
  const { store, loading } = usePedigreeSnapshot();
  const [query, setQuery] = useState('');
  const [hideEmpty, setHideEmpty] = useState(true);
  const [selected, setSelected] = useState<FamilyDirectoryEntry | null>(null);

  useEffect(() => {
    loadAppPrefs().then(prefs => setHideEmpty(prefs.hideEmptyPeopleInSearch));
  }, []);

  const directory = useMemo(
    () => (store ? collectFamilyDirectory(store, { includeEmpty: !hideEmpty }) : []),
    [store, hideEmpty],
  );
  const results = useMemo(
    () => searchFamilyDirectory(directory, query),
    [directory, query],
  );

  return (
    <View style={[styles.safe, { paddingBottom: bottomInset }]}>
      <ScreenHeader title={t('search.title')} subtitle={t('search.subtitle')} onBack={onBack} />
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('search.placeholder')}
          placeholderTextColor={ui.color.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ui.color.accent} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.key}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.empty}>
              {query.trim() ? t('search.noResults') : t('search.noFamily')}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() => setSelected(item)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(item.person.name || item.kinshipLabel).slice(0, 1)}
                </Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.name}>
                  {item.person.name?.trim()
                    ? displayKinship(item.person.name)
                    : t('common.unnamed')}
                </Text>
                <Text style={styles.meta}>
                  {displayKinship(item.kinshipLabel)} · {displayViewLabels(item.viewLabel)}
                  {item.person.phone ? ` · ${formatPhoneDisplay(item.person.phone)}` : ''}
                </Text>
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
            ? `${displayKinship(selected.kinshipLabel)} · ${displayViewLabels(selected.viewLabel)}`
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
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: ui.color.surface,
    borderBottomWidth: 1,
    borderBottomColor: ui.color.borderLight,
  },
  searchInput: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ui.color.border,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    color: ui.color.text,
    fontSize: 15,
    fontWeight: ui.weight.body,
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
  pressed: { opacity: 0.9 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: ui.color.accentBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: ui.color.accentDark,
    fontSize: 16,
    fontWeight: ui.weight.heading,
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    color: ui.color.textMuted,
    fontSize: 14,
    fontWeight: ui.weight.body,
  },
});
