import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { AnniversaryScreen } from './AnniversaryScreen';
import { ContactsScreen } from './ContactsScreen';
import { FamilySearchScreen } from './FamilySearchScreen';
import { HomeScreen, type HomeDestination } from './HomeScreen';
import { MemoScreen } from './MemoScreen';
import { PedigreeScreen } from './PedigreeScreen';
import { SettingsScreen, type AuthSession } from './SettingsScreen';
import { ui } from '../theme/ui';
import { useI18n } from '../i18n';

type Route = 'home' | HomeDestination;

type Props = {
  auth?: AuthSession;
  isGuest?: boolean;
  onRequestLogout?: () => void | Promise<void>;
  onRequestSwitchAccount?: () => void | Promise<void>;
  onRequestLinkGoogle?: () => void | Promise<void>;
};

const EXIT_HINT_MS = 2000;

export function AuthenticatedApp({
  auth,
  isGuest,
  onRequestLogout,
  onRequestSwitchAccount,
  onRequestLinkGoogle,
}: Props) {
  const { t } = useI18n();
  const [route, setRoute] = useState<Route>('home');
  const [exitHintVisible, setExitHintVisible] = useState(false);
  const lastHomeBackAt = useRef(0);
  const goHome = () => setRoute('home');

  useEffect(() => {
    const onHardwareBack = () => {
      if (route === 'pedigree') {
        return false;
      }
      if (route !== 'home') {
        setRoute('home');
        setExitHintVisible(false);
        lastHomeBackAt.current = 0;
        return true;
      }
      const now = Date.now();
      if (now - lastHomeBackAt.current < EXIT_HINT_MS) {
        lastHomeBackAt.current = 0;
        return false;
      }
      lastHomeBackAt.current = now;
      setExitHintVisible(true);
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [route]);

  useEffect(() => {
    if (!exitHintVisible) return undefined;
    const timer = setTimeout(() => setExitHintVisible(false), EXIT_HINT_MS);
    return () => clearTimeout(timer);
  }, [exitHintVisible]);

  if (route === 'pedigree') {
    return (
      <PedigreeScreen
        auth={auth}
        onBack={goHome}
        onRequestLogout={onRequestLogout}
        onRequestSwitchAccount={onRequestSwitchAccount}
        onRequestLinkGoogle={onRequestLinkGoogle}
      />
    );
  }
  if (route === 'contacts') return <ContactsScreen onBack={goHome} />;
  if (route === 'search') return <FamilySearchScreen onBack={goHome} />;
  if (route === 'anniversaries') return <AnniversaryScreen onBack={goHome} />;
  if (route === 'memos') return <MemoScreen onBack={goHome} />;
  if (route === 'settings') {
    return (
      <SettingsScreen
        auth={auth}
        onBack={goHome}
        onRequestLogout={onRequestLogout}
        onRequestSwitchAccount={onRequestSwitchAccount}
        onRequestLinkGoogle={onRequestLinkGoogle}
      />
    );
  }

  return (
    <View style={styles.root}>
      <HomeScreen
        userName={auth?.name ?? auth?.email}
        isGuest={isGuest}
        onOpen={setRoute}
      />
      {exitHintVisible ? (
        <View style={styles.exitHintWrap} pointerEvents="none">
          <View style={styles.exitHint}>
            <Text style={styles.exitHintText}>{t('home.exitHint')}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  exitHintWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 48,
  },
  exitHint: {
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    maxWidth: '86%',
  },
  exitHintText: {
    color: ui.color.surface,
    fontSize: 14,
    fontWeight: ui.weight.title,
    textAlign: 'center',
  },
});
