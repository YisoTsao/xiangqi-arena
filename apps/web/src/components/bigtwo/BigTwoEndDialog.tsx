'use client';

import { Crown, Eye, LogOut, RotateCcw } from 'lucide-react';
import type { BigTwoMatchView } from '@xiangqi-arena/games-big-two';
import { CardRow } from './PlayingCard';
import { Button } from '../ui/button';
import { reasonLabel } from '@/lib/games';
import { cn } from '@/lib/utils';

interface Props {
  game: BigTwoMatchView & { result: NonNullable<BigTwoMatchView['result']> };
  /** null = 觀戰 */
  you: number | null;
  nameOf: (seat: number) => string;
  rematchVotes: boolean[];
  canRematch: boolean;
  onRematch: () => void;
  onViewTable: () => void;
  onExit: () => void;
}

const PLACE_LABELS = ['', '第一名', '第二名', '第三名', '第四名'];

/** 結算：名次、各家剩下的牌與參考罰分 */
export function BigTwoEndDialog({
  game,
  you,
  nameOf,
  rematchVotes,
  canRematch,
  onRematch,
  onViewTable,
  onExit,
}: Props) {
  const { placements, hands, penalties } = game.result;
  const outcome = game.outcome!;
  const winner = outcome.type === 'win' ? outcome.winner : null;
  const won = you !== null && winner === you;
  const myPlace = you !== null ? placements[you] : null;
  const title =
    you === null
      ? `${winner !== null ? nameOf(winner) : ''} 獲勝`
      : won
        ? '勝利！'
        : PLACE_LABELS[myPlace ?? 0];
  const order = placements
    .map((place, seat) => ({ place, seat }))
    .sort((a, b) => a.place - b.place);
  // 認輸、超時、斷線：被判負的人排最後，勝者是剩牌最少的人
  const loser = placements.indexOf(placements.length);
  const summary =
    winner === null
      ? ''
      : outcome.reason === 'empty-hand'
        ? `${nameOf(winner)} ${reasonLabel(outcome.reason)}`
        : `${nameOf(loser)} ${reasonLabel(outcome.reason)}，${nameOf(winner)} 剩牌最少獲勝`;
  const myVote = you !== null && !!rematchVotes[you];
  const votes = rematchVotes.filter(Boolean).length;

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="本局結算"
    >
      <div className="relative max-h-[92dvh] w-[min(94vw,460px)] animate-rise overflow-y-auto rounded-3xl border border-gold-400/40 bg-ink-900 p-6 shadow-2xl">
        {won && (
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-1/2 animate-rays opacity-30"
            style={{
              background:
                'repeating-conic-gradient(from 0deg, rgb(227 181 91 / 0.35) 0deg 8deg, transparent 8deg 24deg)',
            }}
          />
        )}
        <div className="relative text-center">
          <h2
            className={cn('font-serif text-4xl font-bold', won ? 'text-gold-300' : 'text-ink-100')}
            data-testid="end-title"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-ink-300">{summary}</p>
        </div>

        <ol className="relative mt-5 space-y-2">
          {order.map(({ place, seat }) => (
            <li
              key={seat}
              className={cn(
                'rounded-2xl border px-3 py-2',
                seat === you ? 'border-gold-400/50 bg-gold-400/5' : 'border-ink-700 bg-ink-850',
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold',
                    place === 1 ? 'bg-gold-400 text-ink-950' : 'bg-ink-700 text-ink-300',
                  )}
                >
                  {place === 1 ? <Crown className="size-4" /> : place}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {nameOf(seat)}
                  {seat === you && nameOf(seat) !== '你' && (
                    <span className="ml-1 text-xs text-gold-300">（你）</span>
                  )}
                </span>
                <span className="text-xs text-ink-400">
                  剩 {hands[seat]!.length} 張
                  {penalties[seat]! > 0 && (
                    <span className="ml-2 text-cinnabar-400">−{penalties[seat]}</span>
                  )}
                </span>
              </div>
              {hands[seat]!.length > 0 && (
                <CardRow cards={hands[seat]!} size="xs" className="mt-1.5 pl-9" />
              )}
            </li>
          ))}
        </ol>
        <p className="relative mt-2 text-center text-[11px] text-ink-400">
          罰分僅供參考：剩幾張扣幾分，10 張以上加倍，一張未出三倍
        </p>

        <div className="relative mt-5 grid gap-2">
          {canRematch && (
            <Button
              variant="primary"
              size="lg"
              onClick={onRematch}
              disabled={myVote}
              data-testid="rematch"
            >
              <RotateCcw />{' '}
              {myVote
                ? `等待其他玩家同意…（${votes}/${rematchVotes.length}）`
                : votes > 0
                  ? `再來一局（${votes}/${rematchVotes.length} 已同意）`
                  : '再來一局'}
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onViewTable}>
              <Eye /> 檢視牌桌
            </Button>
            <Button variant="ghost" onClick={onExit}>
              <LogOut /> 離開
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
