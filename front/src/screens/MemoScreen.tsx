import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScreenHeader, useScreenInsets } from '../components/ScreenHeader';
import { ui } from '../theme/ui';
import { TrialExpiredBanner, useTrialLicense } from '../hooks/useTrialLicense';
import { useI18n } from '../i18n';
import {
  STICKY_COLORS,
  createStickyMemo,
  loadStickyMemos,
  saveStickyMemos,
  type StickyMemo,
} from '../storage/memoStorage';

type Props = {
  onBack: () => void;
};

export function MemoScreen({ onBack }: Props) {
  const { t } = useI18n();
  const { bottomInset } = useScreenInsets();
  const { expired: writeLocked, guardWrite } = useTrialLicense();
  const [memos, setMemos] = useState<StickyMemo[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadStickyMemos().then(next => {
      setMemos(next);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveStickyMemos(memos);
    }, 250);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void saveStickyMemos(memos);
    };
  }, [memos, hydrated]);

  const addMemo = () => {
    if (!guardWrite()) return;
    const color = STICKY_COLORS[memos.length % STICKY_COLORS.length];
    setMemos(prev => [createStickyMemo(color), ...prev]);
  };

  const updateMemo = (id: string, patch: Partial<StickyMemo>) => {
    if (!guardWrite()) return;
    const stamp = new Date().toISOString();
    setMemos(prev =>
      prev.map(memo => (memo.id === id ? { ...memo, ...patch, updatedAt: stamp } : memo)),
    );
  };

  const deleteMemo = (id: string) => {
    if (!guardWrite()) return;
    Alert.alert(t('memo.deleteTitle'), t('memo.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => setMemos(prev => prev.filter(memo => memo.id !== id)),
      },
    ]);
  };

  return (
    <View style={[styles.safe, { paddingBottom: bottomInset }]}>
      <ScreenHeader
        title={t('memo.title')}
        subtitle={t('memo.subtitle')}
        onBack={onBack}
        right={
          writeLocked ? undefined : (
          <Pressable style={styles.addBtn} onPress={addMemo}>
            <Text style={styles.addBtnText}>{t('memo.new')}</Text>
          </Pressable>
          )
        }
      />
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <TrialExpiredBanner compact />
      </View>
      <ScrollView contentContainerStyle={styles.board} keyboardShouldPersistTaps="handled">
        {memos.length === 0 ? (
          <Text style={styles.empty}>{t('memo.empty')}</Text>
        ) : (
          memos.map((memo, index) => (
            <StickyNote
              key={memo.id}
              memo={memo}
              tilt={index % 2 === 0 ? -1.4 : 1.2}
              readOnly={writeLocked}
              onChange={patch => updateMemo(memo.id, patch)}
              onDelete={() => deleteMemo(memo.id)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function StickyNote({
  memo,
  tilt,
  readOnly,
  onChange,
  onDelete,
}: {
  memo: StickyMemo;
  tilt: number;
  readOnly?: boolean;
  onChange: (patch: Partial<StickyMemo>) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  return (
    <View style={[styles.note, { backgroundColor: memo.color, transform: [{ rotate: `${tilt}deg` }] }]}>
      <View style={styles.noteTop}>
        <View style={styles.colors}>
          {!readOnly
            ? STICKY_COLORS.map(color => (
            <Pressable
              key={color}
              onPress={() => onChange({ color })}
              style={[
                styles.swatch,
                { backgroundColor: color },
                memo.color === color && styles.swatchActive,
              ]}
            />
              ))
            : null}
        </View>
        {!readOnly ? (
        <Pressable onPress={onDelete} hitSlop={8}>
          <Text style={styles.delete}>×</Text>
        </Pressable>
        ) : null}
      </View>
      <TextInput
        value={memo.title}
        onChangeText={title => onChange({ title })}
        placeholder={t('memo.titlePlaceholder')}
        placeholderTextColor="#8a7a4a"
        style={styles.titleInput}
        editable={!readOnly}
      />
      <TextInput
        value={memo.body}
        onChangeText={body => onChange({ body })}
        placeholder={t('memo.bodyPlaceholder')}
        placeholderTextColor="#8a7a4a"
        style={styles.bodyInput}
        editable={!readOnly}
        multiline
        textAlignVertical="top"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#d8c7a4',
  },
  addBtn: {
    borderRadius: 10,
    backgroundColor: '#1c2a3a',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: ui.weight.title,
  },
  board: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  empty: {
    marginTop: 48,
    textAlign: 'center',
    color: '#5c4d32',
    fontSize: 14,
    fontWeight: ui.weight.body,
  },
  note: {
    borderRadius: 4,
    padding: 14,
    minHeight: 180,
    ...ui.shadow.float,
  },
  noteTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  colors: {
    flexDirection: 'row',
    gap: 6,
  },
  swatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  swatchActive: {
    borderWidth: 2,
    borderColor: '#1c2a3a',
  },
  delete: {
    fontSize: 22,
    color: '#5c4d32',
    fontWeight: ui.weight.heading,
    lineHeight: 22,
  },
  titleInput: {
    fontSize: 16,
    fontWeight: ui.weight.title,
    color: '#3a2f14',
    marginBottom: 6,
    padding: 0,
  },
  bodyInput: {
    flexGrow: 1,
    minHeight: 96,
    fontSize: 14,
    fontWeight: ui.weight.body,
    color: '#3a2f14',
    padding: 0,
  },
});
