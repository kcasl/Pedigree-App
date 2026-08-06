import React, { useMemo } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import type { ActiveView } from '../types/lineage';
import type { Person } from '../types/pedigree';
import { ui } from '../theme/ui';
import { scaleSize } from '../theme/responsive';
import { PERSON_NODE_METRICS, STANDARD_LAYOUT_DEFAULTS } from '../utils/standardLayout';
import { internationalAge } from '../utils/date';
import { isGreatGrandparentNode, resolveNodeDisplayName } from '../utils/standardTemplate';

const NODE_TEXT = { allowFontScaling: false, maxFontSizeMultiplier: 1 } as const;
const BASE_CARD_WIDTH = STANDARD_LAYOUT_DEFAULTS.cardWidth;
const BASE_CARD_HEIGHT = STANDARD_LAYOUT_DEFAULTS.cardHeight;

type Props = {
  label: string;
  ordinalLabel?: string;
  person?: Person;
  onPress: () => void;
  style?: ViewStyle;
  width?: number;
  height?: number;
  highlighted?: boolean;
  generation?: number;
  referenceDate?: Date;
  activeView?: ActiveView;
};

type FallbackAvatarTheme = {
  bg: string;
  fg: string;
  border: string;
};

function formatPhoneForNode(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function fallbackAvatarTheme(gender?: Person['gender']): FallbackAvatarTheme {
  if (gender === 'male') {
    return {
      bg: '#C5DBFA',
      fg: '#3B6EA8',
      border: '#8EB4E8',
    };
  }
  if (gender === 'female') {
    return {
      bg: '#E8CFF8',
      fg: '#7A3FA8',
      border: '#C89AE8',
    };
  }
  return {
    bg: '#D2DCE8',
    fg: '#4A5E78',
    border: '#9AADBE',
  };
}

export function PersonNodeCard({
  label,
  ordinalLabel,
  person,
  onPress,
  style,
  width = BASE_CARD_WIDTH,
  height = BASE_CARD_HEIGHT,
  highlighted,
  generation = 0,
  referenceDate,
  activeView,
}: Props) {
  const today = referenceDate ?? new Date();
  const personName = person
    ? resolveNodeDisplayName(activeView, person.id, person.name)
    : '추가';
  const personAge = person ? internationalAge(person.birthDate, today) : null;

  const rowBg = useMemo(() => {
    if (person && isGreatGrandparentNode(person, activeView)) return ui.greatAncestorSurface;
    return ui.generationSurface(generation);
  }, [person, generation, activeView]);

  const avatarTheme = fallbackAvatarTheme(person?.gender);
  const cardScale = width / BASE_CARD_WIDTH;
  const rs = (size: number) => scaleSize(size, cardScale);
  const m = PERSON_NODE_METRICS;
  const scaled = useMemo(
    () => ({
      card: {
        borderRadius: rs(14),
        padding: rs(m.padding),
        height,
        minHeight: height,
        maxHeight: height,
      },
      header: { gap: rs(6), minHeight: rs(m.headerHeight) },
      badge: {
        fontSize: rs(12),
        paddingHorizontal: rs(8),
        paddingVertical: rs(4),
      },
      ordinalBadge: {
        fontSize: rs(11),
        paddingHorizontal: rs(6),
        paddingVertical: rs(3),
      },
      content: {
        width: '100%' as const,
        marginTop: rs(m.contentMarginTop),
        gap: rs(m.contentGap),
        alignItems: 'center' as const,
      },
      textBlock: {
        width: '100%' as const,
        alignSelf: 'stretch' as const,
        gap: rs(m.textGap),
      },
      avatar: {
        width: rs(m.avatarSize),
        height: rs(m.avatarSize),
        borderRadius: rs(m.avatarSize / 2),
      },
      avatarFallback: {
        width: rs(m.avatarSize),
        height: rs(m.avatarSize),
        borderRadius: rs(m.avatarSize / 2),
      },
      personHead: {
        width: rs(20),
        height: rs(20),
        borderRadius: rs(10),
        marginBottom: rs(5),
      },
      personBody: {
        width: rs(34),
        height: rs(30),
        borderTopLeftRadius: rs(18),
        borderTopRightRadius: rs(18),
        borderBottomLeftRadius: rs(10),
        borderBottomRightRadius: rs(10),
      },
      avatarFallbackText: { fontSize: rs(24) },
      name: {
        fontSize: rs(16),
        lineHeight: rs(m.nameLineHeight),
        minHeight: rs(m.nameLineHeight * m.nameLines),
      },
      age: {
        fontSize: rs(12),
        lineHeight: rs(m.ageLineHeight),
        minHeight: rs(m.ageLineHeight),
      },
      sub: { fontSize: rs(12), lineHeight: rs(m.phoneLineHeight) },
    }),
    [cardScale, height],
  );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        scaled.card,
        {
          backgroundColor: rowBg,
          width,
          maxWidth: width,
          minWidth: width,
        },
        highlighted && styles.highlighted,
        pressed && styles.pressed,
        !person && styles.placeholder,
        style,
      ]}
    >
      <View style={[styles.header, scaled.header]}>
        <Text {...NODE_TEXT} style={[styles.badge, scaled.badge]}>
          {label}
        </Text>
        {ordinalLabel ? (
          <Text {...NODE_TEXT} style={[styles.ordinalBadge, scaled.ordinalBadge]}>
            {ordinalLabel}
          </Text>
        ) : null}
      </View>

      <View style={[styles.content, scaled.content]}>
        {person?.photoUri ? (
          <Image source={{ uri: person.photoUri }} style={[styles.avatar, scaled.avatar]} />
        ) : person ? (
          <View
            style={[
              styles.avatarFallback,
              scaled.avatarFallback,
              { backgroundColor: avatarTheme.bg, borderColor: avatarTheme.border },
            ]}
          >
            <View
              style={[styles.personHead, scaled.personHead, { backgroundColor: avatarTheme.fg }]}
            />
            <View
              style={[styles.personBody, scaled.personBody, { backgroundColor: avatarTheme.fg }]}
            />
          </View>
        ) : (
          <View style={[styles.avatarFallback, scaled.avatarFallback]}>
            <Text style={[styles.avatarFallbackText, scaled.avatarFallbackText]}>+</Text>
          </View>
        )}

        <View style={[styles.textBlock, scaled.textBlock]}>
          <Text {...NODE_TEXT} style={[styles.name, scaled.name]} numberOfLines={2}>
            {personName}
          </Text>
          {person && personAge != null ? (
            <Text {...NODE_TEXT} style={[styles.age, scaled.age]}>
              ({personAge})
            </Text>
          ) : person ? (
            <Text {...NODE_TEXT} style={[styles.age, scaled.age, styles.agePlaceholder]}>
              {' '}
            </Text>
          ) : null}
          <Text {...NODE_TEXT} style={[styles.sub, scaled.sub]} numberOfLines={1}>
            {person?.phone ? formatPhoneForNode(person.phone) : person ? ' ' : '탭해서 등록'}
          </Text>
        </View>
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
    opacity: 0.92,
    borderStyle: 'dashed',
    borderColor: ui.color.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 6,
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
  ordinalBadge: {
    fontSize: 11,
    color: ui.color.accentDark,
    backgroundColor: ui.color.accentBg,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: ui.weight.title,
  },
  content: {
    width: '100%',
    marginTop: 8,
    alignItems: 'center',
    gap: 6,
  },
  textBlock: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 2,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: ui.color.badgeBg,
    borderWidth: 1,
    borderColor: ui.color.borderLight,
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: ui.color.badgeBg,
    borderWidth: 1,
    borderColor: ui.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personHead: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginBottom: 5,
  },
  personBody: {
    width: 34,
    height: 30,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
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
    textAlign: 'center',
    width: '100%',
  },
  age: {
    color: ui.color.textSecondary,
    fontSize: 12,
    fontWeight: ui.weight.body,
    textAlign: 'center',
    width: '100%',
  },
  agePlaceholder: {
    opacity: 0,
  },
  sub: {
    color: ui.color.textSecondary,
    fontSize: 12,
    fontWeight: ui.weight.body,
    textAlign: 'center',
    width: '100%',
  },
});
