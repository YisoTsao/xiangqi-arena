'use client';

import {
  RANK_LABELS,
  SUIT_NAMES,
  SUIT_SYMBOLS,
  isRedSuit,
  rankOf,
  suitOf,
  type Card,
} from '@xiangqi-arena/games-big-two';
import { cn } from '@/lib/utils';

const SIZES = {
  xs: 'w-7 rounded-[5px] text-[10px]',
  sm: 'w-10 rounded-md text-xs',
  md: 'w-[clamp(2.75rem,10vw,3.75rem)] rounded-lg text-sm',
  lg: 'w-[clamp(3.25rem,13vw,4.75rem)] rounded-lg text-base sm:text-lg',
} as const;

export type CardSize = keyof typeof SIZES;

export const cardName = (card: Card): string =>
  `${SUIT_NAMES[suitOf(card)]} ${RANK_LABELS[rankOf(card)]}`;

/** 一張撲克牌：角落點數與花色、中央大花色 */
export function PlayingCard({
  card,
  size = 'md',
  className,
}: {
  card: Card;
  size?: CardSize;
  className?: string;
}) {
  const suit = suitOf(card);
  const red = isRedSuit(suit);
  return (
    <div
      className={cn(
        'relative aspect-[5/7] shrink-0 select-none bg-gradient-to-br from-[#fffdf7] to-[#efe6d2] font-semibold shadow-[0_2px_6px_rgb(0_0_0/0.35)] ring-1 ring-black/15',
        red ? 'text-cinnabar-500' : 'text-ink-950',
        SIZES[size],
        className,
      )}
      aria-label={cardName(card)}
      role="img"
    >
      <div className="absolute left-[8%] top-[4%] flex flex-col items-center leading-none">
        <span className="tracking-tighter">{RANK_LABELS[rankOf(card)]}</span>
        <span className="text-[0.8em]">{SUIT_SYMBOLS[suit]}</span>
      </div>
      {size !== 'xs' && (
        <span className="absolute bottom-[8%] right-[10%] text-[1.6em] leading-none opacity-90">
          {SUIT_SYMBOLS[suit]}
        </span>
      )}
    </div>
  );
}

/** 牌背 */
export function CardBack({ size = 'sm', className }: { size?: CardSize; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'aspect-[5/7] shrink-0 bg-cinnabar-500 shadow-[0_2px_6px_rgb(0_0_0/0.35)] ring-1 ring-gold-400/60',
        SIZES[size],
        className,
      )}
      style={{
        backgroundImage:
          'repeating-linear-gradient(45deg, rgb(243 211 140 / 0.28) 0 2px, transparent 2px 7px), repeating-linear-gradient(-45deg, rgb(243 211 140 / 0.28) 0 2px, transparent 2px 7px)',
      }}
    />
  );
}

/** 一組牌（桌面、出牌紀錄）：稍微重疊排列 */
export function CardRow({
  cards,
  size = 'sm',
  className,
}: {
  cards: readonly Card[];
  size?: CardSize;
  className?: string;
}) {
  return (
    <div className={cn('flex items-end', className)}>
      {cards.map((c, i) => (
        <PlayingCard
          key={c}
          card={c}
          size={size}
          className={cn(
            i > 0 &&
              (size === 'xs'
                ? '-ml-3'
                : size === 'sm'
                  ? '-ml-4'
                  : size === 'md'
                    ? '-ml-[clamp(1.1rem,4vw,1.5rem)]'
                    : '-ml-6'),
          )}
        />
      ))}
    </div>
  );
}
