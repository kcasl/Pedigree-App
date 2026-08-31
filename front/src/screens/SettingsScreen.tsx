import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { ScreenHeader, useScreenInsets } from '../components/ScreenHeader';
import { AppCredits } from '../components/AppCredits';
import { API_BASE_URL } from '../config/api';
import { ENABLE_SERVER_SYNC } from '../config/features';
import { TrialExpiredBanner, useTrialLicense } from '../hooks/useTrialLicense';
import { LOCALES, LOCALE_NATIVE_LABEL, useI18n } from '../i18n';
import {
  clearNodeOffsets,
  clearPedigreePeople,
  loadPedigreeStore,
  savePedigreeStore,
} from '../storage/pedigreeStorage';
import {
  DEFAULT_APP_PREFS,
  loadAppPrefs,
  saveAppPrefs,
  type AppPrefs,
} from '../storage/appPrefs';
import { ui } from '../theme/ui';
import { nowIso } from '../utils/date';
import { rearrangePedigreeStore } from '../utils/rebasePedigree';
import { createDefaultStore } from '../utils/standardTemplate';
import { syncAllViews } from '../utils/viewSync';

export type AuthSession = {
  googleSub: string;
  accessToken?: string;
  email?: string;
  name?: string;
};

type Props = {
  auth?: AuthSession;
  onBack: () => void;
  onRequestLogout?: () => void | Promise<void>;
  onRequestSwitchAccount?: () => void | Promise<void>;
  onRequestLinkGoogle?: () => void | Promise<void>;
};

export function SettingsScreen({
  auth,
  onBack,
  onRequestLogout,
  onRequestSwitchAccount,
  onRequestLinkGoogle,
}: Props) {
  const { t, locale, setLocale } = useI18n();
  const { bottomInset } = useScreenInsets();
  const { guardWrite } = useTrialLicense();
  const [prefs, setPrefs] = useState<AppPrefs>({
    ...DEFAULT_APP_PREFS,
    localeChosen: true,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadAppPrefs().then(setPrefs);
  }, []);

  const updatePref = async <K extends keyof AppPrefs>(key: K, value: AppPrefs[K]) => {
    const next = { ...prefs, locale, localeChosen: true, [key]: value };
    setPrefs(next);
    await saveAppPrefs(next);
  };

  const rearrangePedigree = () => {
    if (!guardWrite()) return;
    Alert.alert(
      t('settings.rearrange'),
      t('settings.rearrangeConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.rearrange'),
          onPress: async () => {
            setBusy(true);
            try {
              const store = await loadPedigreeStore();
              if (!store) {
                Alert.alert(t('settings.rearrangeFailTitle'), t('settings.rearrangeFailBody'));
                return;
              }
              const next = rearrangePedigreeStore(store);
              await savePedigreeStore(next);
              await clearNodeOffsets();
              Alert.alert(t('settings.rearrangeDoneTitle'), t('settings.rearrangeDoneBody'));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const resetPedigree = () => {
    if (!guardWrite()) return;
    Alert.alert(t('settings.reset'), t('settings.resetConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.reset'),
        style: 'destructive',
        onPress: async () => {
            setBusy(true);
            try {
              const initial = syncAllViews(createDefaultStore(nowIso()));
              await clearPedigreePeople();
              await clearNodeOffsets();
              await savePedigreeStore(initial);
            if (ENABLE_SERVER_SYNC && auth?.googleSub && auth.accessToken) {
              try {
                await fetch(`${API_BASE_URL}/v1/pedigree/${encodeURIComponent(auth.googleSub)}`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${auth.accessToken}` },
                });
              } catch {
                // 오프라인이면 로컬만 초기화
              }
            }
            Alert.alert(t('settings.resetDoneTitle'), t('settings.resetDoneBody'));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const askSwitchAccount = async () => {
    if (!onRequestSwitchAccount) return;
    try {
      await onRequestSwitchAccount();
    } catch {
      Alert.alert(t('settings.switchFailTitle'), t('settings.switchFailBody'));
    }
  };

  const askLogout = async () => {
    if (!onRequestLogout) return;
    Alert.alert(t('settings.logoutConfirmTitle'), t('settings.logoutConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.logout'),
        style: 'destructive',
        onPress: async () => {
          try {
            await onRequestLogout();
          } catch {
            Alert.alert(t('settings.logoutFailTitle'), t('settings.logoutFailBody'));
          }
        },
      },
    ]);
  };

  const askLinkGoogle = async () => {
    if (!onRequestLinkGoogle) return;
    try {
      await onRequestLinkGoogle();
    } catch {
      Alert.alert(t('settings.linkFailTitle'), t('settings.linkFailBody'));
    }
  };

  return (
    <View style={[styles.safe, { paddingBottom: bottomInset }]}>
      <ScreenHeader title={t('settings.title')} subtitle={t('settings.subtitle')} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.body}>
        <TrialExpiredBanner />
        <Text style={styles.section}>{t('settings.sectionAccount')}</Text>
        {auth?.googleSub ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {auth.name?.trim() ? auth.name : auth.email ?? auth.googleSub}
            </Text>
            <Text style={styles.cardDesc}>{auth.email ?? auth.googleSub}</Text>
            <Pressable style={styles.action} onPress={askSwitchAccount}>
              <Text style={styles.actionText}>{t('settings.googleSwitch')}</Text>
            </Pressable>
            <Pressable style={styles.action} onPress={askLogout}>
              <Text style={styles.actionText}>{t('settings.logout')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('settings.guestMode')}</Text>
            <Text style={styles.cardDesc}>{t('settings.guestDesc')}</Text>
            <Pressable style={styles.action} onPress={askLinkGoogle}>
              <Text style={styles.actionText}>{t('settings.linkGoogle')}</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.section}>{t('settings.sectionLanguage')}</Text>
        <View style={styles.card}>
          <View style={styles.langRow}>
            {LOCALES.map(code => {
              const active = locale === code;
              return (
                <Pressable
                  key={code}
                  style={[styles.langChip, active && styles.langChipActive]}
                  onPress={() => setLocale(code)}
                >
                  <Text style={[styles.langChipText, active && styles.langChipTextActive]}>
                    {LOCALE_NATIVE_LABEL[code]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>{t('settings.languageHint')}</Text>
        </View>

        <Text style={styles.section}>{t('settings.sectionPedigree')}</Text>
        <View style={styles.card}>
          <Pressable style={styles.action} disabled={busy} onPress={rearrangePedigree}>
            <Text style={styles.actionText}>{t('settings.rearrange')}</Text>
          </Pressable>
            <Text style={styles.hint}>{t('settings.rearrangeHint')}</Text>
          <Pressable
            style={[styles.action, styles.dangerAction]}
            disabled={busy}
            onPress={resetPedigree}
          >
            <Text style={[styles.actionText, styles.dangerText]}>{t('settings.reset')}</Text>
          </Pressable>
        </View>

        <Text style={styles.section}>{t('settings.sectionDisplay')}</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.cardTitle}>{t('settings.hideEmptyTitle')}</Text>
              <Text style={styles.hint}>{t('settings.hideEmptyHint')}</Text>
            </View>
            <Switch
              value={prefs.hideEmptyPeopleInSearch}
              onValueChange={value => updatePref('hideEmptyPeopleInSearch', value)}
              trackColor={{ true: ui.color.accent }}
            />
          </View>
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.cardTitle}>{t('settings.showPhoneTitle')}</Text>
              <Text style={styles.hint}>{t('settings.showPhoneHint')}</Text>
            </View>
            <Switch
              value={prefs.showPhoneOnAnniversaries}
              onValueChange={value => updatePref('showPhoneOnAnniversaries', value)}
              trackColor={{ true: ui.color.accent }}
            />
          </View>
        </View>

        <Text style={styles.section}>{t('settings.sectionHelp')}</Text>
        <View style={styles.card}>
          <Text style={styles.cardDesc}>{t('settings.help1')}</Text>
          <Text style={styles.cardDesc}>{t('settings.help2')}</Text>
          <Text style={styles.cardDesc}>{t('settings.help3')}</Text>
          <Text style={styles.cardDesc}>{t('settings.help4')}</Text>
        </View>

        <Text style={styles.section}>{t('settings.sectionApp')}</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('settings.appName')}</Text>
          <Text style={styles.cardDesc}>{t('settings.appVersion')}</Text>
          <AppCredits align="start" />
          <Text style={styles.hint}>
            {ENABLE_SERVER_SYNC ? t('settings.syncOn') : t('settings.syncOff')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f7f4ef',
  },
  body: {
    padding: 16,
    gap: 10,
    paddingBottom: 36,
  },
  section: {
    marginTop: 8,
    color: ui.color.textMuted,
    fontSize: 12,
    fontWeight: ui.weight.title,
    letterSpacing: 0.4,
  },
  card: {
    backgroundColor: ui.color.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ui.color.borderLight,
    padding: 14,
    gap: 10,
    ...ui.shadow.card,
  },
  cardTitle: {
    color: ui.color.text,
    fontSize: 15,
    fontWeight: ui.weight.title,
  },
  cardDesc: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: ui.weight.body,
    lineHeight: 19,
  },
  hint: {
    color: ui.color.textMuted,
    fontSize: 12,
    fontWeight: ui.weight.body,
    lineHeight: 17,
  },
  action: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.color.border,
    backgroundColor: ui.color.surfaceMuted,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionText: {
    color: ui.color.text,
    fontSize: 14,
    fontWeight: ui.weight.title,
  },
  dangerAction: {
    backgroundColor: ui.color.dangerBg,
    borderColor: ui.color.dangerBorder,
  },
  dangerText: {
    color: ui.color.danger,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toggleText: {
    flex: 1,
    gap: 4,
  },
  langRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  langChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ui.color.border,
    backgroundColor: ui.color.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  langChipActive: {
    borderColor: ui.color.accent,
    backgroundColor: ui.color.accentBg,
  },
  langChipText: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: ui.weight.title,
  },
  langChipTextActive: {
    color: ui.color.accentDark,
  },
});
