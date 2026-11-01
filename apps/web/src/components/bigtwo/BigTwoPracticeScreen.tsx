'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BigTwoScreen } from './BigTwoScreen';
import { useBigTwoPractice } from '@/lib/local/bigTwoPractice';

interface Props {
  /** 離開時呼叫；省略時回首頁 */
  onExit?: () => void;
}

/** 和三位電腦玩家練習大老二；進入頁面就開局 */
export function BigTwoPracticeScreen({ onExit }: Props) {
  const router = useRouter();
  const { snapshot, snapshotAt, start, send, stop } = useBigTwoPractice();
  useEffect(() => {
    start();
    return () => stop();
  }, [start, stop]);

  if (!snapshot?.game) {
    return (
      <div className="grid min-h-dvh place-items-center text-ink-300">
        <div className="size-10 animate-spin rounded-full border-2 border-gold-400/30 border-t-gold-400" />
      </div>
    );
  }
  return (
    <BigTwoScreen
      snapshot={snapshot}
      snapshotAt={snapshotAt}
      send={send}
      variant="practice"
      onExit={() => {
        stop();
        if (onExit) onExit();
        else router.push('/');
      }}
    />
  );
}
