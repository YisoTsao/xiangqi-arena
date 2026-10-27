'use client';

import { kindOf, type Tile, type TileKind } from '@xiangqi-arena/games-mahjong';
import { cn } from '@/lib/utils';

const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const HONORS = ['東', '南', '西', '北', '中', '發', '白'];
const FLOWERS = ['春', '夏', '秋', '冬', '梅', '蘭', '竹', '菊'];

/** 牌面：上面大字、下面小字，顏色依花色 */
function face(kind: TileKind): { top: string; bottom: string | null; color: string } {
  if (kind < 9) return { top: NUMERALS[kind]!, bottom: '萬', color: 'text-[#b8322a]' };
  if (kind < 18) return { top: NUMERALS[kind - 9]!, bottom: '筒', color: 'text-[#245a8c]' };
  if (kind < 27) return { top: NUMERALS[kind - 18]!, bottom: '條', color: 'text-[#2f7a4f]' };
  if (kind < 31) return { top: HONORS[kind - 27]!, bottom: null, color: 'text-[#1d1a17]' };
  if (kind === 31) return { top: '中', bottom: null, color: 'text-[#c0362c]' };
  if (kind === 32) return { top: '發', bottom: null, color: 'text-[#2f7a4f]' };
  if (kind === 33) return { top: '白', bottom: null, color: 'text-[#245a8c]' };
  const f = kind - 34;
  return { top: FLOWERS[f]!, bottom: null, color: f < 4 ? 'text-[#b8322a]' : 'text-[#245a8c]' };
}

const SIZES = {
  xs: 'h-7 w-5 text-[11px] rounded-[4px] border-b-[3px]',
  sm: 'h-9 w-[26px] text-sm rounded-[5px] border-b-[4px]',
  md: 'h-12 w-[34px] text-lg rounded-md border-b-[5px] sm:h-16 sm:w-11 sm:text-xl sm:border-b-[6px]',
} as const;

export type TileSize = keyof typeof SIZES;

interface TileProps {
  tile: Tile;
  size?: TileSize;
  className?: string;
  highlight?: boolean;
}

/** 一張麻將牌：象牙牌面 + 玉綠牌背的厚度 */
export function MahjongTile({ tile, size = 'md', className, highlight }: TileProps) {
  const kind = kindOf(tile);
  const f = face(kind);
  const label = f.bottom ? `${f.top}${f.bottom}` : f.top;
  return (
    <span
      role="img"
      aria-label={label}
      data-kind={kind}
      className={cn(
        'relative inline-flex shrink-0 select-none flex-col items-center justify-center border border-b-jade-500 border-[#d8ccb4] bg-gradient-to-b from-[#fffdf6] to-[#efe6d2] font-serif font-bold leading-none shadow-[0_2px_4px_rgb(0_0_0/0.35)]',
        SIZES[size],
        f.color,
        kind === 33 && 'outline-2 -outline-offset-[6px] outline-[#245a8c]/70',
        highlight && 'ring-2 ring-gold-400',
        className,
      )}
    >
      <span>{kind === 33 ? '' : f.top}</span>
      {f.bottom && size !== 'xs' && (
        <span className="mt-0.5 text-[0.6em] opacity-90">{f.bottom}</span>
      )}
    </span>
  );
}

/** 牌背（別人的暗手、暗槓） */
export function TileBack({ size = 'sm', className }: { size?: TileSize; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block shrink-0 border border-jade-500 border-b-[#1d4a3a] bg-gradient-to-b from-jade-400 to-jade-500 shadow-[0_2px_4px_rgb(0_0_0/0.35)]',
        SIZES[size],
        className,
      )}
    />
  );
}
