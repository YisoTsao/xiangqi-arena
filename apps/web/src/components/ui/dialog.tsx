'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  /** 不允許點背景或 Esc 關閉 */
  modal?: boolean;
}

/** 以原生 <dialog> 實作的對話框（焦點管理與 Esc 由瀏覽器處理） */
export function Dialog({ open, onClose, title, children, className, modal = false }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!modal) onClose();
      }}
      onClick={(e) => {
        if (!modal && e.target === ref.current) onClose();
      }}
      className={cn(
        'm-auto w-[min(92vw,440px)] rounded-2xl border border-ink-600 bg-ink-900 p-0 text-ink-100 shadow-2xl open:animate-rise',
        className,
      )}
    >
      {open && (
        <div className="p-6">
          {title && (
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="font-serif text-xl font-semibold text-gold-300">{title}</h2>
              {!modal && (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
                  aria-label="關閉"
                >
                  <X className="size-5" />
                </button>
              )}
            </div>
          )}
          {children}
        </div>
      )}
    </dialog>
  );
}
