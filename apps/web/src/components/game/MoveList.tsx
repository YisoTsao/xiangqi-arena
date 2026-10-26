'use client';

import { useEffect, useRef } from 'react';
import type { MoveListEntry } from '@xiangqi-arena/game-protocol';
import { cn } from '@/lib/utils';

export function MoveList({ moves, className }: { moves: MoveListEntry[]; className?: string }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [moves.length]);

  if (moves.length === 0) {
    return <p className={cn('px-1 py-3 text-center text-sm text-ink-400', className)}>尚無棋步</p>;
  }
  return (
    <ol
      ref={ref}
      className={cn('space-y-0.5 overflow-y-auto pr-1 text-sm', className)}
      aria-label="棋譜"
    >
      {moves.map((m) => (
        <li key={m.ply} className="flex items-center gap-2 rounded-lg px-2 py-1 odd:bg-ink-850/60">
          <span className="w-7 shrink-0 text-right font-mono text-xs text-ink-400">{m.ply}.</span>
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              m.side === 'red'
                ? 'bg-cinnabar-400'
                : m.side === 'black'
                  ? 'bg-ink-300'
                  : 'bg-jade-400',
            )}
          />
          <span className="font-serif tracking-wide">{m.notation}</span>
        </li>
      ))}
    </ol>
  );
}
