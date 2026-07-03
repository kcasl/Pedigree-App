import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import type { Person } from '../types/pedigree';
import { ui } from '../theme/ui';

type Props = {
  label: string;
  person?: Person;
  onPress: () => void;
  style?: ViewStyle;
  highlighted?: boolean;
};

export function PersonNodeCard({ label, person, onPress, style, highlighted }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        highlighted && styles.highlighted,
        pressed && styles.pressed,
        !person && styles.placeholder,
        style,
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.badge}>{label}</Text>
      </View>

      <View style={styles.content}>
        {person?.photoUri ? (
          <Image source={{ uri: person.photoUri }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarFallbackText}>
              {person?.name?.slice(0, 1) ?? '+'}
            </Text>
          </View>
        )}

        <Text style={styles.name} numberOfLines={1}>
          {person ? person.name : '추가'}
        </Text>
        {person?.phone ? (
          <Text style={styles.sub} numberOfLines={1}>
            {person.phone}
          </Text>
        ) : (
          <Text style={styles.sub} numberOfLines={1}>
            {person ? ' ' : '탭해서 등록'}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    backgroundColor: ui.color.surface,
    borderWidth: 1.5,
    borderColor: ui.color.border,
    padding: 12,
    ...ui.shadow.card,
  },
  pressed: {
    opacity: 0.88,
  },
  highlighted: {
    borderWidth: 3,
    borderColor: '#2e7d32',
    backgroundColor: '#f1f8e9',
  },
  placeholder: {
    backgroundColor: ui.color.surfaceMuted,
    borderStyle: 'dashed',
    borderColor: ui.color.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  badge: {
    fontSize: 12,
    color: ui.color.label,
    backgroundColor: ui.color.badgeBg,
    borderWidth: 1,
    borderColor: ui.color.borderLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: ui.weight.label,
  },
  content: {
    marginTop: 10,
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: ui.color.badgeBg,
    borderWidth: 1,
    borderColor: ui.color.borderLight,
  },
  avatarFallback: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: ui.color.badgeBg,
    borderWidth: 1,
    borderColor: ui.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: ui.color.text,
    fontSize: 24,
    fontWeight: ui.weight.title,
  },
  name: {
    color: ui.color.text,
    fontSize: 16,
    fontWeight: ui.weight.heading,
  },
  sub: {
    color: ui.color.textSecondary,
    fontSize: 12,
    fontWeight: ui.weight.body,
  },
});
