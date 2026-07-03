import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PedigreeStore, ActiveView } from '../types/lineage';
import type { Person, PersonId } from '../types/pedigree';
import {
  createDefaultStore,
  createViewTemplate,
  isLegacyFlatPedigree,
  migrateLegacyToStore,
  slotIdsForView,
} from '../utils/standardTemplate';

export const PEDIGREE_STORAGE_KEY = 'pedigree.store.local.v2';
export const NODE_OFFSETS_STORAGE_KEY = 'pedigree.nodeOffsets.local.v2';
export const LEGACY_PEDIGREE_KEY = 'pedigree.people.local.v1';

const AUTH_STORAGE_KEY = 'auth.google.user.v1';
const LEGACY_GUEST_KEY = 'pedigree.people.guest.v1';

function parseStore(raw: string | null): PedigreeStore | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    if (isLegacyFlatPedigree(parsed)) {
      return migrateLegacyToStore(parsed);
    }

    const store = parsed as PedigreeStore;
    if (store.version !== 2 || !store.views) return null;

    if (!store.views.self) {
      store.views.self = createViewTemplate('self');
      if (!store.views.paternal) store.views.paternal = createViewTemplate('paternal');
      if (!store.views.maternal) store.views.maternal = createViewTemplate('maternal');
      if (!store.views.spouse) store.views.spouse = createViewTemplate('spouse');
      if (!store.activeView || store.activeView === ('paternal' as ActiveView)) {
        store.activeView = 'self';
      }
    }

    const selfKey = slotIdsForView('self').selfId;
    if (!store.views.self[selfKey]) return null;
    return store;
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

export async function savePedigreeStore(store: PedigreeStore): Promise<void> {
  await AsyncStorage.setItem(PEDIGREE_STORAGE_KEY, JSON.stringify(store));
}

/** @deprecated */
export async function savePedigreePeople(people: Record<PersonId, Person>): Promise<void> {
  const store = createDefaultStore();
  store.views.paternal = people;
  await savePedigreeStore(store);
}

export async function clearPedigreePeople(): Promise<void> {
  await AsyncStorage.multiRemove([PEDIGREE_STORAGE_KEY, LEGACY_PEDIGREE_KEY]);
}

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
