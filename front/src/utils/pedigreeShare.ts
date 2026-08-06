/**
 * 공개 공유 키로 족보 내보내기/불러오기
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';
import type { PedigreeStore } from '../types/lineage';
import type { ActiveView } from '../types/lineage';
import type { Person, PersonId } from '../types/pedigree';
import { rebaseStoreAroundPerson } from './rebasePedigree';

const ALL_VIEWS: ActiveView[] = ['self', 'paternal', 'maternal', 'spouse'];
const SHARE_DEVICE_ID_KEY = 'pedigree.share.deviceId.v1';

/** 기기당 고정 ID — 서버에서 이전 내보내기 정리에 사용 */
export async function getShareDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(SHARE_DEVICE_ID_KEY);
  if (existing?.trim()) return existing.trim();

  const id =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? `dev_${globalThis.crypto.randomUUID()}`
      : `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  await AsyncStorage.setItem(SHARE_DEVICE_ID_KEY, id);
  return id;
}

/** 로컬/원격 사진을 공개 공유 업로드 API로 올려 URL로 바꾼다. */
export async function uploadSharePhoto(uri: string): Promise<string> {
  if (
    (uri.startsWith('http://') || uri.startsWith('https://')) &&
    uri.includes('/uploads/')
  ) {
    return uri;
  }

  const form = new FormData();
  form.append('file', {
    uri,
    name: 'photo.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);

  const res = await fetch(`${API_BASE_URL}/v1/share/uploads/photo`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    throw new Error('사진 업로드에 실패했습니다.');
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error('사진 업로드에 실패했습니다.');
  return data.url;
}

async function rewritePhotosInPeople(
  people: Record<PersonId, Person>,
): Promise<Record<PersonId, Person>> {
  const out: Record<PersonId, Person> = {};
  for (const [id, person] of Object.entries(people)) {
    if (!person.photoUri) {
      out[id] = person;
      continue;
    }
    try {
      const url = await uploadSharePhoto(person.photoUri);
      out[id] = { ...person, photoUri: url };
    } catch {
      // 사진 실패 시에도 나머지 정보는 공유
      out[id] = { ...person, photoUri: undefined };
    }
  }
  return out;
}

export async function packageStoreForShare(store: PedigreeStore): Promise<PedigreeStore> {
  const views = {} as PedigreeStore['views'];
  for (const view of ALL_VIEWS) {
    views[view] = await rewritePhotosInPeople(store.views[view] ?? {});
  }
  return {
    version: 2,
    activeView: 'self',
    views,
  };
}

export async function exportPedigreeShare(params: {
  store: PedigreeStore;
  focalPersonId: PersonId;
  sourceView: ActiveView;
}): Promise<string> {
  const rebased = rebaseStoreAroundPerson(
    params.store,
    params.focalPersonId,
    params.sourceView,
  );
  const packaged = await packageStoreForShare(rebased);
  const deviceId = await getShareDeviceId();

  const res = await fetch(`${API_BASE_URL}/v1/share/pedigree`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store: packaged, device_id: deviceId }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(detail || '족보 내보내기에 실패했습니다.');
  }

  const data = (await res.json()) as { key?: string };
  if (!data.key) throw new Error('공유 키를 받지 못했습니다.');
  return data.key;
}

export async function fetchPedigreeShare(key: string): Promise<PedigreeStore> {
  const trimmed = key.trim();
  if (!trimmed) throw new Error('키가 잘못되었습니다.');

  const res = await fetch(
    `${API_BASE_URL}/v1/share/pedigree/${encodeURIComponent(trimmed)}`,
  );

  if (res.status === 404) {
    throw new Error('키가 잘못되었습니다.');
  }
  if (!res.ok) {
    throw new Error('족보를 불러오지 못했습니다.');
  }

  const data = (await res.json()) as { store?: PedigreeStore };
  const store = data.store;
  if (!store?.views?.self || store.version !== 2) {
    throw new Error('키가 잘못되었습니다.');
  }
  return {
    version: 2,
    activeView: 'self',
    views: store.views,
  };
}
