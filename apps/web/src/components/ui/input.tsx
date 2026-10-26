import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl border border-ink-600 bg-ink-850 px-4 text-ink-100 placeholder:text-ink-400 focus:border-gold-400/70 focus:outline-none focus:ring-2 focus:ring-gold-400/30',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
