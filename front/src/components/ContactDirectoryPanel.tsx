import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ui } from '../theme/ui';
import { useScaledModalStyles } from '../theme/responsive';
import { formatPhoneDisplay } from '../utils/phone';
import { openSmsComposer } from '../utils/sms';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';
import { collatorLocale } from '../i18n';
import {
  CONTACT_LINEAGE_FILTERS,
  filterContactEntries,
  type ContactDirectoryEntry,
  type ContactLineageFilter,
} from '../utils/contactDirectory';

type Props = {
  entries: ContactDirectoryEntry[];
  variant?: 'modal' | 'screen';
  onClose?: () => void;
};

export function ContactDirectoryPanel({ entries, variant = 'modal', onClose }: Props) {
  const { t, displayKinship, displayViewLabels, locale } = useI18n();
  const scaled = useScaledModalStyles();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [lineageFilter, setLineageFilter] = useState<ContactLineageFilter>('all');
  const isScreen = variant === 'screen';

  useEffect(() => {
    setSelectedIds(new Set());
    setMessage('');
    setLineageFilter('all');
  }, [entries]);

  const filterLabel = (filter: ContactLineageFilter) =>
    t(`contacts.filter.${filter}` as MessageKey);

  const filteredEntries = useMemo(
    () => filterContactEntries(entries, lineageFilter),
    [entries, lineageFilter],
  );

  const sortedEntries = useMemo(
    () => [...filteredEntries].sort((a, b) => a.name.localeCompare(b.name, collatorLocale(locale))),
    [filteredEntries, locale],
  );

  const selectedCount = useMemo(
    () => sortedEntries.filter(entry => selectedIds.has(entry.id)).length,
    [sortedEntries, selectedIds],
  );

  const allSelected =
    sortedEntries.length > 0 && selectedCount === sortedEntries.length;

  const toggleEntry = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(sortedEntries.map(entry => entry.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const changeFilter = (next: ContactLineageFilter) => {
    setLineageFilter(next);
    setSelectedIds(new Set());
  };

  const handleSendSms = async () => {
    if (selectedCount === 0) {
      Alert.alert(t('contacts.needSelectionTitle'), t('contacts.needSelectionBody'));
      return;
    }

    const phones = sortedEntries
      .filter(entry => selectedIds.has(entry.id))
      .map(entry => entry.phone);

    await openSmsComposer(phones, message);
  };

  const handleSendSmsToFilterAll = async () => {
    if (lineageFilter === 'all') {
      await handleSendSms();
      return;
    }
    if (sortedEntries.length === 0) {
      Alert.alert(
        t('contacts.noContactsTitle'),
        t('contacts.emptyFilter', { filter: filterLabel(lineageFilter) }),
      );
      return;
    }

    const phones = sortedEntries.map(entry => entry.phone);
    await openSmsComposer(phones, message);
  };

  return (
    <View style={[styles.root, isScreen && styles.rootScreen]}>
      {isScreen ? null : (
        <View style={styles.headerRow}>
          <Text style={[styles.title, scaled.title]}>{t('contacts.directoryTitle')}</Text>
          {onClose ? (
            <Pressable style={[styles.closeBtn, scaled.closeBtn]} onPress={onClose}>
              <Text style={[styles.closeBtnText, scaled.closeText]}>{t('common.close')}</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <Text style={[styles.subtitle, scaled.subtitle]}>
        {t('contacts.summary', {
          filter: filterLabel(lineageFilter),
          total: filteredEntries.length,
          selected: selectedCount,
        })}
      </Text>

      <View style={styles.filterRow}>
        {CONTACT_LINEAGE_FILTERS.map(filter => {
          const active = lineageFilter === filter;
          return (
            <Pressable
              key={filter}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => changeFilter(filter)}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {filterLabel(filter)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.toolbar, scaled.toolbar]}>
        <Pressable
          style={[styles.toolbarBtn, scaled.toolbarBtn]}
          onPress={allSelected ? clearSelection : selectAllVisible}
        >
          <Text style={[styles.toolbarBtnText, scaled.toolbarBtnText]}>
            {allSelected ? t('contacts.deselect') : t('contacts.selectAll')}
          </Text>
        </Pressable>
      </View>

      {sortedEntries.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>
            {lineageFilter === 'all'
              ? t('contacts.emptyAll')
              : t('contacts.emptyFilter', { filter: filterLabel(lineageFilter) })}
          </Text>
          <Text style={styles.emptySubText}>
            {t('contacts.emptyHint')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={sortedEntries}
          keyExtractor={item => item.id}
          style={isScreen ? styles.listScreen : [styles.list, scaled.list]}
          contentContainerStyle={[styles.listContent, scaled.listContent]}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const checked = selectedIds.has(item.id);
            return (
              <Pressable
                style={[styles.row, scaled.row, checked && styles.rowSelected]}
                onPress={() => toggleEntry(item.id)}
              >
                <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                  {checked ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{displayKinship(item.name)}</Text>
                  <Text style={styles.rowMeta}>
                    {displayKinship(item.kinshipLabel)} · {displayViewLabels(item.viewLabel)}
                  </Text>
                  <Text style={styles.rowPhone}>{formatPhoneDisplay(item.phone)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <TextInput
        style={[styles.messageInput, scaled.messageInput]}
        value={message}
        onChangeText={setMessage}
        placeholder={t('contacts.smsPlaceholder')}
        placeholderTextColor={ui.color.textMuted}
        multiline
        maxLength={1000}
      />

      <Pressable
        style={[styles.sendBtn, scaled.sendBtn, selectedCount === 0 && styles.sendBtnDisabled]}
        onPress={handleSendSms}
        disabled={selectedCount === 0}
      >
        <Text style={[styles.sendBtnText, scaled.sendBtnText]}>
          {selectedCount > 0
            ? t('contacts.sendSelectedCount', { count: selectedCount })
            : t('contacts.sendSelected')}
        </Text>
      </Pressable>

      {lineageFilter !== 'all' ? (
        <Pressable
          style={[
            styles.sendFilterBtn,
            sortedEntries.length === 0 && styles.sendBtnDisabled,
          ]}
          onPress={handleSendSmsToFilterAll}
          disabled={sortedEntries.length === 0}
        >
          <Text style={styles.sendFilterBtnText}>
            {sortedEntries.length > 0
              ? t('contacts.sendFilterAllCount', {
                  filter: filterLabel(lineageFilter),
                  count: sortedEntries.length,
                })
              : t('contacts.sendFilterAll', { filter: filterLabel(lineageFilter) })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 10,
  },
  rootScreen: {
    flex: 1,
  },
  headerRow: {
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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ui.color.border,
    backgroundColor: ui.color.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  closeBtnText: {
    color: ui.color.text,
    fontSize: 12,
    fontWeight: ui.weight.title,
  },
  subtitle: {
    color: ui.color.textSecondary,
    fontSize: 12,
    fontWeight: ui.weight.body,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ui.color.border,
    backgroundColor: ui.color.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterChipActive: {
    borderColor: ui.color.accent,
    backgroundColor: ui.color.accentBg,
  },
  filterChipText: {
    color: ui.color.textSecondary,
    fontSize: 12,
    fontWeight: ui.weight.title,
  },
  filterChipTextActive: {
    color: ui.color.accentDark,
  },
  toolbar: {
    flexDirection: 'row',
    gap: 8,
  },
  toolbarBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ui.color.border,
    backgroundColor: ui.color.surface,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  toolbarBtnText: {
    color: ui.color.text,
    fontSize: 12,
    fontWeight: ui.weight.title,
  },
  list: {
    maxHeight: 280,
  },
  listScreen: {
    flex: 1,
  },
  listContent: {
    gap: 8,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.color.border,
    backgroundColor: ui.color.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowSelected: {
    borderColor: ui.color.accent,
    backgroundColor: '#f3f8ff',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: ui.color.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    borderColor: ui.color.accent,
    backgroundColor: ui.color.accent,
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: ui.weight.heading,
    marginTop: -1,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    color: ui.color.text,
    fontSize: 14,
    fontWeight: ui.weight.title,
  },
  rowMeta: {
    color: ui.color.textSecondary,
    fontSize: 11,
    fontWeight: ui.weight.body,
  },
  rowPhone: {
    color: ui.color.label,
    fontSize: 12,
    fontWeight: ui.weight.body,
  },
  emptyWrap: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  emptyText: {
    color: ui.color.text,
    fontSize: 14,
    fontWeight: ui.weight.title,
  },
  emptySubText: {
    color: ui.color.textSecondary,
    fontSize: 12,
    fontWeight: ui.weight.body,
    textAlign: 'center',
  },
  messageInput: {
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.color.border,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: ui.color.text,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  sendBtn: {
    borderRadius: 12,
    backgroundColor: ui.color.accent,
    paddingVertical: 13,
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: ui.weight.title,
  },
  sendFilterBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.color.accent,
    backgroundColor: ui.color.accentBg,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sendFilterBtnText: {
    color: ui.color.accentDark,
    fontSize: 13,
    fontWeight: ui.weight.title,
  },
});
