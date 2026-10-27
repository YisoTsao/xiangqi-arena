'use client';

import { forwardRef } from 'react';
import type { Group } from 'three';

export interface Outfit {
  skin: string;
  hair: string;
  top: string;
  bottom: string;
  /** 圍裙、背心等外層；沒有就省略 */
  apron?: string;
}

export const PLAYER_OUTFIT: Outfit = {
  skin: '#f3d2b3',
  hair: '#2e2420',
  top: '#E95B4B',
  bottom: '#24344D',
};

export const A_LE_OUTFIT: Outfit = {
  skin: '#e9c3a0',
  hair: '#6b6460',
  top: '#F2DAB6',
  bottom: '#5e3f2c',
  apron: '#4E816F',
};

/**
 * Q 版角色的佔位模型：約 3.2 頭身、身高 1.5m（CLUB_ART_BIBLE §3.3）。
 * 之後換成 Blender 匯出的 CHAR_ GLB，外層 group 的原點（腳底中心、面向 +z）保持一致。
 * 子節點名稱 legL/legR/armL/armR/body 給走路動畫用。
 */
export const Character = forwardRef<Group, { outfit: Outfit }>(function Character({ outfit }, ref) {
  return (
    <group ref={ref}>
      {/* 圓形假影 */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.012} renderOrder={1}>
        <circleGeometry args={[0.34, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <group name="body">
        {/* 腿 */}
        <mesh name="legL" position={[-0.1, 0.17, 0]}>
          <capsuleGeometry args={[0.075, 0.2, 4, 8]} />
          <meshStandardMaterial color={outfit.bottom} roughness={0.85} />
        </mesh>
        <mesh name="legR" position={[0.1, 0.17, 0]}>
          <capsuleGeometry args={[0.075, 0.2, 4, 8]} />
          <meshStandardMaterial color={outfit.bottom} roughness={0.85} />
        </mesh>
        {/* 身體 */}
        <mesh position={[0, 0.55, 0]}>
          <capsuleGeometry args={[0.2, 0.26, 6, 14]} />
          <meshStandardMaterial color={outfit.top} roughness={0.8} />
        </mesh>
        {outfit.apron && (
          <mesh position={[0, 0.5, 0.15]}>
            <boxGeometry args={[0.3, 0.36, 0.08]} />
            <meshStandardMaterial color={outfit.apron} roughness={0.9} />
          </mesh>
        )}
        {/* 手 */}
        <mesh name="armL" position={[-0.26, 0.58, 0]}>
          <capsuleGeometry args={[0.06, 0.18, 4, 8]} />
          <meshStandardMaterial color={outfit.top} roughness={0.8} />
        </mesh>
        <mesh name="armR" position={[0.26, 0.58, 0]}>
          <capsuleGeometry args={[0.06, 0.18, 4, 8]} />
          <meshStandardMaterial color={outfit.top} roughness={0.8} />
        </mesh>
        {/* 頭（大）＋ 頭髮 ＋ 眼睛 */}
        <group position={[0, 1.07, 0]}>
          <mesh>
            <sphereGeometry args={[0.32, 24, 18]} />
            <meshStandardMaterial color={outfit.skin} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.07, -0.03]} scale={[1.05, 0.92, 1.05]}>
            <sphereGeometry args={[0.32, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
            <meshStandardMaterial color={outfit.hair} roughness={0.75} />
          </mesh>
          <mesh position={[-0.11, -0.02, 0.29]}>
            <sphereGeometry args={[0.04, 10, 8]} />
            <meshBasicMaterial color="#1d1a17" />
          </mesh>
          <mesh position={[0.11, -0.02, 0.29]}>
            <sphereGeometry args={[0.04, 10, 8]} />
            <meshBasicMaterial color="#1d1a17" />
          </mesh>
          <mesh position={[-0.19, -0.1, 0.24]}>
            <sphereGeometry args={[0.045, 10, 8]} />
            <meshBasicMaterial color="#f29b8a" transparent opacity={0.6} />
          </mesh>
          <mesh position={[0.19, -0.1, 0.24]}>
            <sphereGeometry args={[0.045, 10, 8]} />
            <meshBasicMaterial color="#f29b8a" transparent opacity={0.6} />
          </mesh>
        </group>
      </group>
    </group>
  );
});

/** 走路擺動：腳、手前後擺，身體輕微上下 */
export function animateWalk(root: Group, t: number, amount: number): void {
  const swing = Math.sin(t * 11) * 0.6 * amount;
  const body = root.getObjectByName('body');
  if (body) body.position.y = Math.abs(Math.sin(t * 11)) * 0.05 * amount;
  const legL = root.getObjectByName('legL');
  const legR = root.getObjectByName('legR');
  const armL = root.getObjectByName('armL');
  const armR = root.getObjectByName('armR');
  if (legL) legL.rotation.x = swing;
  if (legR) legR.rotation.x = -swing;
  if (armL) armL.rotation.x = -swing * 0.8;
  if (armR) armR.rotation.x = swing * 0.8;
}
