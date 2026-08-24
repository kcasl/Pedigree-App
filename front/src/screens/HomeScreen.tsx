import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ui } from '../theme/ui';
import { useScreenInsets } from '../components/ScreenHeader';
import { TrialExpiredBanner } from '../hooks/useTrialLicense';
import { AppCredits } from '../components/AppCredits';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';
import pedigreeIcon from '../assets/icons/pedigree.png';
import contactsIcon from '../assets/icons/contacts.png';
import searchIcon from '../assets/icons/search.png';
import anniversaryIcon from '../assets/icons/anniversary.png';
import memoIcon from '../assets/icons/memo.png';
import settingsIcon from '../assets/icons/settings.png';

export type HomeDestination =
  | 'pedigree'
  | 'contacts'
  | 'search'
  | 'anniversaries'
  | 'memos'
  | 'settings';

type Props = {
  userName?: string;
  isGuest?: boolean;
  onOpen: (destination: HomeDestination) => void;
};

const TILES: Array<{
  key: HomeDestination;
  labelKey: MessageKey;
  icon: ImageSourcePropType;
}> = [
  { key: 'pedigree', labelKey: 'home.tile.pedigree', icon: pedigreeIcon },
  { key: 'contacts', labelKey: 'home.tile.contacts', icon: contactsIcon },
  { key: 'search', labelKey: 'home.tile.search', icon: searchIcon },
  { key: 'anniversaries', labelKey: 'home.tile.anniversaries', icon: anniversaryIcon },
  { key: 'memos', labelKey: 'home.tile.memos', icon: memoIcon },
  { key: 'settings', labelKey: 'home.tile.settings', icon: settingsIcon },
];

export function HomeScreen({ userName, isGuest, onOpen }: Props) {
  const { t } = useI18n();
  const { topInset, bottomInset } = useScreenInsets();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sidePad = 22;
  const gap = 12;
  const tileWidth = Math.floor((width - sidePad * 2 - gap * 2) / 3);
  const greeting = userName?.trim()
    ? t('home.welcomeNamed', { name: userName.trim() })
    : isGuest
      ? t('home.guestUsing')
      : t('home.defaultGreeting');

  return (
    <View
      style={[
        styles.safe,
        { paddingTop: Math.max(topInset, insets.top) + 18, paddingBottom: bottomInset + 18 },
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.hero}>
          <Text style={styles.kicker}>PEDIGREE</Text>
          <Text style={styles.title}>{t('home.title')}</Text>
          <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
          <View style={styles.rule} />
          <Text style={styles.greeting}>{greeting}</Text>
        </View>
        <TrialExpiredBanner />

        <View style={[styles.grid, { paddingHorizontal: sidePad, gap }]}>
          {TILES.map(tile => (
            <Pressable
              key={tile.key}
              onPress={() => onOpen(tile.key)}
              style={({ pressed }) => [
                styles.tile,
                { width: tileWidth },
                pressed && styles.tilePressed,
              ]}
            >
              <View style={styles.iconWrap}>
                <Image source={tile.icon} style={styles.icon} resizeMode="contain" />
              </View>
              <Text style={styles.tileLabel}>{t(tile.labelKey)}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.credits}>
          <AppCredits compact />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f6f1e8',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  hero: {
    paddingHorizontal: 28,
    paddingTop: 28,
    alignItems: 'center',
  },
  kicker: {
    letterSpacing: 3.4,
    fontSize: 11,
    fontWeight: ui.weight.title,
    color: '#8a734c',
    marginBottom: 14,
  },
  title: {
    textAlign: 'center',
    color: '#1c2a3a',
    fontSize: 28,
    lineHeight: 38,
    fontWeight: ui.weight.heading,
  },
  subtitle: {
    marginTop: 12,
    color: '#7a8696',
    fontSize: 15,
    fontWeight: ui.weight.body,
  },
  rule: {
    marginTop: 18,
    width: 42,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#c4a574',
  },
  greeting: {
    marginTop: 14,
    color: '#5b6b80',
    fontSize: 13,
    fontWeight: ui.weight.body,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  tile: {
    backgroundColor: '#fffdf8',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    minHeight: 128,
    ...ui.shadow.float,
  },
  tilePressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    backgroundColor: '#f7f4ef',
  },
  icon: {
    width: 58,
    height: 58,
  },
  tileLabel: {
    color: '#1c2a3a',
    fontSize: 13,
    fontWeight: ui.weight.title,
    textAlign: 'center',
  },
  credits: {
    paddingTop: 8,
    paddingBottom: 6,
  },
});

