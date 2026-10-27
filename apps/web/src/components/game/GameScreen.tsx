'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { opposite, otherSeat, type Seat } from '@xiangqi-arena/game-core';
import {
  Flag,
  Handshake,
  ListOrdered,
  LogOut,
  Settings,
  Trophy,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react';
import { GameBoard } from './GameBoard';
import { PlayerPanel } from './PlayerPanel';
import { MoveList } from './MoveList';
import { EndDialog } from './EndDialog';
import { useNow } from './useNow';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Logo } from '../Logo';
import { SettingsDialog } from '../SettingsDialog';
import type { ConnectionStatus, IntentInput } from '@/lib/controller';
import { handleSquareClick, toBoardModel } from '@/lib/interaction';
import type { XiangqiSnapshot } from '@/lib/xiangqi';
import { useSettings } from '@/lib/settings';
import { playSound } from '@/lib/sound';
import { cn } from '@/lib/utils';

interface Props {
  snapshot: XiangqiSnapshot;
  snapshotAt: number;
  send: (intent: IntentInput) => void;
  variant: 'online' | 'local';
  connection?: ConnectionStatus;
  onExit: () => void;
}

export function GameScreen({ snapshot, snapshotAt, send, variant, connection, onExit }: Props) {
  const game = snapshot.game!;
  const local = variant === 'local';
  // 象棋固定兩個座位
  const you = snapshot.yourSeat as Seat | null;
  const turnSeat = game.turnSeat as Seat | null;
  const { sound, setSound } = useSettings();
  const [selected, setSelected] = useState<number | null>(null);
  const [hideEnd, setHideEnd] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [showMoves, setShowMoves] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const now = useNow(
    200,
    snapshot.clock?.running != null || snapshot.abandonDeadlineMs.some((d) => d !== null),
  );

  // 下方固定為「我」；本機模式下方固定為紅方 / 玩家一
  const bottomSeat: Seat = local
    ? game.mode === 'classic'
      ? game.seatSides[0] === 'red'
        ? 0
        : 1
      : 0
    : (you ?? 0);
  const topSeat = otherSeat(bottomSeat);
  const flipped = game.mode === 'classic' && game.seatSides[bottomSeat] === 'black';
  const myTurn = you !== null && game.turnSeat === you && !game.outcome;
  const interactive = myTurn && (local || connection === 'connected');

  useEffect(() => {
    setSelected(null);
  }, [game.version]);
  useEffect(() => {
    if (snapshot.phase === 'playing') setHideEnd(false);
  }, [snapshot.phase, snapshot.matchNumber]);

  // 音效：落子、吃子、翻棋、將軍、勝負
  const lastPly = useRef<number | null>(game.lastAction?.ply ?? null);
  useEffect(() => {
    const la = game.lastAction;
    if (!la || la.ply === lastPly.current) return;
    lastPly.current = la.ply;
    if (la.captured) playSound('capture', sound);
    else if (la.kind === 'flip') playSound('flip', sound);
    else playSound('move', sound);
    if (game.checkSquare !== null && !game.outcome)
      setTimeout(() => playSound('check', sound), 180);
  }, [game.lastAction, game.checkSquare, game.outcome, sound]);
  const outcomeKey = useRef<string | null>(null);
  useEffect(() => {
    const key = game.outcome ? `${snapshot.matchNumber}` : null;
    if (!game.outcome || key === outcomeKey.current) return;
    outcomeKey.current = key;
    const o = game.outcome;
    setTimeout(() => {
      if (o.type === 'draw') playSound('draw', sound);
      else if (local || you === null) playSound('win', sound);
      else playSound(o.winner === you ? 'win' : 'lose', sound);
    }, 350);
  }, [game.outcome, snapshot.matchNumber, sound, local, you]);

  const model = useMemo(
    () => toBoardModel(game, { selected, flipped, interactive }),
    [game, selected, flipped, interactive],
  );

  const onSquareClick = (square: number) => {
    const r = handleSquareClick(game, you, selected, square);
    if (r.action) send({ type: 'action', action: r.action });
    else if (r.selected !== null && r.selected !== selected) playSound('select', sound);
    setSelected(r.selected);
  };

  const clockOf = (seat: Seat): number | null => {
    const c = snapshot.clock;
    if (!c) return null;
    const elapsed = c.running === seat ? now - snapshotAt : 0;
    return Math.max(0, (c.remainingMs[seat] ?? 0) - elapsed);
  };
  const abandonOf = (seat: Seat): number | null => {
    const d = snapshot.abandonDeadlineMs[seat] ?? null;
    return d === null ? null : Math.max(0, d - (now - snapshotAt));
  };
  const capturedBy = (seat: Seat) => {
    const side = game.seatSides[seat];
    if (!side) return { list: [], side: null };
    const victim = opposite(side);
    return { list: game.captured[victim], side: victim };
  };

  const panel = (seat: Seat) => {
    const cap = capturedBy(seat);
    return (
      <PlayerPanel
        seat={snapshot.seats[seat] ?? null}
        side={game.seatSides[seat]}
        isTurn={game.turnSeat === seat}
        isYou={!local && seat === you}
        clockMs={clockOf(seat)}
        captured={cap.list}
        capturedSide={cap.side}
        abandonInMs={abandonOf(seat)}
      />
    );
  };

  const sideName = (seat: Seat | null) => {
    if (seat === null) return '';
    const side = game.seatSides[seat];
    return local
      ? side === 'red'
        ? '紅方'
        : side === 'black'
          ? '黑方'
          : (snapshot.seats[seat]?.name ?? '')
      : (snapshot.seats[seat]?.name ?? '');
  };

  const status = game.outcome
    ? '對局結束'
    : local
      ? `${sideName(turnSeat)}走棋${game.mode === 'banqi' && !game.seatSides[0] ? '（翻棋決定陣營）' : ''}`
      : myTurn
        ? '輪到你了'
        : '對手思考中…';

  const opponentOffered =
    !local && snapshot.drawOfferSeat !== null && snapshot.drawOfferSeat !== you;
  const youOffered = !local && snapshot.drawOfferSeat !== null && snapshot.drawOfferSeat === you;
  const playing = snapshot.phase === 'playing';

  const ended = snapshot.phase === 'ended';
  const controls = ended ? (
    <Button variant="primary" onClick={() => setHideEnd(false)}>
      <Trophy /> 查看結果
    </Button>
  ) : (
    <div className="grid grid-cols-2 gap-2">
      <Button
        variant="secondary"
        onClick={() => send({ type: 'offerDraw' })}
        disabled={!playing || youOffered}
        data-testid="offer-draw"
      >
        <Handshake /> {local ? '和棋' : youOffered ? '已提議' : '求和'}
      </Button>
      <Button
        variant="secondary"
        onClick={() => setConfirmResign(true)}
        disabled={!playing}
        data-testid="resign"
      >
        <Flag /> 認輸
      </Button>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_340px]">
      <main className="flex min-h-0 flex-1 flex-col gap-2 p-2 sm:p-3 lg:p-4">
        <header className="flex items-center justify-between gap-2 px-1">
          <Logo size="sm" className="hidden sm:flex" />
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'truncate rounded-full px-3 py-1 text-sm font-medium',
                myTurn || local ? 'bg-gold-400/15 text-gold-300' : 'bg-ink-800 text-ink-300',
              )}
              data-testid="turn-status"
            >
              {status}
            </span>
            {!local && (
              <span className="hidden font-mono text-xs text-ink-400 sm:inline">
                房間 {snapshot.roomCode}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSound(!sound)}
              aria-label={sound ? '關閉音效' : '開啟音效'}
            >
              {sound ? <Volume2 /> : <VolumeX />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSettings(true)}
              aria-label="設定"
            >
              <Settings />
            </Button>
            <Button variant="ghost" size="icon" onClick={onExit} aria-label="離開">
              <LogOut />
            </Button>
          </div>
        </header>

        {!local && connection && connection !== 'connected' && (
          <div
            className="flex items-center gap-2 rounded-xl border border-cinnabar-400/40 bg-cinnabar-500/15 px-3 py-2 text-sm text-cinnabar-400"
            role="status"
          >
            <WifiOff className="size-4" />
            {connection === 'reconnecting' ? '連線中斷，正在重新連線…' : '已離線，請檢查網路'}
          </div>
        )}

        {panel(topSeat)}

        <div
          className="relative min-h-[260px] flex-1 overflow-hidden rounded-2xl border border-ink-700/60 bg-ink-950 shadow-inner"
          data-testid="board"
        >
          <GameBoard model={model} onSquareClick={onSquareClick} />
          {opponentOffered && playing && (
            <div className="absolute inset-x-2 top-2 flex animate-rise flex-wrap items-center justify-between gap-2 rounded-xl border border-gold-400/40 bg-ink-900/95 px-3 py-2 text-sm shadow-xl">
              <span>對手提議和棋</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => send({ type: 'respondDraw', accept: true })}
                >
                  接受
                </Button>
                <Button size="sm" onClick={() => send({ type: 'respondDraw', accept: false })}>
                  拒絕
                </Button>
              </div>
            </div>
          )}
        </div>

        {panel(bottomSeat)}

        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 lg:hidden">
          {ended ? (
            <Button variant="primary" className="col-span-2" onClick={() => setHideEnd(false)}>
              <Trophy /> 查看結果
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => send({ type: 'offerDraw' })}
                disabled={!playing || youOffered}
                data-testid="offer-draw"
              >
                <Handshake /> {local ? '和棋' : youOffered ? '已提議' : '求和'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmResign(true)}
                disabled={!playing}
                data-testid="resign"
              >
                <Flag /> 認輸
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setShowMoves(true)}
            aria-label="棋譜"
          >
            <ListOrdered />
          </Button>
        </div>
      </main>

      <aside className="hidden min-h-0 flex-col gap-3 border-l border-ink-800 bg-ink-900/50 p-4 lg:flex">
        <div className="rounded-2xl border border-ink-700/70 bg-ink-900/80 p-4">
          <div className="text-xs tracking-widest text-ink-400">
            {game.mode === 'classic' ? '大盤象棋' : '暗棋'}
          </div>
          <div className="mt-1 font-serif text-lg">{status}</div>
          <div className="mt-2 text-xs text-ink-400">
            無進展步數 {game.progress.plySinceProgress} / {game.progress.limit}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-ink-700/70 bg-ink-900/80 p-3">
          <div className="mb-2 px-1 text-sm font-medium text-ink-300">棋譜</div>
          <MoveList moves={game.moveList} className="min-h-0 flex-1" />
        </div>
        {controls}
      </aside>

      {showMoves && (
        <div
          className="fixed inset-0 z-30 flex flex-col justify-end bg-black/50 lg:hidden"
          onClick={() => setShowMoves(false)}
        >
          <div
            className="max-h-[60dvh] animate-rise rounded-t-3xl border-t border-ink-700 bg-ink-900 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-serif text-lg">棋譜</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowMoves(false)}
                aria-label="關閉"
              >
                <X />
              </Button>
            </div>
            <MoveList moves={game.moveList} className="max-h-[45dvh]" />
          </div>
        </div>
      )}

      <Dialog open={confirmResign} onClose={() => setConfirmResign(false)} title="確定要認輸嗎？">
        <p className="mb-5 text-ink-300">認輸後本局立即結束並判負。</p>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setConfirmResign(false)}>取消</Button>
          <Button
            variant="danger"
            data-testid="confirm-resign"
            onClick={() => {
              setConfirmResign(false);
              send({ type: 'resign' });
            }}
          >
            認輸
          </Button>
        </div>
      </Dialog>

      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />

      {game.outcome && !hideEnd && (
        <EndDialog
          outcome={game.outcome}
          yourSeat={local ? null : you}
          winnerName={game.outcome.type === 'win' ? sideName(game.outcome.winner as Seat) : null}
          rematchVotes={snapshot.rematchVotes}
          canRematch={local || snapshot.seats.every((s) => s !== null)}
          onRematch={() => send({ type: 'rematch' })}
          onViewBoard={() => setHideEnd(true)}
          onExit={onExit}
        />
      )}
    </div>
  );
}
