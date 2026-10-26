import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-ink-700 text-ink-100',
        gold: 'bg-gold-400/15 text-gold-300 ring-1 ring-gold-400/30',
        success: 'bg-jade-500/25 text-jade-400 ring-1 ring-jade-400/30',
        danger: 'bg-cinnabar-500/20 text-cinnabar-400 ring-1 ring-cinnabar-400/30',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
