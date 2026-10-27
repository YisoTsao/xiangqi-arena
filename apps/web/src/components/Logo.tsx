import { cn } from '@/lib/utils';

/** 遊戲 Logo：金框圓形棋子 + 字標 */
export function Logo({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const piece =
    size === 'lg' ? 'size-20 text-4xl' : size === 'md' ? 'size-11 text-xl' : 'size-8 text-base';
  const title = size === 'lg' ? 'text-4xl sm:text-5xl' : size === 'md' ? 'text-xl' : 'text-base';
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          'relative grid place-items-center rounded-full bg-gradient-to-br from-[#f7ecd2] to-[#d8bf8c] font-serif font-bold text-cinnabar-500 shadow-[inset_0_-3px_0_rgb(0_0_0/0.18),0_6px_20px_-4px_rgb(242_181_82/0.5)] ring-2 ring-gold-400/70',
          piece,
        )}
        aria-hidden
      >
        <span className="absolute inset-[12%] rounded-full ring-2 ring-cinnabar-500/70" />帥
      </div>
      <div className="leading-tight">
        <div className={cn('font-serif font-bold tracking-wide text-ink-100', title)}>
          Xiangqi <span className="text-gold-400">Arena</span>
        </div>
        {size !== 'sm' && <div className="text-xs tracking-[0.3em] text-ink-400">象棋競技場</div>}
      </div>
    </div>
  );
}
