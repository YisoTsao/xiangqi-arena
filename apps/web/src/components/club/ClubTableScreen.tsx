'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Crown, LogOut, Users } from 'lucide-react';
import { clubTableCapacity, clubTableGame, type RoomSnapshot } from '@xiangqi-arena/game-protocol';
import type { MahjongActionInput } from '@xiangqi-arena/games-mahjong';
import { BigTwoPracticeScreen } from '../bigtwo/BigTwoPracticeScreen';
import { BigTwoScreen } from '../bigtwo/BigTwoScreen';
import { GameScreen } from '../game/GameScreen';
import { LocalScreen } from '../LocalScreen';
import { MahjongPracticeScreen } from '../mahjong/MahjongPracticeScreen';
import { MahjongScreen } from '../mahjong/MahjongScreen';
import { Button } from '../ui/button';
import type { IntentInput } from '@/lib/controller';
import { toBigTwoSnapshot } from '@/lib/bigTwo';
import { toMahjongSnapshot, type MahjongSnapshot } from '@/lib/mahjong';
import { setOnlineIdentity, useOnline } from '@/lib/net/online';
import { toXiangqiSnapshot } from '@/lib/xiangqi';
import { cn } from '@/lib/utils';
import type { Interactable } from './layout';
import { clubIdentity, useClubNet } from './net';

const GAME_LABEL: Record<string, string> = {
  classic: '大盤象棋',
  banqi: '暗棋',
  'big-two': '大老二',
  mahjong: '麻將東風圈',
};

function tableTitle(table: Interactable): string {
  const n = table.id.split('-')[1];
  const { gameId, mode } = clubTableGame(table.id);
  const game = gameId === 'xiangqi' ? GAME_LABEL[mode] : GAME_LABEL[gameId];
  const where = table.kind === 'chess' ? '棋桌' : table.kind === 'cards' ? '牌桌' : '桌';
  return `${n} 號${where} · ${game}`;
}

/** 沒得吃碰胡就自動「過」（和練習模式一樣的固定延遲，不從等待時間洩漏手牌） */
const AUTO_PASS_MS = 450;

function MahjongOnline({
  snapshot,
  send,
  onExit,
  title,
}: {
  snapshot: MahjongSnapshot;
  send: (i: IntentInput) => void;
  onExit: () => void;
  title: string;
}) {
  const view = snapshot.game!;
  const you = snapshot.yourSeat ?? 0;
  const names = snapshot.seats.map((s, i) => s?.name ?? `座位 ${i + 1}`);
  const phase = view.phase;
  const o = view.options;
  const mustPass =
    phase.type === 'claim' &&
    !phase.responded &&
    view.activeSeats.includes(you) &&
    !o.win &&
    !o.pung &&
    !o.kong &&
    o.chow.length === 0;
  useEffect(() => {
    if (!mustPass) return;
    const id = setTimeout(() => send({ type: 'action', action: { kind: 'pass' } }), AUTO_PASS_MS);
    return () => clearTimeout(id);
  }, [mustPass, view.version, send]);
  const act = (a: MahjongActionInput) => {
    // 一將打完：「再來一將」要大家都同意，走平台的再戰流程
    if (phase.type === 'over' && a.kind === 'next') send({ type: 'rematch' });
    else send({ type: 'action', action: a });
  };
  return (
    <MahjongScreen view={view} you={you} names={names} send={act} onExit={onExit} title={title} />
  );
}

/** 等人坐滿：列出座位，坐滿而且大家都準備好，開桌的人那邊自動開局 */
function Waiting({
  table,
  snapshot,
  note,
  onExit,
  onPractice,
}: {
  table: Interactable;
  snapshot: RoomSnapshot | null;
  note: string;
  onExit: () => void;
  onPractice?: () => void;
}) {
  const cap = clubTableCapacity(table.id);
  const seats = snapshot?.seats ?? Array.from({ length: cap }, () => null);
  const filled = seats.filter(Boolean).length;
  const you = snapshot?.yourSeat ?? null;
  const host = snapshot?.hostSeat ?? null;
  return (
    <div className="grid min-h-dvh place-items-center bg-[#141018]/95 p-4">
      <div
        data-testid="club-table-waiting"
        className="w-full max-w-sm rounded-3xl border border-[#F2B552]/40 bg-[#24344D]/90 p-5 text-[#F2DAB6] shadow-2xl animate-rise"
      >
        <div className="text-xs tracking-[0.3em] text-[#F2DAB6]/70">暮光遊樂館</div>
        <h2 className="mt-1 font-serif text-2xl font-bold">{tableTitle(table)}</h2>
        <p className="mt-2 text-sm text-[#F2DAB6]/80" data-testid="club-table-note">
          {note}
        </p>
        <div className="mt-4 flex items-center gap-2 text-sm">
          <Users className="size-4" />
          <span data-testid="club-table-count">
            {filled}/{cap} 人
          </span>
        </div>
        <ul className="mt-2 grid gap-1.5">
          {seats.map((s, i) => (
            <li
              key={i}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm',
                s
                  ? 'border-[#F2B552]/40 bg-[#F2B552]/10'
                  : 'border-dashed border-white/15 text-[#F2DAB6]/45',
              )}
            >
              {i === host && s && <Crown className="size-3.5 text-[#F2B552]" aria-label="開桌" />}
              <span className="flex-1 truncate">{s ? s.name : '空位，等人入座…'}</span>
              {i === you && <span className="text-xs text-[#F2DAB6]/70">你</span>}
              {s && !s.connected && <span className="text-xs text-[#E95B4B]">斷線</span>}
            </li>
          ))}
        </ul>
        <div className="mt-5 grid gap-2">
          {onPractice && (
            <Button variant="secondary" onClick={onPractice} data-testid="club-table-practice">
              <Bot /> {table.kind === 'chess' ? '改成同一台裝置對弈' : '先和電腦練習'}
            </Button>
          )}
          <Button variant="ghost" onClick={onExit} data-testid="club-table-leave">
            <LogOut /> 離開座位
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * 俱樂部的桌子：第一個坐下的人開桌（伺服器替這張桌子開一間對局房間），
 * 之後坐下的人加入同一間；坐滿、大家都準備好才開局。連不上伺服器時可以改玩單機練習。
 */
export function ClubTableScreen({ table, onExit }: { table: Interactable; onExit: () => void }) {
  const netStatus = useClubNet((s) => s.status);
  const code = useClubNet((s) => s.tableRooms[table.id] ?? null);
  const { status, error, snapshot, snapshotAt, send } = useOnline();
  const [practice, setPractice] = useState(false);
  const title = tableTitle(table);

  useEffect(() => {
    if (!code || practice) return;
    setOnlineIdentity(clubIdentity());
    void useOnline.getState().joinRoom(code);
  }, [code, practice]);

  // 離開座位（或整個俱樂部畫面卸載）：退出對局房間，身分換回一般的
  useEffect(
    () => () => {
      void useOnline.getState().leave();
      setOnlineIdentity(null);
    },
    [],
  );

  const snap = snapshot && code && snapshot.roomCode === code ? snapshot : null;

  // 在等人的階段自動「準備」；坐滿又都準備好時，由開桌的人開局（每個房間版本只送一次）
  const sentFor = useRef<string>('');
  useEffect(() => {
    if (!snap || snap.phase !== 'lobby' || snap.yourSeat === null) return;
    const key = `${snap.roomCode}:${snap.roomVersion}`;
    if (sentFor.current === key) return;
    const me = snap.seats[snap.yourSeat];
    if (me && !me.ready) {
      sentFor.current = key;
      send({ type: 'setReady', ready: true });
    } else if (
      snap.yourSeat === snap.hostSeat &&
      snap.seats.every((s) => s?.ready && s.connected)
    ) {
      sentFor.current = key;
      send({ type: 'start' });
    }
  }, [snap, send]);

  const xiangqi = useMemo(() => (snap ? toXiangqiSnapshot(snap) : null), [snap]);
  const bigTwo = useMemo(() => (snap ? toBigTwoSnapshot(snap) : null), [snap]);
  const mahjong = useMemo(() => (snap ? toMahjongSnapshot(snap) : null), [snap]);

  if (practice) {
    if (table.kind === 'cards') return <BigTwoPracticeScreen onExit={onExit} />;
    if (table.kind === 'chess')
      return <LocalScreen initialMode={table.mode ?? 'classic'} onExit={onExit} />;
    return <MahjongPracticeScreen onExit={onExit} />;
  }

  const offline = netStatus === 'offline' || netStatus === 'idle';
  if (status === 'error' || status === 'replaced') {
    return (
      <Waiting
        table={table}
        snapshot={null}
        note={error ?? '連線中斷'}
        onExit={onExit}
        onPractice={() => setPractice(true)}
      />
    );
  }

  if (!snap || snap.phase === 'lobby' || !snap.game) {
    const filled = snap?.seats.filter(Boolean).length ?? 0;
    const cap = clubTableCapacity(table.id);
    const isHost = snap !== null && snap.yourSeat === snap.hostSeat;
    const note = offline
      ? '連不上遊戲伺服器，暫時沒辦法和其他人同桌。'
      : !snap
        ? '入座中…'
        : filled < cap
          ? isHost
            ? `你開了這一桌，還差 ${cap - filled} 人，坐滿就開打。`
            : `還差 ${cap - filled} 人，坐滿就開打。`
          : '人到齊了，準備開局…';
    return (
      <Waiting
        table={table}
        snapshot={snap}
        note={note}
        onExit={onExit}
        onPractice={offline ? () => setPractice(true) : undefined}
      />
    );
  }

  if (xiangqi) {
    return (
      <GameScreen
        snapshot={xiangqi}
        snapshotAt={snapshotAt}
        send={send}
        variant="online"
        connection={status}
        onExit={onExit}
      />
    );
  }
  if (bigTwo) {
    return (
      <BigTwoScreen
        snapshot={bigTwo}
        snapshotAt={snapshotAt}
        send={send}
        variant="online"
        connection={status}
        onExit={onExit}
      />
    );
  }
  if (mahjong?.game) {
    return <MahjongOnline snapshot={mahjong} send={send} onExit={onExit} title={title} />;
  }
  return null;
}
