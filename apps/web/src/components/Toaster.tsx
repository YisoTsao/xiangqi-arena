'use client';

import { useToasts } from '@/lib/toast';
import { cn } from '@/lib/utils';

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-3"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={cn(
            'pointer-events-auto animate-rise rounded-xl border px-4 py-2 text-sm shadow-xl backdrop-blur',
            t.tone === 'error' && 'border-cinnabar-400/40 bg-cinnabar-500/20 text-cinnabar-400',
            t.tone === 'success' && 'border-jade-400/40 bg-jade-500/25 text-jade-400',
            t.tone === 'info' && 'border-gold-400/30 bg-ink-850/90 text-ink-100',
          )}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
