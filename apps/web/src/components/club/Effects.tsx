'use client';

import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  N8AO,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useNeon, useQuality } from './props';

/**
 * 後處理（r3f-game-dev-spec §5.4）：輕微 Bloom 讓霓虹與燈泡發光、AO 讓家具貼地、
 * ACES 色調映射 + 微調飽和度做出暖色手繪感、暗角收邊。
 * 低畫質整個關掉（改用 renderer 的色調映射），中畫質把 AO 強度設為 0。
 */
export function Effects() {
  const quality = useQuality();
  const neon = useNeon();
  if (quality === 'low') return null;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO
        aoRadius={0.6}
        intensity={quality === 'high' ? 2.2 : 0}
        distanceFalloff={0.6}
        halfRes
        color="#2a1a14"
      />
      <Bloom
        mipmapBlur
        luminanceThreshold={0.85}
        luminanceSmoothing={0.2}
        intensity={0.55 + neon * 0.5}
        radius={0.7}
      />
      <HueSaturation saturation={0.08} />
      <BrightnessContrast brightness={0.02} contrast={0.08} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.3} darkness={0.55} />
      <SMAA />
    </EffectComposer>
  );
}
