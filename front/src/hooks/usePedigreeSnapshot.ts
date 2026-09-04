/**
 * 로그인 사용자의 로컬 족보를 읽기 전용으로 구독한다.
 * 연락처·기념일 등 편집 화면 바깥에서 store 스냅샷이 필요할 때 사용.
 * 족보 편집·저장은 PedigreeScreen이 담당한다.
 */

import { useEffect, useState } from 'react';
import type { PedigreeStore } from '../types/lineage';
import { loadPedigreeStore } from '../storage/pedigreeStorage';

export function usePedigreeSnapshot() {
  const [store, setStore] = useState<PedigreeStore | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    loadPedigreeStore()
      .then(next => {
        if (!mounted) return;
        setStore(next);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return { store, loading };
}
