'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MahjongScreen } from './MahjongScreen';
import {
  MAHJONG_PRACTICE_NAMES,
  MAHJONG_YOU,
  useMahjongPractice,
} from '@/lib/local/mahjongPractice';

interface Props {
  /** 離開時呼叫；省略時回首頁 */
  onExit?: () => void;
}

/** 和三位電腦玩家打一將東風圈；進入頁面就開局 */
export function MahjongPracticeScreen({ onExit }: Props) {
  const router = useRouter();
  const { view, start, send, stop } = useMahjongPractice();
  useEffect(() => {
    start();
    return () => stop();
  }, [start, stop]);

  if (!view) {
    return (
      <div className="grid min-h-dvh place-items-center text-ink-300">
        <div className="size-10 animate-spin rounded-full border-2 border-gold-400/30 border-t-gold-400" />
      </div>
    );
  }
  return (
    <MahjongScreen
      view={view}
      you={MAHJONG_YOU}
      names={MAHJONG_PRACTICE_NAMES}
      send={send}
      onExit={() => {
        stop();
        if (onExit) onExit();
        else router.push('/');
      }}
    />
  );
}
