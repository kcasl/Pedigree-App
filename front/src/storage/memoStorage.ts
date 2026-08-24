import AsyncStorage from '@react-native-async-storage/async-storage';
import { createId } from '../utils/id';
import { nowIso } from '../utils/date';

export const MEMO_STORAGE_KEY = 'memos.sticky.local.v1';

export const STICKY_COLORS = ['#fff4a3', '#c9f2c9', '#ffd6e7', '#cfe4ff', '#ffd9b8'] as const;
export type StickyColor = (typeof STICKY_COLORS)[number];

export type StickyMemo = {
  id: string;
  title: string;
  body: string;
  color: StickyColor;
  createdAt: string;
  updatedAt: string;
};

function parseMemos(raw: string | null): StickyMemo[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StickyMemo => {
      if (!item || typeof item !== 'object') return false;
      const memo = item as Partial<StickyMemo>;
      return typeof memo.id === 'string' && typeof memo.body === 'string';
    }).map(item => ({
      id: item.id,
      title: typeof item.title === 'string' ? item.title : '',
      body: item.body,
      color: STICKY_COLORS.includes(item.color as StickyColor)
        ? (item.color as StickyColor)
        : STICKY_COLORS[0],
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : nowIso(),
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : nowIso(),
    }));
  } catch {
    return [];
  }
}

export async function loadStickyMemos(): Promise<StickyMemo[]> {
  try {
    const raw = await AsyncStorage.getItem(MEMO_STORAGE_KEY);
    return parseMemos(raw);
  } catch {
    return [];
  }
}

export async function saveStickyMemos(memos: StickyMemo[]): Promise<void> {
  await AsyncStorage.setItem(MEMO_STORAGE_KEY, JSON.stringify(memos));
}

export function createStickyMemo(color?: StickyColor): StickyMemo {
  const stamp = nowIso();
  return {
    id: createId('memo'),
    title: '',
    body: '',
    color: color ?? STICKY_COLORS[0],
    createdAt: stamp,
    updatedAt: stamp,
  };
}
