'use client';

import { useEffect, useState } from 'react';

/** 每 interval 毫秒更新一次的 performance.now()，用於倒數顯示 */
export function useNow(interval = 200, active = true): number {
  const [now, setNow] = useState(() =>
    typeof performance === 'undefined' ? 0 : performance.now(),
  );
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(performance.now()), interval);
    return () => clearInterval(id);
  }, [interval, active]);
  return now;
}
