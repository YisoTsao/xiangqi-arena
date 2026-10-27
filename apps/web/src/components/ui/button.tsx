import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// shadcn/ui 風格的按鈕（以本專案金色主題調整）
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/70 disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98] select-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-to-b from-gold-300 to-gold-500 text-ink-950 shadow-[0_6px_20px_-6px_rgb(242_181_82/0.6)] hover:from-gold-300 hover:to-gold-400',
        secondary:
          'bg-ink-800 text-ink-100 border border-ink-600 hover:bg-ink-700 hover:border-gold-600/60',
        ghost: 'text-ink-300 hover:bg-ink-800 hover:text-ink-100',
        danger: 'bg-cinnabar-500/90 text-white hover:bg-cinnabar-400',
        outline: 'border border-gold-500/50 text-gold-300 hover:bg-gold-400/10',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
        xl: 'h-14 px-8 text-lg',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
