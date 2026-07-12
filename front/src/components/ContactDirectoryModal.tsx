import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ui } from '../theme/ui';
import { formatPhoneDisplay } from '../utils/phone';
import { openSmsComposer } from '../utils/sms';

export type ContactDirectoryEntry = {
  id: string;
  name: string;
  phone: string;
  viewLabel: string;
  kinshipLabel: string;
};

type Props = {
  visible: boolean;
  entries: ContactDirectoryEntry[];
  onClose: () => void;
};

export function ContactDirectoryModal({ visible, entries, onClose }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!visible) {
      setSelectedIds(new Set());
      setMessage('');
    }
  }, [visible]);

  const selectedCount = selectedIds.size;
  const allSelected = entries.length > 0 && selectedCount === entries.length;

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [entries],
  );

  const toggleEntry = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(entries.map(entry => entry.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleSendSms = async () => {
    if (selectedCount === 0) {
      Alert.alert('선택 필요', '문자를 보낼 연락처를 하나 이상 선택해 주세요.');
      return;
    }

    const phones = entries
      .filter(entry => selectedIds.has(entry.id))
      .map(entry => entry.phone);

    await openSmsComposer(phones, message);
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>연락처 모아보기</Text>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>닫기</Text>
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            등록된 연락처 {entries.length}명 · 선택 {selectedCount}명
          </Text>

          <View style={styles.toolbar}>
            <Pressable style={styles.toolbarBtn} onPress={allSelected ? clearSelection : selectAll}>
              <Text style={styles.toolbarBtnText}>{allSelected ? '선택 해제' : '모두 선택'}</Text>
            </Pressable>
          </View>

          {entries.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>등록된 연락처가 없습니다.</Text>
              <Text style={styles.emptySubText}>인물 카드에서 연락처를 등록하면 여기에 모입니다.</Text>
            </View>
          ) : (
            <FlatList
              data={sortedEntries}
              keyExtractor={item => item.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const checked = selectedIds.has(item.id);
                return (
                  <Pressable
                    style={[styles.row, checked && styles.rowSelected]}
                    onPress={() => toggleEntry(item.id)}
                  >
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked ? <Text style={styles.checkmark}>✓</Text> : null}
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.rowName}>{item.name}</Text>
                      <Text style={styles.rowMeta}>
                        {item.kinshipLabel} · {item.viewLabel}
                      </Text>
                      <Text style={styles.rowPhone}>{formatPhoneDisplay(item.phone)}</Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          )}

          <TextInput
            style={styles.messageInput}
            value={message}
            onChangeText={setMessage}
            placeholder="문자 내용 (선택)"
            placeholderTextColor={ui.color.textMuted}
            multiline
            maxLength={1000}
          />

          <Pressable
            style={[styles.sendBtn, selectedCount === 0 && styles.sendBtnDisabled]}
            onPress={handleSendSms}
            disabled={selectedCount === 0}
          >
            <Text style={styles.sendBtnText}>
              문자 보내기{selectedCount > 0 ? ` (${selectedCount}명)` : ''}
            </Text>
          </Pressable>
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
    paddingHorizontal: 16,
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: ui.color.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ui.color.border,
    padding: 16,
    gap: 10,
    ...ui.shadow.card,
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
    maxHeight: 320,
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
});
