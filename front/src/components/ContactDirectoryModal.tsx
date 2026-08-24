import React from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { ui } from '../theme/ui';
import { useScaledModalStyles } from '../theme/responsive';
import { ContactDirectoryPanel } from './ContactDirectoryPanel';
import type { ContactDirectoryEntry } from '../utils/contactDirectory';

type Props = {
  visible: boolean;
  entries: ContactDirectoryEntry[];
  onClose: () => void;
};

export type { ContactDirectoryEntry } from '../utils/contactDirectory';

export function ContactDirectoryModal({ visible, entries, onClose }: Props) {
  const scaled = useScaledModalStyles();

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, scaled.backdropPadH]} onPress={onClose}>
        <Pressable style={[styles.sheet, scaled.sheetPad, scaled.card]} onPress={() => {}}>
          <ContactDirectoryPanel entries={entries} variant="modal" onClose={onClose} />
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
    ...ui.shadow.card,
  },
});
