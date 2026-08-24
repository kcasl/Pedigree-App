import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ui } from '../theme/ui';
import { useI18n } from '../i18n';
import {
  ensureTrialStartedAt,
  isTrialExpired,
  notifyTrialLocked,
} from '../storage/trialLicense';

type TrialLicenseValue = {
  ready: boolean;
  expired: boolean;
  startedAt: string | null;
  guardWrite: () => boolean;
};

const TrialLicenseContext = createContext<TrialLicenseValue>({
  ready: false,
  expired: false,
  startedAt: null,
  guardWrite: () => true,
});

export function TrialLicenseProvider({ children }: { children: React.ReactNode }) {
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void ensureTrialStartedAt()
      .then(value => {
        if (!mounted) return;
        setStartedAt(value);
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<TrialLicenseValue>(() => {
    const expired = startedAt ? isTrialExpired(startedAt) : false;
    return {
      ready,
      expired,
      startedAt,
      guardWrite: () => {
        if (!expired) return true;
        notifyTrialLocked();
        return false;
      },
    };
  }, [ready, startedAt]);

  return <TrialLicenseContext.Provider value={value}>{children}</TrialLicenseContext.Provider>;
}

export function useTrialLicense(): TrialLicenseValue {
  return useContext(TrialLicenseContext);
}

export function TrialExpiredBanner({ compact }: { compact?: boolean }) {
  const { expired } = useTrialLicense();
  const { t } = useI18n();
  if (!expired) return null;
  return (
    <View style={[styles.banner, compact && styles.bannerCompact]}>
      <Text style={[styles.bannerText, compact && styles.bannerTextCompact]}>
        {t('trial.message')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: ui.color.dangerBg,
    borderColor: ui.color.dangerBorder,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  bannerCompact: {
    marginBottom: 8,
    paddingVertical: 8,
    borderRadius: 10,
  },
  bannerText: {
    color: ui.color.danger,
    fontSize: 13,
    fontWeight: ui.weight.label,
    lineHeight: 18,
  },
  bannerTextCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
});
