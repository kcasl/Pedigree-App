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
