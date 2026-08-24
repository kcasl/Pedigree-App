import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AddPersonModal } from '../components/AddPersonModal';
import { ContactDirectoryModal } from '../components/ContactDirectoryModal';
import { PersonDetailModal } from '../components/PersonDetailModal';
import { EdgeLines } from '../components/EdgeLines';
import { DraggablePersonNode } from '../components/DraggablePersonNode';
import type { ParentType, Person, PersonId } from '../types/pedigree';
import { API_BASE_URL } from '../config/api';
import { ENABLE_PEDIGREE_SHARE, ENABLE_SERVER_SYNC } from '../config/features';
import { TrialExpiredBanner, useTrialLicense } from '../hooks/useTrialLicense';
import type { ActiveView, PedigreeStore } from '../types/lineage';
import { ACTIVE_VIEW_BG } from '../types/lineage';
import {
  clearNodeOffsets,
  clearPedigreePeople,
  loadPedigreeStore,
  parseStoredPeople,
  savePedigreeStore,
} from '../storage/pedigreeStorage';
import { nowIso } from '../utils/date';
import {
  buildViewKinshipLabels,
  buildViewOrdinalLabels,
  canAddSiblingFromNode,
  nextEmptySiblingSlotId,
  resolveParentAdd,
  resolveSiblingAdd,
  syncAllViews,
  syncStoreAfterEdit,
} from '../utils/viewSync';
import { mergePedigreeStoresPreferLocalUserData } from '../utils/personPersist';
import { kinshipLabelToDisplayName } from '../utils/kinship';
import { buildContactDirectoryEntries } from '../utils/contactDirectory';
import { exportPedigreeShare, fetchPedigreeShare, hydrateImportedPedigreeStore } from '../utils/pedigreeShare';
import { rearrangePedigreeStore } from '../utils/rebasePedigree';
import { normalizePhoneDigits, openPhoneDialer } from '../utils/phone';
import { openSmsComposer } from '../utils/sms';
import {
  createDefaultStore,
  migrateLegacyToStore,
  reconcileStore,
  SELF_SLOT_INDEX,
  slotIdsForView,
} from '../utils/standardTemplate';
import { buildStandardPedigreeLayout } from '../utils/standardLayout';
import type { PositionedNode } from '../utils/pedigreeLayout';
import { ui } from '../theme/ui';
import { useResponsive } from '../theme/responsive';
import { useCurrentDate } from '../hooks/useCurrentDate';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';
import pako from 'pako';
import { Buffer } from 'buffer';

type PendingAdd =
  | { kind: 'parent'; childId: PersonId; parentType: ParentType }
  | { kind: 'sibling'; ofId: PersonId }
  | { kind: 'child'; parentId: PersonId }
  | { kind: 'spouse'; ofId: PersonId };

type AuthSession = {
  googleSub: string;
  accessToken?: string;
  email?: string;
  name?: string;
};

type Props = {
  auth?: AuthSession;
  onBack?: () => void;
  onRequestLogout?: () => void | Promise<void>;
  onRequestSwitchAccount?: () => void | Promise<void>;
  onRequestLinkGoogle?: () => void | Promise<void>;
};

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';
type PendingPatchPayload = {
  compressed: true;
  payload_b64: string;
};

function createInitialStore(): PedigreeStore {
  return createDefaultStore(nowIso());
}

function inferParentRole(
  next: Record<PersonId, Person>,
  parentId: PersonId,
  spouseId?: PersonId,
): ParentType {
  const parent = next[parentId];
  if (parent?.gender === 'male') return 'father';
  if (parent?.gender === 'female') return 'mother';
  const spouse = spouseId ? next[spouseId] : undefined;
  if (spouse?.gender === 'male') return 'mother';
  if (spouse?.gender === 'female') return 'father';

  const hasFatherLink = Object.values(next).some(p => p.fatherId === parentId);
  if (hasFatherLink) return 'father';
  const hasMotherLink = Object.values(next).some(p => p.motherId === parentId);
  if (hasMotherLink) return 'mother';

  return 'father';
}

function useScreenInsets() {
  const insets = useSafeAreaInsets();
  const statusBarHeight = StatusBar.currentHeight ?? 24;
  const topInset =
    Platform.OS === 'android'
      ? Math.min(insets.top, statusBarHeight)
      : insets.top;
  return { topInset, bottomInset: insets.bottom };
}

export function PedigreeScreen({
  auth,
  onBack,
  onRequestLogout,
  onRequestSwitchAccount,
  onRequestLinkGoogle,
}: Props) {
  const { t, displayKinship } = useI18n();
  const { topInset, bottomInset } = useScreenInsets();
  const today = useCurrentDate();
  const { rs, layoutBase, height: windowHeight, uiScale } = useResponsive();
  const actionSheetMaxHeight = useMemo(
    () => Math.round(windowHeight * 0.82) - topInset,
    [windowHeight, topInset],
  );
  const scaledUi = useMemo(
    () => ({
      header: {
        paddingHorizontal: rs(12),
        paddingTop: rs(4),
        paddingBottom: rs(4),
      },
      headerTitle: { fontSize: rs(18) },
      viewBadge: {
        marginTop: rs(2),
        paddingHorizontal: rs(8),
        paddingVertical: rs(3),
        borderRadius: rs(6),
        fontSize: rs(11),
      },
      headerTopRow: { gap: rs(8) },
      headerActions: { gap: rs(4) },
      headerActionColumn: { gap: rs(4) },
      selfReturnBtn: {
        borderRadius: rs(8),
        paddingHorizontal: rs(8),
        paddingVertical: rs(5),
      },
      selfReturnBtnText: { fontSize: rs(11) },
      settingsBtn: {
        borderRadius: rs(8),
        paddingHorizontal: rs(8),
        paddingVertical: rs(5),
      },
      settingsBtnText: { fontSize: rs(11) },
      syncText: { marginTop: rs(2), fontSize: rs(11) },
      loadingWrap: { gap: rs(10) },
      loadingText: { fontSize: rs(14) },
      zoomBox: { right: rs(16), bottom: rs(18), gap: rs(10) },
      zoomBtn: {
        width: rs(44),
        height: rs(44),
        borderRadius: rs(22),
      },
      zoomCenterBtn: {
        width: rs(56),
        height: rs(44),
        paddingHorizontal: rs(8),
        borderRadius: rs(22),
      },
      zoomText: { fontSize: rs(20), marginTop: rs(-2) },
      zoomCenterText: { fontSize: rs(12), marginTop: 0 },
      sheet: {
        borderTopLeftRadius: rs(20),
        borderTopRightRadius: rs(20),
        maxHeight: actionSheetMaxHeight,
        paddingHorizontal: rs(12),
        paddingTop: rs(12),
        paddingBottom: Math.max(bottomInset, rs(10)),
      },
      sheetScrollContent: {
        gap: rs(7),
        paddingBottom: rs(4),
      },
      sheetTitle: { fontSize: rs(14) },
      sheetHeaderRow: { gap: rs(8), marginBottom: rs(4) },
      sheetHeaderActions: { gap: rs(6) },
      sheetContactBtn: {
        gap: rs(3),
        paddingHorizontal: rs(8),
        paddingVertical: rs(6),
        borderRadius: rs(8),
      },
      sheetContactIcon: { fontSize: rs(14) },
      sheetContactLabel: { fontSize: rs(11) },
      sheetItem: {
        borderRadius: rs(10),
        paddingVertical: rs(10),
        paddingHorizontal: rs(11),
      },
      sheetItemText: { fontSize: rs(13) },
      lineageSwitchText: { fontSize: rs(13) },
      sheetHint: { fontSize: rs(11), marginTop: rs(-2), marginBottom: rs(0) },
      settingsSheet: {
        marginHorizontal: rs(16),
        marginTop: rs(120),
        borderRadius: rs(16),
        padding: rs(16),
        gap: rs(8),
      },
      settingsTitle: { fontSize: rs(16), marginBottom: rs(6) },
      settingsDesc: { fontSize: rs(13) },
      settingsSubDesc: { fontSize: rs(12), marginBottom: rs(8) },
      settingsActionBtn: {
        marginTop: rs(6),
        borderRadius: rs(10),
        paddingHorizontal: rs(10),
        paddingVertical: rs(11),
      },
      settingsActionText: { fontSize: rs(13) },
      settingsCloseBtn: {
        marginTop: rs(10),
        borderRadius: rs(10),
        paddingVertical: rs(12),
      },
      settingsCloseBtnText: { fontSize: rs(14) },
    }),
    [rs, bottomInset, actionSheetMaxHeight],
  );
  const [store, setStore] = useState<PedigreeStore>(createInitialStore);
  const { expired: writeLocked, guardWrite } = useTrialLicense();
  const activeView = store.activeView;
  const peopleById = store.views[activeView];
  const slots = useMemo(() => slotIdsForView(activeView), [activeView]);
  const self = peopleById[slots.selfId];

  const updateActiveViewPeople = (
    updater: (prev: Record<PersonId, Person>) => Record<PersonId, Person>,
  ) => {
    setStore(prev =>
      syncStoreAfterEdit(prev, prev.activeView, updater(prev.views[prev.activeView])),
    );
  };

  const switchLineageView = (view: ActiveView) => {
    const nextSlots = slotIdsForView(view);
    setStore(prev => syncAllViews({ ...prev, activeView: view }));
    setSelectedId(nextSlots.selfId);
    setActionVisible(false);
  };

  const switchToSelfView = () => switchLineageView('self');

  const [selectedId, setSelectedId] = useState<PersonId>('me_sib2');
  const selected = peopleById[selectedId];
  const [isHydrated, setIsHydrated] = useState(false);
  const [localSaveStatus, setLocalSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const remoteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedPeopleRef = useRef<Record<PersonId, Person>>({});
  const deletedIdsRef = useRef<Set<PersonId>>(new Set());
  const queueRef = useRef<PendingPatchPayload[]>([]);
  const isFlushingRef = useRef(false);
  const legacyQueueStorageKey = useMemo(
    () => (auth?.googleSub ? `pedigree.queue.${auth.googleSub}.v1` : 'pedigree.queue.guest.v1'),
    [auth?.googleSub],
  );

  const [actionVisible, setActionVisible] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const [editingId, setEditingId] = useState<PersonId | null>(null);
  const [editSection, setEditSection] = useState<'info' | 'photo'>('info');
  const [detailId, setDetailId] = useState<PersonId | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [contactsVisible, setContactsVisible] = useState(false);
  const [usageVisible, setUsageVisible] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [importKey, setImportKey] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportedKey, setExportedKey] = useState<string | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  const selectedDetail = detailId ? peopleById[detailId] : undefined;

  const persistQueue = async () => {
    if (!ENABLE_SERVER_SYNC) return;
    try {
      await AsyncStorage.setItem(legacyQueueStorageKey, JSON.stringify(queueRef.current));
    } catch {
      // 큐 저장 실패는 치명적이지 않으므로 무시
    }
  };

  const flushQueue = async () => {
    if (!ENABLE_SERVER_SYNC) return;
    if (!auth?.googleSub || !auth.accessToken) return;
    if (isFlushingRef.current) return;
    if (queueRef.current.length === 0) {
      setSyncStatus('synced');
      return;
    }

    isFlushingRef.current = true;
    setSyncStatus('syncing');
    try {
      while (queueRef.current.length > 0) {
        const head = queueRef.current[0];
        const res = await fetch(`${API_BASE_URL}/v1/pedigree/${encodeURIComponent(auth.googleSub)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth.accessToken}`,
          },
          body: JSON.stringify(head),
        });
        if (!res.ok) {
          setSyncStatus(res.status >= 500 ? 'offline' : 'error');
          break;
        }
        queueRef.current.shift();
        await persistQueue();
      }
      if (queueRef.current.length === 0) {
        setSyncStatus('synced');
      }
    } catch {
      setSyncStatus('offline');
    } finally {
      isFlushingRef.current = false;
    }
  };

  useEffect(() => {
    let mounted = true;
    const hydrate = async () => {
      try {
        const localStore = await loadPedigreeStore();
        if (mounted && localStore) {
          const synced = syncAllViews(localStore);
          setStore(synced);
          lastSyncedPeopleRef.current = synced.views[synced.activeView];
          setSelectedId(slotIdsForView(synced.activeView).selfId);
        } else if (mounted) {
          const initial = syncAllViews(createInitialStore());
          setStore(initial);
          lastSyncedPeopleRef.current = initial.views[initial.activeView];
        }

        if (ENABLE_SERVER_SYNC) {
          const queueRaw = await AsyncStorage.getItem(legacyQueueStorageKey);
          if (queueRaw) {
            const parsedQueue = JSON.parse(queueRaw) as PendingPatchPayload[];
            if (Array.isArray(parsedQueue)) {
              queueRef.current = parsedQueue.filter(
                item => item?.compressed === true && typeof item.payload_b64 === 'string',
              );
            }
          } else {
            queueRef.current = [];
          }
        }
      } catch (err) {
        console.warn('[PedigreeScreen] hydrate failed', err);
        if (mounted) {
          const retry = await loadPedigreeStore().catch(() => null);
          if (retry) {
            const synced = syncAllViews(retry);
            setStore(synced);
            lastSyncedPeopleRef.current = synced.views[synced.activeView];
            setSelectedId(slotIdsForView(synced.activeView).selfId);
          }
        }
      }

      if (ENABLE_SERVER_SYNC && auth?.googleSub && auth.accessToken) {
        try {
          setSyncStatus('syncing');
          const res = await fetch(`${API_BASE_URL}/v1/pedigree/${encodeURIComponent(auth.googleSub)}`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${auth.accessToken}`,
            },
          });
          if (res.ok) {
            const data = (await res.json()) as { people_by_id?: Record<PersonId, Person> };
            const remotePeopleRaw = data.people_by_id ?? {};
            const remotePeople = parseStoredPeople(JSON.stringify(remotePeopleRaw));
            const localStore = await loadPedigreeStore();
            if (mounted && remotePeople) {
              const remoteStore = syncAllViews(
                reconcileStore(migrateLegacyToStore(remotePeople)),
              );
              const merged = localStore
                ? syncAllViews(
                    reconcileStore(
                      mergePedigreeStoresPreferLocalUserData(localStore, remoteStore),
                    ),
                  )
                : remoteStore;
              setStore(merged);
              lastSyncedPeopleRef.current = merged.views[merged.activeView];
              await savePedigreeStore(merged);
            } else if (mounted && !localStore) {
              const initial = syncAllViews(createInitialStore());
              setStore(initial);
              lastSyncedPeopleRef.current = initial.views[initial.activeView];
              lastSyncedPeopleRef.current = initial.views.paternal;
            }
            if (mounted) setSyncStatus('synced');
          } else if (mounted) {
            setSyncStatus('error');
          }
        } catch {
          if (mounted) setSyncStatus('offline');
        }
      }
      if (mounted) setIsHydrated(true);
    };
    hydrate();
    return () => {
      mounted = false;
    };
  }, [auth?.accessToken, auth?.googleSub, legacyQueueStorageKey]);

  useEffect(() => {
    if (!isHydrated) return;
    savePedigreeStore(store)
      .then(() => {
        setLocalSaveStatus('saved');
      })
      .catch(() => {
        setLocalSaveStatus('error');
      });
  }, [isHydrated, store]);

  useEffect(() => {
    if (!ENABLE_SERVER_SYNC) return;
    if (!isHydrated) return;
    if (!auth?.googleSub || !auth.accessToken) return;

    if (remoteSaveTimer.current) {
      clearTimeout(remoteSaveTimer.current);
    }
    remoteSaveTimer.current = setTimeout(() => {
      setSyncStatus('syncing');
      const lastSynced = lastSyncedPeopleRef.current;
      const upserts: Record<PersonId, Person> = {};
      const deletes = Array.from(deletedIdsRef.current);

      for (const [id, person] of Object.entries(peopleById)) {
        const prev = lastSynced[id];
        if (!prev || JSON.stringify(prev) !== JSON.stringify(person)) {
          upserts[id] = person;
        }
      }

      for (const prevId of Object.keys(lastSynced)) {
        if (!peopleById[prevId] && !deletes.includes(prevId)) {
          deletes.push(prevId);
        }
      }

      if (Object.keys(upserts).length === 0 && deletes.length === 0) {
        setSyncStatus('synced');
        return;
      }

      const gz = pako.gzip(JSON.stringify({ upserts, deletes }));
      const payloadB64 = Buffer.from(gz).toString('base64');
      const nextPatch: PendingPatchPayload = {
        compressed: true,
        payload_b64: payloadB64,
      };

      queueRef.current.push(nextPatch);
      // 큐에 담은 시점을 기준으로 다음 diff를 계산하도록 기준점 갱신
      lastSyncedPeopleRef.current = peopleById;
      deletedIdsRef.current.clear();
      persistQueue().finally(() => {
        flushQueue();
      });
    }, 900);

    return () => {
      if (remoteSaveTimer.current) clearTimeout(remoteSaveTimer.current);
    };
  }, [auth?.accessToken, auth?.googleSub, isHydrated, peopleById]);

  useEffect(() => {
    if (!ENABLE_SERVER_SYNC) return;
    if (!isHydrated) return;
    if (!auth?.googleSub || !auth.accessToken) return;
    if (queueRef.current.length === 0) return;
    flushQueue();
  }, [auth?.accessToken, auth?.googleSub, isHydrated]);

  const deletePerson = (id: PersonId) => {
    if (!guardWrite()) return;
    if (id === slots.selfId) return;
    updateActiveViewPeople(prev => {
      if (!prev[id]) return prev;
      const next: Record<PersonId, Person> = { ...prev };
      delete next[id];
      deletedIdsRef.current.add(id);
      // detach links from remaining people
      for (const p of Object.values(next)) {
        if (p.fatherId === id) p.fatherId = undefined;
        if (p.motherId === id) p.motherId = undefined;
        if (p.spouseId === id) p.spouseId = undefined;
      }
      return { ...next };
    });
  };

  const layout = useMemo(() => {
    try {
      return buildStandardPedigreeLayout(peopleById, {
        ...layoutBase,
        view: activeView,
      });
    } catch (error) {
      console.warn('[PedigreeScreen] layout failed', error);
      const slots = slotIdsForView(activeView);
      return {
        canvasWidth: 1600,
        canvasHeight: 1200,
        nodes: [],
        edges: [],
        nodeById: {},
        selfId: slots.selfId,
        highlightIds: new Set<PersonId>([slots.selfId]),
      };
    }
  }, [peopleById, activeView, layoutBase]);

  const displayLayout = useMemo(() => {
    const nodeById: Record<PersonId, PositionedNode> = {};
    const nodes: PositionedNode[] = [];
    for (const n of layout.nodes) {
      if (
        !Number.isFinite(n.x) ||
        !Number.isFinite(n.y) ||
        !Number.isFinite(n.width) ||
        !Number.isFinite(n.height)
      ) {
        continue;
      }
      if (nodeById[n.id]) continue;
      const next = {
        ...n,
        x: Math.round(n.x),
        y: Math.round(n.y),
      };
      nodeById[n.id] = next;
      nodes.push(next);
    }
    const canvasWidth = Number.isFinite(layout.canvasWidth) ? layout.canvasWidth : 1600;
    const canvasHeight = Number.isFinite(layout.canvasHeight) ? layout.canvasHeight : 1200;
    return { ...layout, nodes, nodeById, canvasWidth, canvasHeight };
  }, [layout]);

  const minGeneration = useMemo(() => {
    if (!displayLayout.nodes.length) return 0;
    return displayLayout.nodes.reduce(
      (min, node) => Math.min(min, node.generation),
      displayLayout.nodes[0]!.generation,
    );
  }, [displayLayout.nodes]);

  const spousePairs = useMemo(() => {
    const pairs: Array<{ aId: PersonId; bId: PersonId }> = [];
    const seen = new Set<string>();
    for (const p of Object.values(peopleById)) {
      if (!p.spouseId) continue;
      const a = p.id < p.spouseId ? p.id : p.spouseId;
      const b = p.id < p.spouseId ? p.spouseId : p.id;
      const key = `${a}__${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ aId: a, bId: b });
    }
    return pairs;
  }, [peopleById]);

  const contactEntries = useMemo(() => buildContactDirectoryEntries(store), [store]);

  const kinshipLabelById = useMemo(
    () => buildViewKinshipLabels(activeView, peopleById, store.views.self),
    [peopleById, activeView, store.views.self],
  );

  const ordinalLabelById = useMemo(
    () => buildViewOrdinalLabels(activeView, peopleById),
    [peopleById, activeView],
  );

  const MIN_SCALE = 0.25;
  const MAX_SCALE = 2.8;
  const clampScaleOnJs = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));

  const scale = useSharedValue(0.9);
  const savedScale = useSharedValue(0.9);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const displayLayoutRef = useRef(displayLayout);
  displayLayoutRef.current = displayLayout;
  const stageSizeRef = useRef(stageSize);
  stageSizeRef.current = stageSize;

  const centerOnPedigree = useCallback((animated = true) => {
    const sw = stageSizeRef.current.width;
    const sh = stageSizeRef.current.height;
    if (sw <= 0 || sh <= 0) return;

    const layout = displayLayoutRef.current;
    const cw = layout.canvasWidth;
    const ch = layout.canvasHeight;
    if (!Number.isFinite(cw) || !Number.isFinite(ch) || cw <= 0 || ch <= 0) return;

    const focal = layout.nodeById[layout.selfId];
    const focusX = focal ? focal.x + focal.width / 2 : cw / 2;
    const focusY = focal ? focal.y + focal.height / 2 : ch / 2;
    if (!Number.isFinite(focusX) || !Number.isFinite(focusY)) return;

    const pad = 28;
    const fit = Math.min(
      (sw - pad * 2) / Math.max(cw, 1),
      (sh - pad * 2) / Math.max(ch, 1),
      0.95,
    );
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.max(fit, 0.4)));
    // RN 기본 scale 기준점(center)에 맞춘 translate
    const nextX = sw / 2 - cw / 2 - (focusX - cw / 2) * nextScale;
    const nextY = sh / 2 - ch / 2 - (focusY - ch / 2) * nextScale;
    if (![nextX, nextY, nextScale].every(Number.isFinite)) return;

    if (animated) {
      scale.value = withTiming(nextScale, { duration: 180 });
      translateX.value = withTiming(nextX, { duration: 180 });
      translateY.value = withTiming(nextY, { duration: 180 });
    } else {
      scale.value = nextScale;
      translateX.value = nextX;
      translateY.value = nextY;
    }
    savedScale.value = nextScale;
    savedX.value = nextX;
    savedY.value = nextY;
  }, [savedScale, savedX, savedY, scale, translateX, translateY]);

  const recenterCurrentView = () => {
    centerOnPedigree(true);
  };

  useEffect(() => {
    const onHardwareBack = () => {
      if (actionVisible) {
        setActionVisible(false);
        return true;
      }
      if (pendingAdd) {
        setPendingAdd(null);
        return true;
      }
      if (editingId) {
        setEditingId(null);
        return true;
      }
      if (detailId) {
        setDetailId(null);
        return true;
      }
      if (settingsVisible) {
        setSettingsVisible(false);
        return true;
      }
      if (contactsVisible) {
        setContactsVisible(false);
        return true;
      }
      if (usageVisible) {
        setUsageVisible(false);
        return true;
      }
      if (importVisible && !importBusy) {
        setImportVisible(false);
        return true;
      }
      if (exportedKey) {
        setExportedKey(null);
        return true;
      }
      if (onBack) {
        onBack();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [
    actionVisible,
    pendingAdd,
    editingId,
    detailId,
    settingsVisible,
    contactsVisible,
    usageVisible,
    importVisible,
    importBusy,
    exportedKey,
    onBack,
  ]);

  useEffect(() => {
    if (!isHydrated) return;
    if (stageSize.width <= 0 || stageSize.height <= 0) return;
    const timer = setTimeout(() => {
      centerOnPedigree(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [activeView, centerOnPedigree, isHydrated, stageSize.height, stageSize.width]);

  const onStageLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setStageSize(prev =>
      prev.width === width && prev.height === height ? prev : { width, height },
    );
  };

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          savedScale.value = scale.value;
        })
        .onUpdate(e => {
          scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * e.scale));
        }),
    [savedScale, scale],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(1)
        .minDistance(4)
        .averageTouches(true)
        .onBegin(() => {
          savedX.value = translateX.value;
          savedY.value = translateY.value;
        })
        .onUpdate(e => {
          translateX.value = savedX.value + e.translationX;
          translateY.value = savedY.value + e.translationY;
        }),
    [savedX, savedY, translateX, translateY],
  );

  const composed = useMemo(() => Gesture.Simultaneous(pinch, pan), [pinch, pan]);

  const canvasStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const zoomBy = (factor: number) => {
    const next = clampScaleOnJs(scale.value * factor);
    const sw = stageSize.width;
    const sh = stageSize.height;
    const cw = displayLayout.canvasWidth;
    const ch = displayLayout.canvasHeight;
    if (sw > 0 && sh > 0 && cw > 0 && ch > 0) {
      const cx = sw / 2;
      const cy = sh / 2;
      const worldX = (cx - translateX.value - cw / 2) / scale.value + cw / 2;
      const worldY = (cy - translateY.value - ch / 2) / scale.value + ch / 2;
      const nextX = cx - cw / 2 - (worldX - cw / 2) * next;
      const nextY = cy - ch / 2 - (worldY - ch / 2) * next;
      if ([nextX, nextY].every(Number.isFinite)) {
        scale.value = withTiming(next, { duration: 140 });
        translateX.value = withTiming(nextX, { duration: 140 });
        translateY.value = withTiming(nextY, { duration: 140 });
        savedScale.value = next;
        savedX.value = nextX;
        savedY.value = nextY;
        return;
      }
    }
    scale.value = withTiming(next, { duration: 140 });
    savedScale.value = next;
  };

  const openActionsFor = (id: PersonId) => {
    setSelectedId(id);
    setActionVisible(true);
  };

  const selectedDisplayName = displayKinship(selected?.name?.trim()) || t('common.unnamed');

  const openEditSection = (section: 'info' | 'photo') => {
    if (!guardWrite()) return;
    setActionVisible(false);
    setEditSection(section);
    setEditingId(selectedId);
  };

  const callSelectedPerson = () => {
    void openPhoneDialer(selected?.phone);
  };

  const smsSelectedPerson = () => {
    const digits = normalizePhoneDigits(selected?.phone);
    if (!digits) {
      Alert.alert(t('pedigree.smsNoPhoneTitle'), t('pedigree.smsNoPhoneBody'));
      return;
    }
    void openSmsComposer([digits]);
  };

  const addTitle = useMemo(() => {
    if (!pendingAdd) return t('pedigree.addPerson');
    switch (pendingAdd.kind) {
      case 'parent':
        return pendingAdd.parentType === 'father'
          ? t('pedigree.addFatherTitle')
          : t('pedigree.addMotherTitle');
      case 'sibling':
        return t('pedigree.addSiblingTitle');
      case 'child':
        return t('pedigree.addChildTitle');
      case 'spouse':
        return t('pedigree.addSpouseTitle');
      default:
        return t('pedigree.addPerson');
    }
  }, [pendingAdd, t]);

  const onSubmitNewPerson = (person: Person) => {
    if (!guardWrite()) return;
    const action = pendingAdd;
    if (!action) return;
    updateActiveViewPeople(prev => {
      const next: Record<PersonId, Person> = {
        ...prev,
        [person.id]: person,
      };

      if (action.kind === 'parent') {
        const resolved = resolveParentAdd(
          activeView,
          next,
          action.childId,
          action.parentType,
          person.id,
        );
        if (!resolved || resolved.status === 'exists') return prev;

        const linkChild = next[resolved.linkChildId];
        if (!linkChild) return prev;

        const finalId = resolved.useSlotId ? resolved.parentId : person.id;
        if (finalId !== person.id) {
          delete next[person.id];
        }

        const normalizedParent: Person = {
          ...person,
          id: finalId,
          gender:
            person.gender && person.gender !== 'unknown'
              ? person.gender
              : action.parentType === 'father'
                ? 'male'
                : 'female',
        };
        next[finalId] = normalizedParent;

        const existingFather =
          linkChild.fatherId && next[linkChild.fatherId] ? linkChild.fatherId : undefined;
        const existingMother =
          linkChild.motherId && next[linkChild.motherId] ? linkChild.motherId : undefined;
        next[resolved.linkChildId] = {
          ...linkChild,
          fatherId: action.parentType === 'father' ? finalId : existingFather,
          motherId: action.parentType === 'mother' ? finalId : existingMother,
        };

        const otherParentId = resolved.otherParentId;
        if (otherParentId && next[otherParentId]) {
          next[finalId] = { ...next[finalId], spouseId: otherParentId };
          next[otherParentId] = { ...next[otherParentId], spouseId: finalId };
        }
      } else if (action.kind === 'sibling') {
        const resolved = resolveSiblingAdd(activeView, next, action.ofId);
        if (!resolved) return prev;
        const slotId = nextEmptySiblingSlotId(activeView, next, resolved);
        const finalId = slotId ?? person.id;
        next[finalId] = {
          ...person,
          id: finalId,
          ...(resolved.fatherId ? { fatherId: resolved.fatherId } : {}),
          ...(resolved.motherId ? { motherId: resolved.motherId } : {}),
        };
      } else if (action.kind === 'child') {
        const parent = next[action.parentId];
        if (parent) {
          const spouseId = parent.spouseId;
          const inferredRole = inferParentRole(next, action.parentId, spouseId);
          next[person.id] = {
            ...next[person.id],
            ...(inferredRole === 'father'
              ? { fatherId: action.parentId }
              : { motherId: action.parentId }),
            ...(spouseId
              ? inferredRole === 'father'
                ? { motherId: spouseId }
                : { fatherId: spouseId }
              : {}),
          };
        }
      } else if (action.kind === 'spouse') {
        const base = next[action.ofId];
        if (base) {
          next[action.ofId] = { ...base, spouseId: person.id };
          next[person.id] = { ...next[person.id], spouseId: action.ofId };
          // 기존 자녀에 한쪽 부모만 있으면 새 배우자를 다른 쪽으로 채움
          for (const p of Object.values(next)) {
            if (p.id === person.id || p.id === action.ofId) continue;
            if (p.fatherId === action.ofId && !p.motherId) {
              next[p.id] = { ...p, motherId: person.id };
            } else if (p.motherId === action.ofId && !p.fatherId) {
              next[p.id] = { ...p, fatherId: person.id };
            }
          }
        }
      }

      return next;
    });

    setPendingAdd(null);
  };

  const onSubmitEditPerson = (person: Person) => {
    if (!guardWrite()) return;
    updateActiveViewPeople(prev => {
      const existing = prev[person.id];
      if (!existing) return prev;
      return {
        ...prev,
        [person.id]: {
          ...existing,
          name: person.name,
          gender: person.gender,
          phone: person.phone,
          birthDate: person.birthDate,
          createdAt: person.createdAt,
          photoUri: person.photoUri,
          note: person.note,
        },
      };
    });
    setEditingId(null);
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
            const next = rearrangePedigreeStore(store);
            setStore(next);
            setSelectedId(slotIdsForView(next.activeView).selfId);
            lastSyncedPeopleRef.current = next.views[next.activeView];
            await savePedigreeStore(next);
            await clearNodeOffsets();
            setSettingsVisible(false);
            requestAnimationFrame(() => centerOnPedigree(true));
          },
        },
      ],
    );
  };

  const resetPedigree = async () => {
    if (!guardWrite()) return;
    Alert.alert(t('settings.reset'), t('settings.resetConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.reset'),
        style: 'destructive',
        onPress: async () => {
          // 초기화 시 기본 족보 포맷(나·부모·양가 조부모·배우자·자녀)으로 복원
          const initial = syncAllViews(createInitialStore());
          setStore(initial);
          setSelectedId(slotIdsForView('self').selfId);
          lastSyncedPeopleRef.current = initial.views[initial.activeView];
          deletedIdsRef.current.clear();
          queueRef.current = [];
          setSyncStatus('idle');
          await clearPedigreePeople();

          if (ENABLE_SERVER_SYNC && auth?.googleSub && auth.accessToken) {
            try {
              await fetch(`${API_BASE_URL}/v1/pedigree/${encodeURIComponent(auth.googleSub)}`, {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${auth.accessToken}`,
                },
              });
            } catch {
              // 오프라인이면 로컬 초기화 후 다음 동기화 때 서버 반영
            }
          }
        },
      },
    ]);
  };

  const exportSelectedAsShare = async () => {
    if (!ENABLE_PEDIGREE_SHARE) return;
    if (!selectedId || exportBusy) return;
    setExportBusy(true);
    setActionVisible(false);
    try {
      const key = await exportPedigreeShare({
        store,
        focalPersonId: selectedId,
        sourceView: activeView,
      });
      setExportedKey(key);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('pedigree.exportFailFallback');
      Alert.alert(t('pedigree.exportFailTitle'), msg);
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[exportPedigreeShare]', msg);
      }
    } finally {
      setExportBusy(false);
    }
  };

  const confirmImportShare = () => {
    if (!ENABLE_PEDIGREE_SHARE) return;
    const key = importKey.trim();
    if (!key) {
      Alert.alert(t('pedigree.badKeyTitle'), t('pedigree.badKeyBody'));
      return;
    }
    Alert.alert(t('pedigree.importConfirmTitle'), t('pedigree.importConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.apply'),
        style: 'destructive',
        onPress: async () => {
          setImportBusy(true);
          try {
            const remote = await fetchPedigreeShare(key);
            const next = hydrateImportedPedigreeStore(remote);
            setStore(next);
            setSelectedId(slotIdsForView('self').selfId);
            lastSyncedPeopleRef.current = next.views.self;
            deletedIdsRef.current.clear();
            queueRef.current = [];
            setSyncStatus('idle');
            await savePedigreeStore(next);
            await clearNodeOffsets();
            setImportVisible(false);
            setImportKey('');
            requestAnimationFrame(() => centerOnPedigree(true));
            Alert.alert(t('pedigree.importDoneTitle'), t('pedigree.importDoneBody'));
          } catch (e) {
            Alert.alert(
              t('pedigree.importFailTitle'),
              e instanceof Error ? e.message : t('pedigree.badKeyTitle'),
            );
          } finally {
            setImportBusy(false);
          }
        },
      },
    ]);
  };

  const askSwitchAccount = async () => {
    if (!onRequestSwitchAccount) return;
    setSettingsVisible(false);
    try {
      await onRequestSwitchAccount();
    } catch {
      Alert.alert(t('settings.switchFailTitle'), t('settings.switchFailBody'));
    }
  };

  const askLogout = async () => {
    if (!onRequestLogout) return;
    setSettingsVisible(false);
    try {
      await onRequestLogout();
    } catch {
      Alert.alert(t('settings.logoutFailTitle'), t('settings.logoutFailBody'));
    }
  };

  const askLinkGoogle = async () => {
    if (!onRequestLinkGoogle) return;
    setSettingsVisible(false);
    try {
      await onRequestLinkGoogle();
    } catch {
      Alert.alert(t('settings.linkFailTitle'), t('settings.linkFailBody'));
    }
  };

  const screenBg = ACTIVE_VIEW_BG[activeView];
  const safeCanvasWidth = Number.isFinite(displayLayout.canvasWidth)
    ? Math.max(1, Math.round(displayLayout.canvasWidth))
    : 1600;
  const safeCanvasHeight = Number.isFinite(displayLayout.canvasHeight)
    ? Math.max(1, Math.round(displayLayout.canvasHeight))
    : 1200;

  if (!isHydrated) {
    return (
      <View
        style={[
          styles.safe,
          { backgroundColor: screenBg, paddingTop: topInset, paddingBottom: bottomInset },
        ]}
      >
        <View style={[styles.loadingWrap, scaledUi.loadingWrap]}>
          <ActivityIndicator size="large" color={ui.color.accent} />
          <Text style={[styles.loadingText, scaledUi.loadingText]}>{t('pedigree.loading')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.safe,
        { backgroundColor: screenBg, paddingTop: topInset, paddingBottom: bottomInset },
      ]}
    >
      <View style={[styles.header, scaledUi.header, { backgroundColor: screenBg }]}>
        <View style={[styles.headerTopRow, scaledUi.headerTopRow]}>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, scaledUi.headerTitle]}>{t('pedigree.title')}</Text>
            <Text
              style={[
                styles.viewBadge,
                scaledUi.viewBadge,
                { backgroundColor: ACTIVE_VIEW_BG[activeView] },
              ]}
            >
              {t('pedigree.viewSuffix', { view: t(`view.${activeView}` as MessageKey) })}
            </Text>
          </View>
          <View style={[styles.headerActions, scaledUi.headerActions]}>
            {onBack ? (
              <Pressable style={[styles.settingsBtn, scaledUi.settingsBtn]} onPress={onBack}>
                <Text style={[styles.settingsBtnText, scaledUi.settingsBtnText]}>{t('common.home')}</Text>
              </Pressable>
            ) : null}
            {ENABLE_PEDIGREE_SHARE ? (
            <Pressable
              style={[styles.settingsBtn, scaledUi.settingsBtn]}
              onPress={() => {
                setImportKey('');
                setImportVisible(true);
              }}
            >
              <Text style={[styles.settingsBtnText, scaledUi.settingsBtnText]}>{t('pedigree.import')}</Text>
            </Pressable>
            ) : null}
            <View style={[styles.headerActionColumn, scaledUi.headerActionColumn]}>
              <Pressable style={[styles.settingsBtn, scaledUi.settingsBtn]} onPress={() => setUsageVisible(true)}>
                <Text style={[styles.settingsBtnText, scaledUi.settingsBtnText]}>{t('pedigree.usage')}</Text>
              </Pressable>
              {activeView !== 'self' ? (
                <Pressable style={[styles.selfReturnBtn, scaledUi.selfReturnBtn]} onPress={switchToSelfView}>
                  <Text style={[styles.selfReturnBtnText, scaledUi.selfReturnBtnText]}>{t('pedigree.selfView')}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
        <Text style={[styles.syncText, scaledUi.syncText]}>
          {localSaveStatus === 'error'
            ? t('pedigree.syncDeviceFail')
            : ENABLE_SERVER_SYNC && auth?.googleSub
              ? syncStatus === 'syncing'
                ? t('pedigree.syncing')
                : syncStatus === 'synced'
                  ? t('pedigree.syncDone')
                  : syncStatus === 'offline'
                    ? t('pedigree.syncOffline')
                    : syncStatus === 'error'
                      ? t('pedigree.syncError')
                      : t('pedigree.syncIdle')
              : t('pedigree.savedLocal')}
        </Text>
      </View>
      <View style={{ paddingHorizontal: 12 }}>
        <TrialExpiredBanner compact />
      </View>

      <View style={[styles.stage, { backgroundColor: screenBg }]} onLayout={onStageLayout}>
        <GestureDetector gesture={composed}>
          <Animated.View
            style={[
              {
                width: safeCanvasWidth,
                height: safeCanvasHeight,
                backgroundColor: screenBg,
              },
              canvasStyle,
            ]}
          >
            <EdgeLines
              edges={displayLayout.edges}
              nodeById={displayLayout.nodeById}
              spousePairs={spousePairs}
            />

            {displayLayout.nodes.map(n => {
              const p = peopleById[n.id];
              if (!p) return null;
              return (
                <View
                  key={n.id}
                  style={[styles.node, { left: n.x, top: n.y, width: n.width, height: n.height }]}
                >
                  <DraggablePersonNode
                    person={p}
                    label={kinshipLabelToDisplayName(
                      kinshipLabelById[p.id] ?? p.name,
                      p,
                    )}
                    ordinalLabel={ordinalLabelById[p.id]}
                    width={n.width}
                    height={n.height}
                    highlighted={layout.highlightIds.has(n.id)}
                    generation={n.generation}
                    minGeneration={minGeneration}
                    referenceDate={today}
                    activeView={activeView}
                    onPress={() => openActionsFor(n.id)}
                  />
                </View>
              );
            })}

          </Animated.View>
        </GestureDetector>
      </View>

      {ENABLE_PEDIGREE_SHARE && exportBusy ? (
        <View style={styles.shareBusyOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color={ui.color.accentDark} />
          <Text style={styles.shareBusyText}>{t('pedigree.exportingBusy')}</Text>
        </View>
      ) : null}

      {/* 줌 컨트롤: + / − / 센터(중앙 복귀) */}
      <View style={[styles.zoomBox, scaledUi.zoomBox]}>
        <Pressable style={[styles.zoomBtn, scaledUi.zoomBtn]} onPress={() => zoomBy(1.2)}>
          <Text style={[styles.zoomText, scaledUi.zoomText]}>+</Text>
        </Pressable>
        <Pressable style={[styles.zoomBtn, scaledUi.zoomBtn]} onPress={() => zoomBy(1 / 1.2)}>
          <Text style={[styles.zoomText, scaledUi.zoomText]}>−</Text>
        </Pressable>
        <Pressable
          style={[styles.zoomBtn, styles.zoomCenterBtn, scaledUi.zoomCenterBtn]}
          onPress={recenterCurrentView}
        >
          <Text style={[styles.zoomCenterText, scaledUi.zoomCenterText]}>{t('pedigree.center')}</Text>
        </Pressable>
      </View>

      {/* 액션 시트(추가/삭제) */}
      <Modal
        transparent
        visible={actionVisible}
        animationType="fade"
        onRequestClose={() => setActionVisible(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setActionVisible(false)}>
          <Pressable style={[styles.sheet, scaledUi.sheet]} onPress={() => {}}>
            <View style={[styles.sheetHeaderRow, scaledUi.sheetHeaderRow]}>
              <Text style={[styles.sheetTitle, scaledUi.sheetTitle]} numberOfLines={1}>
                {selectedDisplayName}
              </Text>
              <View style={[styles.sheetHeaderActions, scaledUi.sheetHeaderActions]}>
                <Pressable
                  style={[styles.sheetContactBtn, scaledUi.sheetContactBtn]}
                  onPress={callSelectedPerson}
                  accessibilityLabel={t('pedigree.call')}
                >
                  <Text style={[styles.sheetContactIcon, scaledUi.sheetContactIcon]}>☎</Text>
                  <Text style={[styles.sheetContactLabel, scaledUi.sheetContactLabel]}>{t('pedigree.call')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.sheetContactBtn, scaledUi.sheetContactBtn]}
                  onPress={smsSelectedPerson}
                  accessibilityLabel={t('pedigree.smsSend')}
                >
                  <Text style={[styles.sheetContactIcon, scaledUi.sheetContactIcon]}>✉</Text>
                  <Text style={[styles.sheetContactLabel, scaledUi.sheetContactLabel]}>{t('pedigree.sms')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.sheetContactBtn, scaledUi.sheetContactBtn, styles.sheetCloseBtn]}
                  onPress={() => setActionVisible(false)}
                  accessibilityLabel={t('common.close')}
                >
                  <Text style={[styles.sheetContactLabel, scaledUi.sheetContactLabel, styles.sheetCloseBtnText]}>
                    {t('common.close')}
                  </Text>
                </Pressable>
              </View>
            </View>

            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={[styles.sheetScrollContent, scaledUi.sheetScrollContent]}
              showsVerticalScrollIndicator
              bounces={false}
              keyboardShouldPersistTaps="handled"
            >
            {!writeLocked ? (
            <>
            <Pressable style={[styles.sheetItem, scaledUi.sheetItem, styles.sheetEditItem]} onPress={() => openEditSection('info')}>
              <Text style={[styles.sheetItemText, scaledUi.sheetItemText, styles.sheetEditItemText]}>{t('pedigree.editInfo')}</Text>
            </Pressable>

            <Pressable style={[styles.sheetItem, scaledUi.sheetItem, styles.sheetEditItem]} onPress={() => openEditSection('photo')}>
              <Text style={[styles.sheetItemText, scaledUi.sheetItemText, styles.sheetEditItemText]}>{t('pedigree.editPhoto')}</Text>
            </Pressable>
            </>
            ) : null}

            <Pressable
              style={[styles.sheetItem, scaledUi.sheetItem]}
              onPress={() => {
                setActionVisible(false);
                setDetailId(selectedId);
              }}
            >
              <Text style={[styles.sheetItemText, scaledUi.sheetItemText]}>{t('pedigree.viewInfo')}</Text>
            </Pressable>

            {ENABLE_PEDIGREE_SHARE ? (
            <Pressable
              style={[styles.sheetItem, scaledUi.sheetItem, styles.sheetExportItem]}
              onPress={exportSelectedAsShare}
              disabled={exportBusy}
            >
              <Text style={[styles.sheetItemText, scaledUi.sheetItemText, styles.sheetExportItemText]}>
                {exportBusy ? t('pedigree.exporting') : t('pedigree.exportAsShare')}
              </Text>
            </Pressable>
            ) : null}

            {activeView === 'self' && selectedId === slots.selfId ? (
              <>
                <Pressable
                  style={[styles.sheetItem, scaledUi.sheetItem, styles.lineageSwitch]}
                  onPress={() => switchLineageView('paternal')}
                >
                  <Text style={[styles.lineageSwitchText, scaledUi.lineageSwitchText]}>{t('pedigree.paternalView')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.sheetItem, scaledUi.sheetItem, styles.lineageSwitchMaternal]}
                  onPress={() => switchLineageView('maternal')}
                >
                  <Text style={[styles.lineageSwitchText, scaledUi.lineageSwitchText]}>{t('pedigree.maternalView')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.sheetItem, scaledUi.sheetItem, styles.lineageSwitchSpouse]}
                  onPress={() => switchLineageView('spouse')}
                >
                  <Text style={[styles.lineageSwitchText, scaledUi.lineageSwitchText]}>{t('pedigree.spouseView')}</Text>
                </Pressable>
              </>
            ) : null}

            {activeView === 'self' && selectedId === slots.father ? (
              <Pressable
                style={[styles.sheetItem, scaledUi.sheetItem, styles.lineageSwitch]}
                onPress={() => switchLineageView('paternal')}
              >
                <Text style={[styles.lineageSwitchText, scaledUi.lineageSwitchText]}>{t('pedigree.paternalView')}</Text>
              </Pressable>
            ) : null}

            {activeView === 'self' && selectedId === slots.mother ? (
              <Pressable
                style={[styles.sheetItem, scaledUi.sheetItem, styles.lineageSwitchMaternal]}
                onPress={() => switchLineageView('maternal')}
              >
                <Text style={[styles.lineageSwitchText, scaledUi.lineageSwitchText]}>{t('pedigree.maternalView')}</Text>
              </Pressable>
            ) : null}

            {activeView === 'self' && selectedId === slots.spouseId ? (
              <Pressable
                style={[styles.sheetItem, scaledUi.sheetItem, styles.lineageSwitchSpouse]}
                onPress={() => switchLineageView('spouse')}
              >
                <Text style={[styles.lineageSwitchText, scaledUi.lineageSwitchText]}>{t('pedigree.spouseView')}</Text>
              </Pressable>
            ) : null}

            {activeView !== 'self' ? (
              <Pressable style={[styles.sheetItem, scaledUi.sheetItem]} onPress={switchToSelfView}>
                <Text style={[styles.sheetItemText, scaledUi.sheetItemText]}>{t('pedigree.backToSelf')}</Text>
              </Pressable>
            ) : null}

            {!writeLocked ? (
            <>
            <Pressable
              style={[styles.sheetItem, scaledUi.sheetItem]}
              onPress={() => {
                const resolved = resolveParentAdd(
                  activeView,
                  peopleById,
                  selectedId,
                  'father',
                  '__pending__',
                );
                setActionVisible(false);
                if (resolved?.status === 'exists') {
                  Alert.alert(t('pedigree.alreadyFatherTitle'), t('pedigree.alreadyFatherBody'));
                  return;
                }
                setPendingAdd({ kind: 'parent', childId: selectedId, parentType: 'father' });
              }}
            >
              <Text style={[styles.sheetItemText, scaledUi.sheetItemText]}>{t('pedigree.addFather')}</Text>
            </Pressable>
            <Pressable
              style={[styles.sheetItem, scaledUi.sheetItem]}
              onPress={() => {
                const resolved = resolveParentAdd(
                  activeView,
                  peopleById,
                  selectedId,
                  'mother',
                  '__pending__',
                );
                setActionVisible(false);
                if (resolved?.status === 'exists') {
                  Alert.alert(t('pedigree.alreadyMotherTitle'), t('pedigree.alreadyMotherBody'));
                  return;
                }
                setPendingAdd({ kind: 'parent', childId: selectedId, parentType: 'mother' });
              }}
            >
              <Text style={[styles.sheetItemText, scaledUi.sheetItemText]}>{t('pedigree.addMother')}</Text>
            </Pressable>

            {canAddSiblingFromNode(activeView, selectedId) ? (
              <Pressable
                style={[styles.sheetItem, scaledUi.sheetItem]}
                onPress={() => {
                  setActionVisible(false);
                  setPendingAdd({ kind: 'sibling', ofId: selectedId });
                }}
              >
                <Text style={[styles.sheetItemText, scaledUi.sheetItemText]}>{t('pedigree.addSibling')}</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={[styles.sheetItem, scaledUi.sheetItem]}
              onPress={() => {
                if (selected?.spouseId) {
                  setActionVisible(false);
                  Alert.alert(t('pedigree.alreadySpouseTitle'), t('pedigree.alreadySpouseBody'));
                  return;
                }
                setActionVisible(false);
                setPendingAdd({ kind: 'spouse', ofId: selectedId });
              }}
            >
              <Text style={[styles.sheetItemText, scaledUi.sheetItemText]}>{t('pedigree.addSpouse')}</Text>
            </Pressable>

            <Text style={[styles.sheetHint, scaledUi.sheetHint]}>{t('pedigree.spouseHint')}</Text>
            <Pressable
              style={[styles.sheetItem, scaledUi.sheetItem]}
              onPress={() => {
                setActionVisible(false);
                setPendingAdd({ kind: 'child', parentId: selectedId });
              }}
            >
              <Text style={[styles.sheetItemText, scaledUi.sheetItemText]}>{t('pedigree.addChild')}</Text>
            </Pressable>

            {selectedId !== slots.selfId ? (
              <Pressable
                style={[styles.sheetItem, scaledUi.sheetItem, styles.danger]}
                onPress={() => {
                  setActionVisible(false);
                  Alert.alert(t('pedigree.deleteTitle'), t('pedigree.deleteBody'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('common.delete'), style: 'destructive', onPress: () => deletePerson(selectedId) },
                  ]);
                }}
              >
                <Text style={[styles.sheetItemText, scaledUi.sheetItemText, styles.dangerText]}>{t('common.delete')}</Text>
              </Pressable>
            ) : null}
            </>
            ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <AddPersonModal
        visible={!!pendingAdd}
        title={addTitle}
        auth={auth}
        onClose={() => setPendingAdd(null)}
        onSubmit={onSubmitNewPerson}
      />

      <AddPersonModal
        visible={editingId != null}
        title={editSection === 'photo' ? t('pedigree.editPhoto') : t('pedigree.editInfo')}
        section={editSection}
        initialPerson={editingId ? peopleById[editingId] : undefined}
        auth={auth}
        onClose={() => setEditingId(null)}
        onSubmit={onSubmitEditPerson}
      />

      <PersonDetailModal
        visible={detailId != null}
        person={selectedDetail}
        onClose={() => setDetailId(null)}
        onEdit={
          writeLocked
            ? undefined
            : () => {
                if (!detailId) return;
                setDetailId(null);
                setEditingId(detailId);
              }
        }
        onDelete={
          writeLocked || !detailId || detailId === 'self'
            ? undefined
            : () => {
                const idToDelete = detailId;
                setDetailId(null);
                Alert.alert(t('pedigree.deleteTitle'), t('pedigree.deleteBody'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('common.delete'), style: 'destructive', onPress: () => deletePerson(idToDelete) },
                ]);
              }
        }
      />

      <Modal
        transparent
        visible={settingsVisible}
        animationType="fade"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setSettingsVisible(false)}>
          <Pressable style={[styles.settingsSheet, scaledUi.settingsSheet]} onPress={() => {}}>
            <Text style={[styles.settingsTitle, scaledUi.settingsTitle]}>{t('settings.title')}</Text>
            {auth?.googleSub ? (
              <>
                <Text style={[styles.settingsDesc, scaledUi.settingsDesc]}>
                  {t('pedigree.accountLabel', {
                    name: auth.name?.trim() ? auth.name : auth.email ?? auth.googleSub,
                  })}
                </Text>
                <Text style={[styles.settingsSubDesc, scaledUi.settingsSubDesc]}>{auth.email ?? auth.googleSub}</Text>
                <Pressable style={[styles.settingsActionBtn, scaledUi.settingsActionBtn]} onPress={askSwitchAccount}>
                  <Text style={[styles.settingsActionText, scaledUi.settingsActionText]}>{t('settings.googleSwitch')}</Text>
                </Pressable>
                <Pressable style={[styles.settingsActionBtn, scaledUi.settingsActionBtn]} onPress={askLogout}>
                  <Text style={[styles.settingsActionText, scaledUi.settingsActionText]}>{t('settings.logout')}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.settingsDesc, scaledUi.settingsDesc]}>{t('settings.guestMode')}</Text>
                <Text style={[styles.settingsSubDesc, scaledUi.settingsSubDesc]}>
                  {t('pedigree.guestDesc')}
                </Text>
                <Pressable style={[styles.settingsActionBtn, scaledUi.settingsActionBtn]} onPress={askLinkGoogle}>
                  <Text style={[styles.settingsActionText, scaledUi.settingsActionText]}>{t('settings.linkGoogle')}</Text>
                </Pressable>
              </>
            )}
            <Pressable style={[styles.settingsActionBtn, scaledUi.settingsActionBtn]} onPress={rearrangePedigree}>
              <Text style={[styles.settingsActionText, scaledUi.settingsActionText]}>{t('settings.rearrange')}</Text>
            </Pressable>
            <Pressable
              style={[styles.settingsActionBtn, scaledUi.settingsActionBtn, styles.settingsDangerBtn]}
              onPress={resetPedigree}
            >
              <Text style={[styles.settingsActionText, scaledUi.settingsActionText, styles.settingsDangerText]}>{t('settings.reset')}</Text>
            </Pressable>
            <Pressable style={[styles.settingsCloseBtn, scaledUi.settingsCloseBtn]} onPress={() => setSettingsVisible(false)}>
              <Text style={[styles.settingsCloseBtnText, scaledUi.settingsCloseBtnText]}>{t('common.close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ContactDirectoryModal
        visible={contactsVisible}
        entries={contactEntries}
        onClose={() => setContactsVisible(false)}
      />

      <Modal
        transparent
        visible={ENABLE_PEDIGREE_SHARE && importVisible}
        animationType="fade"
        onRequestClose={() => !importBusy && setImportVisible(false)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => !importBusy && setImportVisible(false)}
        >
          <Pressable style={[styles.settingsSheet, scaledUi.settingsSheet]} onPress={() => {}}>
            <Text style={[styles.settingsTitle, scaledUi.settingsTitle]}>{t('pedigree.import')}</Text>
            <Text style={[styles.settingsSubDesc, scaledUi.settingsSubDesc]}>
              {t('pedigree.importDesc')}
            </Text>
            <TextInput
              value={importKey}
              onChangeText={setImportKey}
              placeholder={t('pedigree.importPlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!importBusy}
              style={styles.shareKeyInput}
            />
            <Pressable
              style={[styles.settingsActionBtn, scaledUi.settingsActionBtn]}
              onPress={confirmImportShare}
              disabled={importBusy}
            >
              <Text style={[styles.settingsActionText, scaledUi.settingsActionText]}>
                {importBusy ? t('pedigree.importing') : t('common.confirm')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.settingsCloseBtn, scaledUi.settingsCloseBtn]}
              onPress={() => !importBusy && setImportVisible(false)}
              disabled={importBusy}
            >
              <Text style={[styles.settingsCloseBtnText, scaledUi.settingsCloseBtnText]}>{t('common.close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        visible={ENABLE_PEDIGREE_SHARE && !!exportedKey}
        animationType="fade"
        onRequestClose={() => setExportedKey(null)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setExportedKey(null)}>
          <Pressable style={[styles.settingsSheet, scaledUi.settingsSheet]} onPress={() => {}}>
            <Text style={[styles.settingsTitle, scaledUi.settingsTitle]}>{t('pedigree.exportDone')}</Text>
            <Text style={[styles.settingsSubDesc, scaledUi.settingsSubDesc]}>
              {t('pedigree.exportDoneDesc')}
            </Text>
            <Text selectable style={styles.shareKeyValue}>
              {exportedKey}
            </Text>
            <Pressable
              style={[styles.settingsActionBtn, scaledUi.settingsActionBtn]}
              onPress={async () => {
                if (!exportedKey) return;
                try {
                  await Share.share({ message: exportedKey });
                } catch {
                  // 공유 취소 등 무시
                }
              }}
            >
              <Text style={[styles.settingsActionText, scaledUi.settingsActionText]}>{t('pedigree.shareKey')}</Text>
            </Pressable>
            <Pressable
              style={[styles.settingsCloseBtn, scaledUi.settingsCloseBtn]}
              onPress={() => setExportedKey(null)}
            >
              <Text style={[styles.settingsCloseBtnText, scaledUi.settingsCloseBtnText]}>{t('common.close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        visible={usageVisible}
        animationType="fade"
        onRequestClose={() => setUsageVisible(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setUsageVisible(false)}>
          <Pressable style={[styles.settingsSheet, scaledUi.settingsSheet]} onPress={() => {}}>
            <Text style={[styles.settingsTitle, scaledUi.settingsTitle]}>{t('pedigree.usage')}</Text>
            <Text style={[styles.settingsDesc, scaledUi.settingsDesc]}>{t('pedigree.usage1')}</Text>
            <Text style={[styles.settingsSubDesc, scaledUi.settingsSubDesc]}>
              {t('pedigree.usage1body')}
            </Text>
            {activeView === 'self' ? (
              <>
                <Text style={[styles.settingsDesc, scaledUi.settingsDesc]}>{t('pedigree.usage2')}</Text>
                <Text style={[styles.settingsSubDesc, scaledUi.settingsSubDesc]}>
                  {t('pedigree.usage2body')}
                </Text>
              </>
            ) : null}
            <Text style={[styles.settingsDesc, scaledUi.settingsDesc]}>
              {t('pedigree.usageMove', { n: activeView === 'self' ? '3' : '2' })}
            </Text>
            <Text style={[styles.settingsSubDesc, scaledUi.settingsSubDesc]}>
              {t('pedigree.usageMoveBody')}
            </Text>
            {activeView !== 'self' ? (
              <>
                <Text style={[styles.settingsDesc, scaledUi.settingsDesc]}>{t('pedigree.usageSelf')}</Text>
                <Text style={[styles.settingsSubDesc, scaledUi.settingsSubDesc]}>
                  {t('pedigree.usageSelfBody')}
                </Text>
              </>
            ) : null}
            <Pressable style={[styles.settingsCloseBtn, scaledUi.settingsCloseBtn]} onPress={() => setUsageVisible(false)}>
              <Text style={[styles.settingsCloseBtnText, scaledUi.settingsCloseBtnText]}>{t('common.close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: ui.color.textSecondary,
    fontSize: 14,
    fontWeight: ui.weight.label,
  },
  header: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    zIndex: 10,
    elevation: 10,
  },
  headerTitle: {
    color: ui.color.text,
    fontSize: 18,
    fontWeight: ui.weight.heading,
  },
  viewBadge: {
    marginTop: 2,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: ui.weight.title,
    color: ui.color.text,
    overflow: 'hidden',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    flexShrink: 1,
    maxWidth: '72%',
    gap: 4,
  },
  headerActionColumn: {
    alignItems: 'stretch',
    gap: 4,
  },
  selfReturnBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2e7d32',
    backgroundColor: '#f1f8e9',
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: 'center',
  },
  selfReturnBtnText: {
    color: '#1b5e20',
    fontSize: 11,
    fontWeight: ui.weight.title,
  },
  settingsBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ui.color.border,
    backgroundColor: ui.color.surface,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  settingsBtnText: {
    color: ui.color.text,
    fontSize: 11,
    fontWeight: ui.weight.title,
  },
  syncText: {
    marginTop: 2,
    color: ui.color.textMuted,
    fontSize: 11,
    fontWeight: ui.weight.label,
  },
  stage: {
    flex: 1,
    overflow: 'hidden',
  },
  node: {
    position: 'absolute',
  },
  zoomBox: {
    position: 'absolute',
    right: 16,
    bottom: 18,
    gap: 10,
  },
  zoomBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ui.color.surface,
    borderWidth: 1.5,
    borderColor: ui.color.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...ui.shadow.float,
  },
  zoomText: {
    color: ui.color.text,
    fontSize: 20,
    fontWeight: ui.weight.heading,
    marginTop: -2,
  },
  zoomCenterBtn: {
    borderColor: '#2e7d32',
    backgroundColor: '#f1f8e9',
  },
  zoomCenterText: {
    color: '#1b5e20',
    fontSize: 18,
    fontWeight: ui.weight.heading,
    marginTop: -1,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: ui.color.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: ui.color.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: ui.color.borderLight,
    overflow: 'hidden',
  },
  sheetScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  sheetScrollContent: {
    gap: 7,
  },
  sheetTitle: {
    flex: 1,
    color: ui.color.text,
    fontSize: 14,
    fontWeight: ui.weight.heading,
    minWidth: 0,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sheetHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  sheetContactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: ui.color.surface,
    borderWidth: 1,
    borderColor: ui.color.border,
  },
  sheetContactIcon: {
    fontSize: 14,
    color: ui.color.text,
    fontWeight: ui.weight.title,
  },
  sheetContactLabel: {
    fontSize: 11,
    color: ui.color.text,
    fontWeight: ui.weight.title,
  },
  sheetCloseBtn: {
    backgroundColor: ui.color.surfaceMuted,
  },
  sheetCloseBtnText: {
    color: ui.color.textSecondary,
  },
  sheetItem: {
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: ui.color.surface,
    borderWidth: 1,
    borderColor: ui.color.border,
  },
  sheetEditItem: {
    backgroundColor: '#FFF8D6',
    borderColor: '#F0E0A0',
  },
  sheetEditItemText: {
    color: ui.color.danger,
  },
  sheetExportItem: {
    backgroundColor: '#E8F1FF',
    borderColor: '#BFDBFE',
  },
  sheetExportItemText: {
    color: ui.color.accentDark,
    fontWeight: ui.weight.title,
  },
  shareKeyInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: ui.color.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: ui.color.text,
    backgroundColor: ui.color.surface,
  },
  shareKeyValue: {
    marginTop: 14,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: ui.color.border,
    fontSize: 22,
    fontWeight: ui.weight.heading,
    textAlign: 'center',
    letterSpacing: 1,
    color: ui.color.text,
  },
  shareBusyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    gap: 12,
  },
  shareBusyText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: ui.weight.title,
  },
  sheetItemText: {
    color: ui.color.text,
    fontSize: 13,
    fontWeight: ui.weight.title,
  },
  lineageSwitch: {
    backgroundColor: '#e3f2fd',
    borderColor: '#90caf9',
  },
  lineageSwitchMaternal: {
    backgroundColor: '#fce4ec',
    borderColor: '#f48fb1',
  },
  lineageSwitchSpouse: {
    backgroundColor: '#f1f8e9',
    borderColor: '#aed581',
  },
  lineageSwitchText: {
    color: ui.color.text,
    fontSize: 13,
    fontWeight: ui.weight.title,
  },
  sheetHint: {
    color: ui.color.textSecondary,
    fontSize: 11,
    fontWeight: ui.weight.body,
    marginTop: 2,
  },
  sheetRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sheetHalf: {
    flex: 1,
  },
  danger: {
    borderColor: ui.color.dangerBorder,
    backgroundColor: ui.color.dangerBg,
  },
  dangerText: {
    color: ui.color.danger,
    fontWeight: ui.weight.title,
  },
  settingsSheet: {
    marginHorizontal: 16,
    marginTop: 120,
    backgroundColor: ui.color.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ui.color.border,
    padding: 16,
    gap: 8,
    ...ui.shadow.card,
  },
  settingsTitle: {
    color: ui.color.text,
    fontSize: 16,
    fontWeight: ui.weight.heading,
    marginBottom: 6,
  },
  settingsDesc: {
    color: ui.color.label,
    fontSize: 13,
    fontWeight: ui.weight.body,
  },
  settingsSubDesc: {
    color: ui.color.textSecondary,
    fontSize: 12,
    fontWeight: ui.weight.body,
    marginBottom: 8,
  },
  settingsActionBtn: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ui.color.border,
    backgroundColor: ui.color.surface,
    paddingHorizontal: 10,
    paddingVertical: 11,
  },
  settingsActionText: {
    color: ui.color.text,
    fontSize: 13,
    fontWeight: ui.weight.title,
  },
  settingsDangerBtn: {
    borderColor: ui.color.dangerBorder,
    backgroundColor: ui.color.dangerBg,
  },
  settingsDangerText: {
    color: ui.color.danger,
    fontWeight: ui.weight.title,
  },
  settingsCloseBtn: {
    marginTop: 10,
    alignSelf: 'flex-end',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ui.color.border,
    backgroundColor: ui.color.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  settingsCloseBtnText: {
    color: ui.color.text,
    fontSize: 12,
    fontWeight: ui.weight.title,
  },
});
