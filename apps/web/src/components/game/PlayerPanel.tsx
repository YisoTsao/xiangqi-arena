'use client';

import { pieceLabel, type PieceKind, type Side } from '@xiangqi-arena/game-core';
import type { SeatView } from '@xiangqi-arena/game-protocol';
import { Badge } from '../ui/badge';
import { cn, formatClock } from '@/lib/utils';

interface Props {
  seat: SeatView | null;
  side: Side | null;
  isTurn: boolean;
  isYou: boolean;
  clockMs: number | null;
  /** 此玩家吃掉的棋子 */
  captured: PieceKind[];
  capturedSide: Side | null;
  compact?: boolean;
  abandonInMs?: number | null;
}

export function PlayerPanel({
  seat,
  side,
  isTurn,
  isYou,
  clockMs,
  captured,
  capturedSide,
  compact,
  abandonInMs,
}: Props) {
  const low = clockMs !== null && clockMs < 30_000;
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border bg-ink-900/80 px-3 py-2 transition-all',
        isTurn ? 'border-gold-400/60 animate-glow' : 'border-ink-700/70',
      )}
      data-testid={isYou ? 'player-you' : 'player-opponent'}
    >
      <div
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full font-serif text-lg font-bold ring-2',
          side === 'red' && 'bg-[#f3e4c2] text-cinnabar-500 ring-cinnabar-500/60',
          side === 'black' && 'bg-[#f3e4c2] text-ink-950 ring-ink-400/60',
          side === null && 'bg-jade-500 text-gold-300 ring-gold-400/40',
        )}
        aria-label={side === 'red' ? '紅方' : side === 'black' ? '黑方' : '陣營未定'}
      >
        {side ? pieceLabel(side, 'king') : '？'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{seat?.name ?? '等待玩家…'}</span>
          {isYou && <Badge variant="gold">你</Badge>}
          {seat && !seat.connected && <Badge variant="danger">離線</Badge>}
        </div>
        {!compact && (
          <div
            className="mt-0.5 flex min-h-5 flex-wrap items-center gap-0.5 text-sm"
            aria-label="吃掉的棋子"
          >
            {captured.length === 0 ? (
              <span className="text-xs text-ink-400">{isTurn ? '思考中…' : '　'}</span>
            ) : (
              captured.map((k, i) => (
                <span
                  key={i}
                  className={cn(
                    'font-serif leading-none',
                    capturedSide === 'red' ? 'text-cinnabar-400' : 'text-ink-300',
                  )}
                >
                  {capturedSide ? pieceLabel(capturedSide, k) : ''}
                </span>
              ))
            )}
          </div>
        )}
        {abandonInMs != null && (
          <div className="text-xs text-cinnabar-400">
            斷線中，{Math.ceil(abandonInMs / 1000)} 秒後判負
          </div>
        )}
      </div>
      {clockMs !== null && (
        <div
          className={cn(
            'rounded-xl px-3 py-1 font-mono text-lg tabular-nums',
            isTurn ? 'bg-gold-400 text-ink-950' : 'bg-ink-800 text-ink-300',
            isTurn && low && 'bg-cinnabar-500 text-white',
          )}
          data-testid={isYou ? 'clock-you' : 'clock-opponent'}
        >
          {formatClock(clockMs)}
        </div>
      )}
    </div>
  );
}
