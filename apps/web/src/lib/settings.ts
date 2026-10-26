'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type QualitySetting = 'auto' | 'high' | 'medium' | 'low' | '2d';
export type AnimationSetting = 'normal' | 'fast' | 'off';

interface SettingsState {
  sound: boolean;
  quality: QualitySetting;
  animation: AnimationSetting;
  setSound: (v: boolean) => void;
  setQuality: (v: QualitySetting) => void;
  setAnimation: (v: AnimationSetting) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      sound: true,
      quality: 'auto',
      animation: 'normal',
      setSound: (sound) => set({ sound }),
      setQuality: (quality) => set({ quality }),
      setAnimation: (animation) => set({ animation }),
    }),
    { name: 'xa:settings', version: 1 },
  ),
);

export const animationScaleOf = (a: AnimationSetting): number =>
  a === 'off' ? 0 : a === 'fast' ? 0.5 : 1;
