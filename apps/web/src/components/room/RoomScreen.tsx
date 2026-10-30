'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Home, RefreshCw } from 'lucide-react';
import type { TimeControlId } from '@xiangqi-arena/game-protocol';
import { Lobby } from './Lobby';
import { GameScreen } from '../game/GameScreen';
import { BigTwoScreen } from '../bigtwo/BigTwoScreen';
import { Button } from '../ui/button';
import { Logo } from '../Logo';
import { useOnline } from '@/lib/net/online';
import { toBigTwoSnapshot } from '@/lib/bigTwo';
import { toXiangqiSnapshot } from '@/lib/xiangqi';

interface Props {
  code: string;
  /** 建立新房間（code = NEW）時的遊戲與模式 */
  createGame?: string;
  createMode?: string;
  createTimeControl?: TimeControlId;
}

/** 線上房間：依階段顯示大廳或對戰畫面，並負責建立 / 加入 / 重連 */
export function RoomScreen({ code, createGame, createMode, createTimeControl }: Props) {
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
  const [left, setLeft] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (code === 'NEW') {
      const gameId = createGame ?? 'xiangqi';
      const mode = createMode ?? (gameId === 'xiangqi' ? 'classic' : 'standard');
      void createRoom(gameId, mode, createTimeControl).then((id) => {
        if (id) router.replace(`/room/${id}`);
      });
    } else if (roomCode !== code || status === 'idle') {
      void joinRoom(code);
    }
  }, [
    code,
    createGame,
    createMode,
    createTimeControl,
    createRoom,
    joinRoom,
    roomCode,
    status,
    router,
  ]);
  const xiangqi = useMemo(() => (snapshot ? toXiangqiSnapshot(snapshot) : null), [snapshot]);
  const bigTwo = useMemo(() => (snapshot ? toBigTwoSnapshot(snapshot) : null), [snapshot]);

  // 先導回首頁再斷線：leave() 一開始就清空房間狀態，若等它結束才導頁，
  // 畫面會停在「連線中…」；連線已斷或伺服器沒回應時甚至永遠等不到
  const exit = () => {
    if (left) return;
    setLeft(true);
    router.push('/');
    void leave();
  };

  if (left) return <div className="min-h-dvh" data-testid="room-leaving" />;

  if (status === 'error' || status === 'replaced' || (status === 'offline' && !snapshot)) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-5 text-center">
          <Logo />
          <p className="text-lg text-ink-100" data-testid="room-error">
            {error ?? '連線中斷'}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exit} data-testid="room-home">
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
  if (bigTwo) {
    return (
      <BigTwoScreen
        snapshot={bigTwo}
        snapshotAt={snapshotAt}
        send={send}
        variant="online"
        connection={status}
        onExit={exit}
      />
    );
  }
  if (!xiangqi) return null;
  return (
    <GameScreen
      snapshot={xiangqi}
      snapshotAt={snapshotAt}
      send={send}
      variant="online"
      connection={status}
      onExit={exit}
    />
  );
}
