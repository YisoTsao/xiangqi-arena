'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Home, RefreshCw } from 'lucide-react';
import type { TimeControlId } from '@xiangqi-arena/game-protocol';
import type { XiangqiMode } from '@xiangqi-arena/games-xiangqi';
import { Lobby } from './Lobby';
import { GameScreen } from '../game/GameScreen';
import { Button } from '../ui/button';
import { Logo } from '../Logo';
import { useOnline } from '@/lib/net/online';

interface Props {
  code: string;
  createMode?: XiangqiMode;
  createTimeControl?: TimeControlId;
}

/** 線上房間：依階段顯示大廳或對戰畫面，並負責建立 / 加入 / 重連 */
export function RoomScreen({ code, createMode, createTimeControl }: Props) {
  const router = useRouter();
  const {
    status,
    error,
    snapshot,
    snapshotAt,
    roomCode,
    createRoom,
    joinRoom,
    send,
    leave,
    retry,
  } = useOnline();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (code === 'NEW') {
      void createRoom(createMode ?? 'classic', createTimeControl).then((id) => {
        if (id) router.replace(`/room/${id}`);
      });
    } else if (roomCode !== code || status === 'idle') {
      void joinRoom(code);
    }
  }, [code, createMode, createTimeControl, createRoom, joinRoom, roomCode, status, router]);

  const exit = async () => {
    await leave();
    router.push('/');
  };

  if (status === 'error' || status === 'replaced' || (status === 'offline' && !snapshot)) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-5 text-center">
          <Logo />
          <p className="text-lg text-ink-100" data-testid="room-error">
            {error ?? '連線中斷'}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.push('/')}>
              <Home /> 回首頁
            </Button>
            {code !== 'NEW' && (
              <Button variant="primary" onClick={() => void retry()}>
                <RefreshCw /> 重試
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!snapshot || (code !== 'NEW' && snapshot.roomCode !== code)) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex flex-col items-center gap-4 text-ink-300">
          <div className="size-10 animate-spin rounded-full border-2 border-gold-400/30 border-t-gold-400" />
          {code === 'NEW' ? '建立房間中…' : '連線中…'}
        </div>
      </div>
    );
  }

  if (snapshot.phase === 'lobby' || !snapshot.game) {
    return <Lobby snapshot={snapshot} send={send} onLeave={exit} />;
  }
  return (
    <GameScreen
      snapshot={snapshot}
      snapshotAt={snapshotAt}
      send={send}
      variant="online"
      connection={status}
      onExit={exit}
    />
  );
}
