'use client';

import type { OutcomeView } from '@xiangqi-arena/game-protocol';
import type { Seat } from '@xiangqi-arena/game-core';
import { Crown, Handshake, RotateCcw, LogOut, Eye } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import { reasonLabel } from '@/lib/xiangqi';

interface Props {
  outcome: OutcomeView;
  /** null = 旁觀或本機模式（以座位名稱顯示勝方） */
  yourSeat: Seat | null;
  winnerName: string | null;
  rematchVotes: boolean[];
  canRematch: boolean;
  onRematch: () => void;
  onViewBoard: () => void;
  onExit: () => void;
}

/** 對局結束彈窗：勝利有金色光芒動畫，落敗則較低調 */
export function EndDialog({
  outcome,
  yourSeat,
  winnerName,
  rematchVotes,
  canRematch,
  onRematch,
  onViewBoard,
  onExit,
}: Props) {
  const draw = outcome.type === 'draw';
  const won = !draw && yourSeat !== null && outcome.winner === yourSeat;
  const lost = !draw && yourSeat !== null && outcome.winner !== yourSeat;
  const title = draw
    ? '和棋'
    : yourSeat === null
      ? `${winnerName ?? ''} 獲勝`
      : won
        ? '勝利！'
        : '落敗';
  const reason = reasonLabel(outcome.reason);
  const myVote = yourSeat !== null && !!rematchVotes[yourSeat];
  const theirVote = yourSeat !== null && !!rematchVotes[yourSeat === 0 ? 1 : 0];

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="對局結束"
    >
      <div className="relative w-[min(92vw,400px)] animate-rise overflow-hidden rounded-3xl border border-gold-400/40 bg-ink-900 p-7 text-center shadow-2xl">
        {won && (
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-1/2 animate-rays opacity-40"
            style={{
              background:
                'repeating-conic-gradient(from 0deg, rgb(242 181 82 / 0.35) 0deg 8deg, transparent 8deg 24deg)',
            }}
          />
        )}
        <div className="relative">
          <div
            className={cn(
              'mx-auto mb-3 grid size-16 place-items-center rounded-full ring-2',
              won && 'bg-gold-400/20 text-gold-300 ring-gold-400',
              lost && 'bg-ink-800 text-ink-400 ring-ink-600',
              (draw || yourSeat === null) && 'bg-jade-500/25 text-jade-400 ring-jade-400/60',
            )}
          >
            {draw ? <Handshake className="size-8" /> : <Crown className="size-8" />}
          </div>
          <h2
            className={cn(
              'font-serif text-4xl font-bold',
              won ? 'text-gold-300' : lost ? 'text-ink-300' : 'text-ink-100',
            )}
            data-testid="end-title"
          >
            {title}
          </h2>
          <p className="mt-2 text-ink-300">{reason}</p>
          <div className="mt-6 grid gap-2">
            {canRematch && (
              <Button
                variant="primary"
                size="lg"
                onClick={onRematch}
                disabled={myVote}
                data-testid="rematch"
              >
                <RotateCcw />{' '}
                {myVote ? '等待對手同意…' : theirVote ? '對手想再來一局 · 接受' : '再來一局'}
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={onViewBoard}>
                <Eye /> 檢視棋盤
              </Button>
              <Button variant="ghost" onClick={onExit}>
                <LogOut /> 離開
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
