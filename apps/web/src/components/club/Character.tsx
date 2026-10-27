'use client';

import { forwardRef, type ReactNode } from 'react';
import { Outlines } from '@react-three/drei';
import type { Group } from 'three';
import { toonGradient } from './textures';

export interface Outfit {
  skin: string;
  hair: string;
  /** 帽子；沒有就省略 */
  hat?: string;
  shirt: string;
  /** 上衣的橫條紋色 */
  stripe?: string;
  jacket?: string;
  bottom: string;
  socks: string;
  shoes: string;
  /** 圍裙（店員）；沒有就省略 */
  apron?: string;
  /** 長髮披肩 */
  longHair?: boolean;
}

export const PLAYER_OUTFIT: Outfit = {
  skin: '#f6d6bd',
  hair: '#8fd3c4',
  hat: '#8552B8',
  shirt: '#9fd8d0',
  stripe: '#b49ad8',
  jacket: '#2a2630',
  bottom: '#2f2a36',
  socks: '#f2eee6',
  shoes: '#2a2228',
  longHair: true,
};

export const A_LE_OUTFIT: Outfit = {
  skin: '#ecc6a3',
  hair: '#5d5552',
  shirt: '#F2DAB6',
  bottom: '#5e3f2c',
  socks: '#3a3036',
  shoes: '#4a3428',
  apron: '#4E816F',
};

const OUTLINE = '#2a1d1a';

/** 卡通明暗材質 + 深色描邊（角色共用；場景物件用 PBR，角色從背景跳出來） */
function Part({
  color,
  children,
  outline = 0.012,
  position,
  rotation,
  scale,
  name,
}: {
  color: string;
  children: ReactNode;
  outline?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
  name?: string;
}) {
  return (
    <mesh name={name} position={position} rotation={rotation} scale={scale} castShadow>
      {children}
      <meshToonMaterial color={color} gradientMap={toonGradient()} />
      {outline > 0 && <Outlines thickness={outline} color={OUTLINE} />}
    </mesh>
  );
}

/**
 * Q 版角色：約 3.2 頭身、身高 1.5m（CLUB_ART_BIBLE §3.3）。頭大、眼睛大且有反光、手掌是連指手套形。
 * 原點在腳底中心、面向 +z；之後換成 Blender 匯出的 CHAR_ GLB 時保持一致。
 * 子節點 legL/legR/armL/armR/body/head 給程式動畫用（與之後的共用骨架同名）。
 */
export const Character = forwardRef<Group, { outfit: Outfit }>(function Character(
  { outfit: o },
  ref,
) {
  return (
    <group ref={ref}>
      {/* 圓形假影（CLUB_ART_BIBLE §5.3：角色不吃 lightmap，用假影） */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.015} renderOrder={1}>
        <circleGeometry args={[0.32, 24]} />
        <meshBasicMaterial color="#1a1010" transparent opacity={0.32} depthWrite={false} />
      </mesh>
      <group name="body">
        {/* 腿、襪、鞋 */}
        {[-0.085, 0.085].map((x, i) => (
          <group key={x} name={i ? 'legR' : 'legL'} position={[x, 0.36, 0]}>
            <Part color={o.skin} position={[0, -0.1, 0]} outline={0.008}>
              <capsuleGeometry args={[0.052, 0.14, 4, 10]} />
            </Part>
            <Part color={o.socks} position={[0, -0.24, 0]} outline={0.008}>
              <cylinderGeometry args={[0.058, 0.055, 0.1, 12]} />
            </Part>
            <Part color={o.shoes} position={[0, -0.31, 0.03]} scale={[1, 0.7, 1.35]}>
              <sphereGeometry args={[0.075, 14, 10]} />
            </Part>
          </group>
        ))}
        {/* 下身：短褲／裙 */}
        <Part color={o.bottom} position={[0, 0.42, 0]}>
          <cylinderGeometry args={[0.16, 0.2, 0.16, 18]} />
        </Part>
        {/* 上身 */}
        <Part color={o.shirt} position={[0, 0.6, 0]} scale={[1, 1, 0.82]}>
          <capsuleGeometry args={[0.15, 0.16, 6, 16]} />
        </Part>
        {o.stripe &&
          [0.55, 0.64].map((y) => (
            <mesh key={y} position={[0, y, 0]} scale={[1, 1, 0.82]}>
              <cylinderGeometry args={[0.153, 0.153, 0.035, 18]} />
              <meshToonMaterial color={o.stripe} gradientMap={toonGradient()} />
            </mesh>
          ))}
        {o.jacket &&
          [-1, 1].map((s) => (
            <Part
              key={s}
              color={o.jacket!}
              position={[s * 0.11, 0.6, 0.02]}
              scale={[0.55, 1.05, 0.9]}
              outline={0.01}
            >
              <capsuleGeometry args={[0.15, 0.17, 6, 12]} />
            </Part>
          ))}
        {o.apron && (
          <Part color={o.apron} position={[0, 0.52, 0.12]} outline={0.008}>
            <boxGeometry args={[0.24, 0.3, 0.03]} />
          </Part>
        )}
        {/* 手：手臂 + 連指手套形手掌 */}
        {[-1, 1].map((s, i) => (
          <group
            key={s}
            name={i ? 'armR' : 'armL'}
            position={[s * 0.19, 0.7, 0]}
            rotation={[0, 0, s * 0.18]}
          >
            <Part color={o.jacket ?? o.shirt} position={[0, -0.09, 0]} outline={0.01}>
              <capsuleGeometry args={[0.05, 0.13, 4, 10]} />
            </Part>
            <Part color={o.skin} position={[0, -0.21, 0]} outline={0.008}>
              <sphereGeometry args={[0.052, 12, 10]} />
            </Part>
          </group>
        ))}
        {/* 頭 */}
        <group name="head" position={[0, 1.04, 0]}>
          <Part color={o.skin} scale={[1, 0.94, 0.96]} outline={0.014}>
            <sphereGeometry args={[0.25, 28, 22]} />
          </Part>
          {/* 頭髮：後腦 + 瀏海 + 兩側髮束 */}
          <Part color={o.hair} position={[0, 0.03, -0.03]} scale={[1.06, 1.02, 1.04]}>
            <sphereGeometry args={[0.25, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
          </Part>
          {[-0.12, -0.04, 0.04, 0.12].map((x) => (
            <Part
              key={x}
              color={o.hair}
              position={[x, 0.11, 0.2]}
              rotation={[0.5, 0, 0]}
              outline={0.006}
            >
              <capsuleGeometry args={[0.045, 0.08, 4, 8]} />
            </Part>
          ))}
          {[-1, 1].map((s) => (
            <Part
              key={s}
              color={o.hair}
              position={[s * 0.22, o.longHair ? -0.17 : -0.04, -0.02]}
              rotation={[0, 0, s * 0.12]}
              outline={0.008}
            >
              <capsuleGeometry args={[0.065, o.longHair ? 0.36 : 0.1, 4, 10]} />
            </Part>
          ))}
          {o.longHair && (
            <Part color={o.hair} position={[0, -0.16, -0.14]} scale={[1.6, 1, 0.7]} outline={0.01}>
              <capsuleGeometry args={[0.11, 0.3, 4, 12]} />
            </Part>
          )}
          {o.hat && (
            <Part color={o.hat} position={[0, 0.13, -0.02]} scale={[1.08, 0.78, 1.08]}>
              <sphereGeometry args={[0.25, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            </Part>
          )}
          {/* 大眼睛：深色眼珠 + 兩顆反光 */}
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.085, -0.02, 0.218]} rotation={[0, s * 0.3, 0]}>
              <mesh scale={[0.85, 1.15, 0.5]}>
                <sphereGeometry args={[0.045, 16, 12]} />
                <meshBasicMaterial color="#2b1f2a" />
              </mesh>
              <mesh position={[0.012, 0.018, 0.02]}>
                <sphereGeometry args={[0.013, 8, 6]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
              <mesh position={[-0.012, -0.016, 0.02]}>
                <sphereGeometry args={[0.007, 8, 6]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            </group>
          ))}
          {/* 腮紅與小嘴 */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.15, -0.08, 0.19]} scale={[1, 0.6, 0.4]}>
              <sphereGeometry args={[0.035, 10, 8]} />
              <meshBasicMaterial color="#f2988a" transparent opacity={0.55} />
            </mesh>
          ))}
          <mesh position={[0, -0.1, 0.232]} scale={[1, 0.5, 0.4]}>
            <sphereGeometry args={[0.018, 8, 6]} />
            <meshBasicMaterial color="#9a4a46" />
          </mesh>
        </group>
      </group>
    </group>
  );
});

/** 走路擺動：腳、手前後擺，身體上下彈；站著時頭輕輕呼吸 */
export function animateWalk(root: Group, t: number, amount: number): void {
  const swing = Math.sin(t * 10) * 0.65 * amount;
  const body = root.getObjectByName('body');
  if (body) body.position.y = Math.abs(Math.sin(t * 10)) * 0.04 * amount;
  const head = root.getObjectByName('head');
  if (head) head.rotation.z = Math.sin(t * 1.6) * 0.03 * (1 - amount);
  const legL = root.getObjectByName('legL');
  const legR = root.getObjectByName('legR');
  const armL = root.getObjectByName('armL');
  const armR = root.getObjectByName('armR');
  if (legL) legL.rotation.x = swing;
  if (legR) legR.rotation.x = -swing;
  if (armL) armL.rotation.x = -swing * 0.8;
  if (armR) armR.rotation.x = swing * 0.8;
}
