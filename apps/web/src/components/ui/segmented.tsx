'use client';

import { cn } from '@/lib/utils';

interface Option<T extends string> {
  value: T;
  label: string;
}

/** 分段選擇器 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className,
  ariaLabel,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('grid gap-1 rounded-xl bg-ink-850 p-1 ring-1 ring-ink-700', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 rounded-lg px-2 text-sm transition-colors disabled:cursor-not-allowed',
            value === o.value
              ? 'bg-gradient-to-b from-gold-300 to-gold-500 font-semibold text-ink-950'
              : 'text-ink-300 hover:text-ink-100 disabled:hover:text-ink-300',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
