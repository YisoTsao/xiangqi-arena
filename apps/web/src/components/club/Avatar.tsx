'use client';

import { forwardRef, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import {
  AnimationMixer,
  LoopOnce,
  type AnimationAction,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Fallback } from './assets';
import { AVATAR_VARIANTS, variantForColor, type AvatarVariant } from './avatarColors';
import { tintClothes } from './glbMaterials';

export { AVATAR_VARIANTS, randomAvatarColor, variantForColor } from './avatarColors';
export type { AvatarVariant } from './avatarColors';

/**
 * GLB 角色：Kenney Mini Characters（CC0，見 public/club/assets/CREDITS.md）。
 *
 * 每個模型都有同一套骨架動畫（idle、walk、sprint、sit…）。玩家用 color 決定
 * 「衣服換成什麼色相」；沒有指定 variant 時，也用 color 挑一個基本造型，所以每位玩家都不太一樣。
 *
 * 給多人連線用：
 * - 原點在腳底、面向 +z，和舊的 Character 一樣，外層 group 的 position／rotation 直接設。
 * - motion 是每格都會讀的可變物件（{ moving, running, sitting }），遠端玩家直接傳自己的狀態物件即可，
 *   不需要每格重新 render。
 */

const url = (v: AvatarVariant) => `/club/assets/models/characters/${v}.glb`;

/** 模型約 0.7 單位高：放大到約 1.5m，和店裡的桌椅比例一致 */
export const AVATAR_SCALE = 2.1;

export interface AvatarMotion {
  moving: boolean;
  running?: boolean;
  sitting?: boolean;
}

type Clip = 'idle' | 'walk' | 'sprint' | 'sit';

function Model({
  variant,
  color,
  motion,
}: {
  variant: AvatarVariant;
  color?: string;
  motion: AvatarMotion;
}) {
  const gltf = useGLTF(url(variant));
  const { root, mixer, actions } = useMemo(() => {
    const root = cloneSkinned(gltf.scene) as Group;
    root.traverse((o: Object3D) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.frustumCulled = false;
      if (color) m.material = tintClothes(m.material as MeshStandardMaterial, color);
    });
    const mixer = new AnimationMixer(root);
    const actions = new Map<Clip, AnimationAction>();
    for (const name of ['idle', 'walk', 'sprint', 'sit'] as const) {
      const clip = gltf.animations.find((a) => a.name === name);
      if (clip) actions.set(name, mixer.clipAction(clip));
    }
    return { root, mixer, actions };
  }, [gltf, color]);

  const current = useRef<Clip | null>(null);
  useEffect(() => {
    return () => {
      mixer.stopAllAction();
      root.traverse((o: Object3D) => {
        const m = o as Mesh;
        if (m.isMesh && color) (m.material as MeshStandardMaterial).dispose();
      });
    };
  }, [mixer, root, color]);

  useFrame((_, delta) => {
    const want: Clip = motion.sitting
      ? 'sit'
      : motion.moving
        ? motion.running
          ? 'sprint'
          : 'walk'
        : 'idle';
    if (want !== current.current) {
      const next = actions.get(want) ?? actions.get('idle');
      const prev = current.current ? actions.get(current.current) : undefined;
      if (next) {
        next.reset();
        if (want === 'sit') {
          next.setLoop(LoopOnce, 1);
          next.clampWhenFinished = true;
        }
        next.play();
        if (prev && prev !== next) prev.crossFadeTo(next, 0.18, false);
      }
      current.current = want;
    }
    mixer.update(Math.min(delta, 0.1));
  });

  return <primitive object={root} scale={AVATAR_SCALE} />;
}

/** 圓形假影（角色不吃 lightmap） */
function BlobShadow() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.015} renderOrder={1}>
      <circleGeometry args={[0.36, 24]} />
      <meshBasicMaterial color="#1a1010" transparent opacity={0.32} depthWrite={false} />
    </mesh>
  );
}

export const Avatar = forwardRef<
  Group,
  {
    /** 衣服的色相；不給就是模型原色（NPC） */
    color?: string;
    variant?: AvatarVariant;
    motion: AvatarMotion;
    /** GLB 還沒載入時顯示的東西 */
    fallback?: ReactNode;
  }
>(function Avatar({ color, variant, motion, fallback = null }, ref) {
  const v = variant ?? (color ? variantForColor(color) : 'mini_male_a');
  return (
    <group ref={ref}>
      <BlobShadow />
      <Fallback fallback={fallback}>
        <Suspense fallback={fallback}>
          <Model variant={v} color={color} motion={motion} />
        </Suspense>
      </Fallback>
    </group>
  );
});

/** NPC 不動：共用一個永遠是站著的狀態 */
export const IDLE: AvatarMotion = { moving: false };

export function preloadAvatars(): void {
  for (const v of AVATAR_VARIANTS) useGLTF.preload(url(v));
}
