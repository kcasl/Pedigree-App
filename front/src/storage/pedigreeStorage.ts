/**
 * 로컬 족보 저장소.
 * v2 PedigreeStore를 읽고, 없으면 v1 flat people를 마이그레이션한다.
 * 파싱 실패 시 null을 반환한다 — 호출측에서 createDefaultStore()로 통째 교체하지 말 것.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PedigreeStore, ActiveView } from '../types/lineage';
import type { Person, PersonId } from '../types/pedigree';
import {
  createDefaultStore,
  createViewTemplate,
  isLegacyFlatPedigree,
  migrateLegacyToStore,
  reconcileStore,
  slotIdsForView,
} from '../utils/standardTemplate';
import { mergePedigreeStoresPreferLocalUserData } from '../utils/personPersist';
import { syncAllViews } from '../utils/viewSync';

export const PEDIGREE_STORAGE_KEY = 'pedigree.store.local.v2';
export const NODE_OFFSETS_STORAGE_KEY = 'pedigree.nodeOffsets.local.v2';
export const LEGACY_PEDIGREE_KEY = 'pedigree.people.local.v1';

const AUTH_STORAGE_KEY = 'auth.google.user.v1';
const LEGACY_GUEST_KEY = 'pedigree.people.guest.v1';

/** JSON → PedigreeStore. 레거시/부분 뷰는 템플릿으로 채운 뒤 reconcile + sync */
function parseStore(raw: string | null): PedigreeStore | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    if (isLegacyFlatPedigree(parsed)) {
      return syncAllViews(reconcileStore(migrateLegacyToStore(parsed)));
    }

    const store = parsed as PedigreeStore;
    if (store.version !== 2 || !store.views) return null;

    if (!store.views.self) {
      const partial = store.views as Partial<typeof store.views>;
      store.views = {
        self: partial.self ?? createViewTemplate('self'),
        paternal: partial.paternal ?? createViewTemplate('paternal'),
        maternal: partial.maternal ?? createViewTemplate('maternal'),
        spouse: partial.spouse ?? createViewTemplate('spouse'),
      };
      if (!store.activeView || store.activeView === ('paternal' as ActiveView)) {
        store.activeView = 'self';
      }
    }

    const selfKey = slotIdsForView('self').selfId;
    if (!store.views.self[selfKey]) return null;
    return syncAllViews(reconcileStore(store));
  } catch {
    return null;
  }
}

/** @deprecated v1 호환 */
export function parseStoredPeople(raw: string | null): Record<PersonId, Person> | null {
  const store = parseStore(raw);
  return store?.views.paternal ?? null;
}

async function findLegacyStoredRaw(): Promise<string | null> {
  const guestRaw = await AsyncStorage.getItem(LEGACY_GUEST_KEY);
  if (guestRaw) return guestRaw;

  try {
    const authRaw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (!authRaw) return null;
    const parsed = JSON.parse(authRaw) as { googleSub?: string };
    if (!parsed?.googleSub) return null;
    return AsyncStorage.getItem(`pedigree.people.${parsed.googleSub}.v1`);
  } catch {
    return null;
  }
}

/** v2 → v1 키 → 계정별 레거시 순으로 탐색 */
export async function loadPedigreeStore(): Promise<PedigreeStore | null> {
  try {
    let raw = await AsyncStorage.getItem(PEDIGREE_STORAGE_KEY);
    if (!raw) {
      raw = await AsyncStorage.getItem(LEGACY_PEDIGREE_KEY);
      if (!raw) raw = await findLegacyStoredRaw();
    }
    return parseStore(raw);
  } catch {
    return null;
  }
}

/** @deprecated — v1 API 호환 */
export async function loadPedigreePeople(): Promise<Record<PersonId, Person> | null> {
  const store = await loadPedigreeStore();
  return store?.views[store.activeView] ?? null;
}

/** 화면 좌표는 저장하지 않는다. 인물·관계 store만 직렬화 */
export async function savePedigreeStore(store: PedigreeStore): Promise<void> {
  await AsyncStorage.setItem(PEDIGREE_STORAGE_KEY, JSON.stringify(store));
}

/** @deprecated — v1 API 호환. 기존 paternal 데이터는 유지하고 나머지 뷰만 템플릿으로 채움 */
export async function savePedigreePeople(people: Record<PersonId, Person>): Promise<void> {
  const base = createDefaultStore();
  base.views.paternal = { ...base.views.paternal, ...people };
  await savePedigreeStore(reconcileStore(syncAllViews(base)));
}

export async function clearPedigreePeople(): Promise<void> {
  await AsyncStorage.multiRemove([PEDIGREE_STORAGE_KEY, LEGACY_PEDIGREE_KEY]);
}

/** 사용자가 직접 옮긴 노드 X 오프셋 (뷰별). 레이아웃 결과와 합쳐 표시 */
export async function loadNodeOffsets(
  view?: ActiveView,
): Promise<Record<PersonId, number>> {
  try {
    const raw = await AsyncStorage.getItem(NODE_OFFSETS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const all = parsed as Record<string, Record<string, number>>;
    const bucket = view ? all[view] : undefined;
    if (!bucket) return {};
    const out: Record<PersonId, number> = {};
    for (const [id, v] of Object.entries(bucket)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveNodeOffsets(
  view: ActiveView,
  offsets: Record<PersonId, number>,
): Promise<void> {
  let all: Record<string, Record<string, number>> = {};
  try {
    const raw = await AsyncStorage.getItem(NODE_OFFSETS_STORAGE_KEY);
    if (raw) all = JSON.parse(raw) as Record<string, Record<string, number>>;
  } catch {
    all = {};
  }
  all[view] = offsets;
  await AsyncStorage.setItem(NODE_OFFSETS_STORAGE_KEY, JSON.stringify(all));
}

export async function clearNodeOffsets(): Promise<void> {
  await AsyncStorage.removeItem(NODE_OFFSETS_STORAGE_KEY);
}
