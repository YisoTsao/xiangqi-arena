'use client';

import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'success';
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, tone?: Toast['tone']) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (text, tone = 'info') => {
    const id = ++seq;
    // 同樣訊息不重複堆疊
    if (get().toasts.some((t) => t.text === text)) return;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
    setTimeout(() => get().dismiss(id), 3500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (text: string, tone?: Toast['tone']) => useToasts.getState().push(text, tone);
