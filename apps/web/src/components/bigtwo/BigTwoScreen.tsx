'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  Flag,
  Lightbulb,
  ListOrdered,
  LogOut,
  Settings,
  Trophy,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react';
import {
  COMBO_LABELS,
  hintsForView,
  previewPlay,
  sortBySuit,
  sortCards,
  type BigTwoActionInput,
  type BigTwoMatchView,
  type Card,
} from '@xiangqi-arena/games-big-two';
import { BigTwoEndDialog } from './BigTwoEndDialog';
import { CardBack, CardRow, PlayingCard } from './PlayingCard';
import { useNow } from '../game/useNow';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Logo } from '../Logo';
import { SettingsDialog } from '../SettingsDialog';
import type { ConnectionStatus, IntentInput } from '@/lib/controller';
import type { BigTwoSnapshot } from '@/lib/bigTwo';
import { errorMessage } from '@/lib/games';
import { useSettings } from '@/lib/settings';
import { playSound } from '@/lib/sound';
import { toast } from '@/lib/toast';
import { cn, formatClock } from '@/lib/utils';

interface Props {
  snapshot: BigTwoSnapshot;
  snapshotAt: number;
  send: (intent: IntentInput<BigTwoActionInput>) => void;
  /** practice = 本機和電腦練習 */
  variant: 'online' | 'practice';
  connection?: ConnectionStatus;
  onExit: () => void;
}

type Position = 'left' | 'top' | 'right';

/** 出牌順序是座位 0 → 1 → 2 → 3；畫面上下家在右邊、對家在上面、上家在左邊 */
const POSITIONS: Position[] = ['right', 'top', 'left'];

export function BigTwoScreen({ snapshot, snapshotAt, send, variant, connection, onExit }: Props) {
  const game = snapshot.game!;
  const you = snapshot.yourSeat ?? 0;
  const seats = game.handCounts.length;
  const { sound, setSound } = useSettings();
  const [selected, setSelected] = useState<Card[]>([]);
  const [bySuit, setBySuit] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const [hideEnd, setHideEnd] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const now = useNow(
    200,
    snapshot.clock?.running != null || snapshot.abandonDeadlineMs.some((d) => d !== null),
  );

  const myTurn = snapshot.yourSeat !== null && game.turnSeat === you && !game.outcome;
  const interactive = myTurn && (variant === 'practice' || connection === 'connected');
  const playing = snapshot.phase === 'playing';
  const hand = useMemo(
    () => (bySuit ? sortBySuit(game.hand) : sortCards(game.hand)),
    [game.hand, bySuit],
  );
  const preview = useMemo(() => previewPlay(game, you, selected), [game, you, selected]);
  const hints = useMemo(() => (myTurn ? hintsForView(game, you) : []), [game, you, myTurn]);

  // 手牌或回合變了：清掉不在手上的選牌，提示從頭開始
  useEffect(() => {
    setSelected((sel) => sel.filter((c) => game.hand.includes(c)));
    setHintIndex(0);
  }, [game.version, game.hand]);
  useEffect(() => {
    if (snapshot.phase === 'playing') setHideEnd(false);
  }, [snapshot.phase, snapshot.matchNumber]);

  // 音效：出牌、過牌、輪到自己、勝負
  const lastSeq = useRef<number>(game.history.at(-1)?.seq ?? 0);
  useEffect(() => {
    const last = game.history.at(-1);
    if (!last || last.seq === lastSeq.current) return;
    lastSeq.current = last.seq;
    if (last.kind === null) playSound('select', sound);
    else playSound(last.cards.length === 5 ? 'capture' : 'move', sound);
    if (myTurn) setTimeout(() => playSound('notify', sound), 220);
  }, [game.history, myTurn, sound]);
  const outcomeKey = useRef<string | null>(null);
  useEffect(() => {
    if (!game.outcome) return;
    const key = `${snapshot.matchNumber}`;
    if (key === outcomeKey.current) return;
    outcomeKey.current = key;
    const o = game.outcome;
    setTimeout(() => playSound(o.type === 'win' && o.winner === you ? 'win' : 'lose', sound), 350);
  }, [game.outcome, snapshot.matchNumber, sound, you]);

  const nameOf = (seat: number) =>
    snapshot.seats[seat]?.name ?? (variant === 'practice' ? `電腦 ${seat}` : '空位');
  const clockOf = (seat: number): number | null => {
    const c = snapshot.clock;
    if (!c) return null;
    const elapsed = c.running === seat ? now - snapshotAt : 0;
    return Math.max(0, (c.remainingMs[seat] ?? 0) - elapsed);
  };
  const abandonOf = (seat: number): number | null => {
    const d = snapshot.abandonDeadlineMs[seat] ?? null;
    return d === null ? null : Math.max(0, d - (now - snapshotAt));
  };

  const toggle = (card: Card) => {
    if (!playing) return;
    playSound('select', sound);
    setSelected((sel) => (sel.includes(card) ? sel.filter((c) => c !== card) : [...sel, card]));
  };
  const submitPlay = () => {
    if (!interactive) return;
    if (!preview.ok) {
      toast(errorMessage(preview.error === 'EMPTY' ? 'ILLEGAL_ACTION' : preview.error), 'error');
      return;
    }
    send({ type: 'action', action: { kind: 'play', cards: preview.combo.cards } });
    setSelected([]);
  };
  const submitPass = () => {
    if (!interactive || !game.table) return;
    send({ type: 'action', action: { kind: 'pass' } });
    setSelected([]);
  };
  const hint = () => {
    if (hints.length === 0) {
      toast('沒有壓得過的牌，只能過牌');
      return;
    }
    const h = hints[hintIndex % hints.length]!;
    setSelected(h.cards);
    setHintIndex((i) => i + 1);
  };

  const turnName = game.turnSeat === null ? '' : nameOf(game.turnSeat);
  const status = game.outcome
    ? '本局結束'
    : myTurn
      ? game.opening
        ? '輪到你先出（要包含梅花 3）'
        : game.table
          ? '輪到你了'
          : '輪到你自由出牌'
      : `${turnName} 出牌中…`;

  const tableInfo = game.table
    ? `${COMBO_LABELS[game.table.kind]} · ${nameOf(game.table.seat)}`
    : null;
  const myMark = game.round[you];

  const opponent = (offset: number) => {
    const seat = (you + offset) % seats;
    const pos = POSITIONS[offset - 1]!;
    const mark = game.round[seat];
    const isTurn = game.turnSeat === seat && !game.outcome;
    const clock = clockOf(seat);
    const abandon = abandonOf(seat);
    const s = snapshot.seats[seat];
    return (
      <div
        key={seat}
        className={cn(
          'flex min-w-0 items-center gap-2',
          pos === 'top' && 'flex-col',
          pos === 'left' && 'flex-col sm:flex-row',
          pos === 'right' && 'flex-col sm:flex-row-reverse',
        )}
        data-testid={`seat-${seat}`}
      >
        <div
          className={cn(
            'flex min-w-0 max-w-[7.5rem] items-center sm:max-w-[9.5rem] gap-2 rounded-2xl border bg-ink-900/85 px-2.5 py-1.5 transition-all',
            isTurn ? 'animate-glow border-gold-400/70' : 'border-ink-700/70',
          )}
        >
          <div className="relative">
            <CardBack size="xs" />
            <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-gold-400 text-[11px] font-bold text-ink-950">
              {game.handCounts[seat]}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="truncate text-sm font-medium">{nameOf(seat)}</span>
              {s && !s.connected && variant === 'online' && <Badge variant="danger">離線</Badge>}
            </div>
            {clock !== null ? (
              <div
                className={cn(
                  'font-mono text-xs tabular-nums',
                  isTurn ? 'text-gold-300' : 'text-ink-400',
                  isTurn && clock < 30_000 && 'text-cinnabar-400',
                )}
              >
                {formatClock(clock)}
              </div>
            ) : (
              <div className="text-xs text-ink-400">{isTurn ? '思考中…' : ' '}</div>
            )}
            {abandon !== null && (
              <div className="text-[11px] text-cinnabar-400">
                {Math.ceil(abandon / 1000)} 秒後判負
              </div>
            )}
          </div>
        </div>
        <RoundMark mark={mark} />
      </div>
    );
  };

  const historyList = (
    <ol className="space-y-1.5 overflow-y-auto pr-1 text-sm" aria-label="出牌紀錄">
      {game.history.length === 0 && <li className="text-ink-400">尚未出牌</li>}
      {[...game.history].reverse().map((h) => (
        <li key={h.seq} className="flex items-center gap-2">
          <span className="w-16 shrink-0 truncate text-ink-300">{nameOf(h.seat)}</span>
          {h.kind === null ? (
            <span className="text-ink-400">過</span>
          ) : (
            <span className="flex items-center gap-2">
              <CardRow cards={h.cards} size="xs" />
              <span className="text-xs text-ink-400">{COMBO_LABELS[h.kind]}</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );

  const myClock = clockOf(you);

  return (
    <div className="flex h-dvh flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_320px]">
      <main className="flex min-h-0 flex-1 flex-col gap-2 p-2 sm:p-3 lg:p-4">
        <header className="flex items-center justify-between gap-2 px-1">
          <Logo size="sm" className="hidden sm:flex" />
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'truncate rounded-full px-3 py-1 text-sm font-medium',
                myTurn ? 'bg-gold-400/15 text-gold-300' : 'bg-ink-800 text-ink-300',
              )}
              data-testid="turn-status"
            >
              {status}
            </span>
            {variant === 'online' && (
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

        {variant === 'online' && connection && connection !== 'connected' && (
          <div
            className="flex items-center gap-2 rounded-xl border border-cinnabar-400/40 bg-cinnabar-500/15 px-3 py-2 text-sm text-cinnabar-400"
            role="status"
          >
            <WifiOff className="size-4" />
            {connection === 'reconnecting' ? '連線中斷，正在重新連線…' : '已離線，請檢查網路'}
          </div>
        )}

        {/* 牌桌 */}
        <div
          className="relative grid min-h-[300px] flex-1 grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)_auto] gap-2 overflow-hidden rounded-3xl border border-gold-600/30 p-2 shadow-inner sm:p-4"
          style={{
            background:
              'radial-gradient(ellipse at center, rgb(47 107 85 / 0.55), rgb(20 17 16 / 0.95) 75%)',
          }}
          data-testid="table"
        >
          <div className="col-span-3 flex justify-center">{opponent(2)}</div>
          <div className="flex items-center">{opponent(3)}</div>
          <div className="flex min-w-0 flex-col items-center justify-center gap-2 text-center">
            {game.table ? (
              <>
                <CardRow
                  key={game.history.at(-1)?.seq}
                  cards={game.table.cards}
                  size="md"
                  className="animate-rise"
                />
                <span className="rounded-full bg-ink-950/60 px-3 py-0.5 text-xs text-ink-300">
                  {tableInfo}
                </span>
              </>
            ) : (
              <span className="rounded-full bg-ink-950/50 px-4 py-1.5 text-sm text-ink-300">
                {game.outcome ? '本局結束' : game.opening ? '梅花 3 先出' : `${turnName} 自由出牌`}
              </span>
            )}
          </div>
          <div className="flex items-center justify-end">{opponent(1)}</div>
          <div className="col-span-3 flex min-h-8 items-end justify-center">
            <RoundMark mark={myMark} />
          </div>
        </div>

        {/* 自己 */}
        <div
          className={cn(
            'rounded-2xl border bg-ink-900/80 px-2 pb-2 pt-1.5 transition-all',
            myTurn ? 'animate-glow border-gold-400/60' : 'border-ink-700/70',
          )}
          data-testid="player-you"
        >
          <div className="mb-1 flex items-center justify-between gap-2 px-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{nameOf(you)}</span>
              <Badge variant="gold">你</Badge>
              <span className="text-xs text-ink-400">{game.hand.length} 張</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBySuit((v) => !v)}
                aria-label="切換理牌方式"
              >
                <ArrowDownUp /> {bySuit ? '依花色' : '依點數'}
              </Button>
              {myClock !== null && (
                <span
                  className={cn(
                    'rounded-lg px-2 py-0.5 font-mono tabular-nums',
                    myTurn ? 'bg-gold-400 text-ink-950' : 'bg-ink-800 text-ink-300',
                    myTurn && myClock < 30_000 && 'bg-cinnabar-500 text-white',
                  )}
                  data-testid="clock-you"
                >
                  {formatClock(myClock)}
                </span>
              )}
            </div>
          </div>
          <Hand cards={hand} selected={selected} onToggle={toggle} disabled={!playing} />
          {playing && (
            <div className="mt-2 grid grid-cols-[auto_1fr_1fr] gap-2">
              <Button
                variant="secondary"
                onClick={hint}
                disabled={!interactive}
                aria-label="提示"
                data-testid="hint"
              >
                <Lightbulb />
                <span className="hidden sm:inline">提示</span>
              </Button>
              <Button
                variant="secondary"
                onClick={submitPass}
                disabled={!interactive || !game.table}
                data-testid="pass"
              >
                過
              </Button>
              <Button
                variant="primary"
                onClick={submitPlay}
                disabled={!interactive || !preview.ok}
                data-testid="play"
              >
                {preview.ok ? `出 ${COMBO_LABELS[preview.combo.kind]}` : '出牌'}
              </Button>
            </div>
          )}
          {playing && interactive && selected.length > 0 && !preview.ok && (
            <p className="mt-1.5 px-1 text-xs text-cinnabar-400" role="status">
              {errorMessage(preview.error)}
            </p>
          )}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2 lg:hidden">
          {snapshot.phase === 'ended' ? (
            <Button variant="primary" onClick={() => setHideEnd(false)}>
              <Trophy /> 查看結果
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setConfirmResign(true)}
              disabled={!playing}
              data-testid="resign"
            >
              <Flag /> 認輸
            </Button>
          )}
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setShowHistory(true)}
            aria-label="出牌紀錄"
          >
            <ListOrdered />
          </Button>
        </div>
      </main>

      <aside className="hidden min-h-0 flex-col gap-3 border-l border-ink-800 bg-ink-900/50 p-4 lg:flex">
        <div className="rounded-2xl border border-ink-700/70 bg-ink-900/80 p-4">
          <div className="text-xs tracking-widest text-ink-400">
            大老二 · 台灣規則{variant === 'practice' ? ' · 練習' : ''}
          </div>
          <div className="mt-1 font-serif text-lg">{status}</div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-ink-700/70 bg-ink-900/80 p-3">
          <div className="mb-2 px-1 text-sm font-medium text-ink-300">出牌紀錄</div>
          <div className="min-h-0 flex-1 overflow-y-auto">{historyList}</div>
        </div>
        {snapshot.phase === 'ended' ? (
          <Button variant="primary" onClick={() => setHideEnd(false)}>
            <Trophy /> 查看結果
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => setConfirmResign(true)}
            disabled={!playing}
            data-testid="resign"
          >
            <Flag /> 認輸
          </Button>
        )}
      </aside>

      {showHistory && (
        <div
          className="fixed inset-0 z-30 flex flex-col justify-end bg-black/50 lg:hidden"
          onClick={() => setShowHistory(false)}
        >
          <div
            className="flex max-h-[60dvh] animate-rise flex-col rounded-t-3xl border-t border-ink-700 bg-ink-900 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-serif text-lg">出牌紀錄</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowHistory(false)}
                aria-label="關閉"
              >
                <X />
              </Button>
            </div>
            <div className="min-h-0 overflow-y-auto">{historyList}</div>
          </div>
        </div>
      )}

      <Dialog open={confirmResign} onClose={() => setConfirmResign(false)} title="確定要認輸嗎？">
        <p className="mb-5 text-ink-300">
          認輸後本局立即結束，你排最後一名；其餘三家中剩牌最少的人獲勝。
        </p>
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

      {game.outcome && game.result && !hideEnd && (
        <BigTwoEndDialog
          game={game as BigTwoMatchView & { result: NonNullable<BigTwoMatchView['result']> }}
          you={snapshot.yourSeat}
          nameOf={nameOf}
          rematchVotes={snapshot.rematchVotes}
          canRematch={variant === 'practice' || snapshot.seats.every((s) => s !== null)}
          onRematch={() => send({ type: 'rematch' })}
          onViewTable={() => setHideEnd(true)}
          onExit={onExit}
        />
      )}
    </div>
  );
}

/** 本輪某位玩家最後的動作：出的牌或「過」 */
function RoundMark({ mark }: { mark: BigTwoMatchView['round'][number] | undefined }) {
  if (!mark) return null;
  if (mark.type === 'pass') {
    return (
      <span className="rounded-full bg-ink-950/70 px-2.5 py-0.5 text-xs text-ink-300 ring-1 ring-ink-600">
        過
      </span>
    );
  }
  return <CardRow cards={mark.cards} size="xs" className="opacity-80" />;
}

/**
 * 手牌：卡片寬度固定，容器太窄時互相重疊（最後一張完整顯示）。點一下選取 / 取消。
 */
function Hand({
  cards,
  selected,
  onToggle,
  disabled,
}: {
  cards: Card[];
  selected: Card[];
  onToggle: (c: Card) => void;
  disabled: boolean;
}) {
  if (cards.length === 0) {
    return <div className="grid h-24 place-items-center text-sm text-ink-400">手牌已出完</div>;
  }
  return (
    <div
      className="flex justify-center px-1 pt-3"
      role="group"
      aria-label="你的手牌"
      data-testid="hand"
    >
      {cards.map((c, i) => {
        const isSelected = selected.includes(c);
        return (
          <button
            key={c}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(c)}
            aria-pressed={isSelected}
            className={cn(
              'min-w-0 text-left transition-transform duration-150 focus-visible:outline-none',
              i === cards.length - 1 ? 'flex-none' : 'max-w-[clamp(3.25rem,13vw,4.75rem)] flex-1',
              isSelected ? '-translate-y-3' : 'hover:-translate-y-1',
            )}
            data-card={c}
          >
            <PlayingCard
              card={c}
              size="lg"
              className={cn(
                isSelected && 'ring-2 ring-gold-400 shadow-[0_8px_20px_-6px_rgb(242_181_82/0.7)]',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
