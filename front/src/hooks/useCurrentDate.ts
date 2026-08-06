import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

function msUntilNextLocalMidnight(from: Date): number {
  const next = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1, 0, 0, 1, 0);
  return Math.max(1000, next.getTime() - from.getTime());
}

/** 오늘 날짜 — 자정·앱 복귀 시 갱신 (만 나이 계산용) */
export function useCurrentDate(): Date {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => setToday(new Date());
    const scheduleMidnight = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        refresh();
        scheduleMidnight();
      }, msUntilNextLocalMidnight(new Date()));
    };

    scheduleMidnight();

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') refresh();
    };
    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, []);

  return today;
}
