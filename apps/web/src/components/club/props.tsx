'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { AdditiveBlending, BoxGeometry, DoubleSide, type BufferGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CLUB, useSignTexture } from './signs';
import { lightPool, tiled, woodGrain } from './textures';

/** 霓虹與窗光亮度 0～1，由日夜時鐘提供 */
export const NeonContext = createContext(1);
export const useNeon = () => useContext(NeonContext);

/** 畫質：low 關掉陰影、後處理與部分小物件 */
export type Quality = 'low' | 'medium' | 'high';
export const QualityContext = createContext<Quality>('medium');
export const useQuality = () => useContext(QualityContext);

type V3 = [number, number, number];

const geoCache = new Map<string, BufferGeometry>();

/**
 * 倒角方塊幾何（依尺寸快取共用）。小零件用 1 段倒角、很細的直接用方塊，
 * 控制三角面數（場景有上千個零件）。
 */
function roundedGeometry(size: V3, radius: number): BufferGeometry {
  const r = Math.min(radius, ...size.map((s) => s / 2 - 0.001));
  const thin = Math.min(...size) < 0.05 || r < 0.008;
  const segs = Math.max(...size) > 1.2 ? 2 : 1;
  const key = `${size.map((s) => s.toFixed(3)).join(',')}:${thin ? 0 : r.toFixed(3)}:${segs}`;
  let g = geoCache.get(key);
  if (!g) {
    g = thin
      ? new BoxGeometry(...size)
      : new RoundedBoxGeometry(size[0], size[1], size[2], segs, r);
    geoCache.set(key, g);
  }
  return g;
}

/** 共用快取幾何的 mesh：卸載時不要釋放共用的幾何 */
function Box({
  size,
  radius,
  position,
  rotation,
  castShadow,
  children,
}: {
  size: V3;
  radius: number;
  position?: V3;
  rotation?: V3;
  castShadow: boolean;
  children: ReactNode;
}) {
  const geometry = roundedGeometry(size, radius);
  return (
    <mesh
      geometry={geometry}
      position={position}
      rotation={rotation}
      castShadow={castShadow}
      receiveShadow
      dispose={null}
    >
      {children}
    </mesh>
  );
}

/** 倒角木頭方塊（家具 ≥ 2cm 倒角，CLUB_ART_BIBLE §3.2） */
export function Wood({
  size,
  position,
  rotation,
  color = '#ffffff',
  radius = 0.02,
  repeat = 1,
  roughness = 0.7,
  castShadow = true,
}: {
  size: V3;
  position?: V3;
  rotation?: V3;
  /** 乘上木紋的顏色；白色 = 原木色 */
  color?: string;
  radius?: number;
  repeat?: number;
  roughness?: number;
  castShadow?: boolean;
}) {
  const map = useMemo(() => tiled(woodGrain(), repeat, repeat), [repeat]);
  return (
    <Box
      size={size}
      radius={radius}
      position={position}
      rotation={rotation}
      castShadow={castShadow}
    >
      <meshStandardMaterial map={map} color={color} roughness={roughness} />
    </Box>
  );
}

/** 倒角色塊（烤漆、布、塑膠） */
export function Rounded({
  size,
  position,
  rotation,
  color,
  radius = 0.03,
  roughness = 0.75,
  metalness = 0,
  emissive,
  emissiveIntensity = 0,
  castShadow = true,
}: {
  size: V3;
  position?: V3;
  rotation?: V3;
  color: string;
  radius?: number;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  castShadow?: boolean;
}) {
  return (
    <Box
      size={size}
      radius={radius}
      position={position}
      rotation={rotation}
      castShadow={castShadow}
    >
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        emissive={emissive ?? '#000000'}
        emissiveIntensity={emissiveIntensity}
      />
    </Box>
  );
}

/** 有字的招牌：白天看得到字，夜晚自己發光 */
export function Sign({
  text,
  vertical,
  size,
  position,
  rotation,
  bg,
  fg,
  border,
  glow = 1,
  depth = 0,
  frame,
}: {
  text: string;
  vertical?: boolean;
  size: [number, number];
  position: V3;
  rotation?: V3;
  bg: string;
  fg: string;
  border?: string;
  /** 夜晚發光強度倍率；0 = 不發光的木招牌 */
  glow?: number;
  /** >0 時做成有厚度的燈箱 */
  depth?: number;
  /** 燈箱外框顏色 */
  frame?: string;
}) {
  const neon = useNeon();
  const px = 128;
  const map = useSignTexture({
    text,
    vertical,
    bg,
    fg,
    border,
    width: Math.round(size[0] * px),
    height: Math.round(size[1] * px),
  });
  const intensity = 0.1 + neon * 0.55 * glow;
  return (
    <group position={position} rotation={rotation}>
      {depth > 0 && (
        <Rounded
          size={[size[0] + 0.08, size[1] + 0.08, depth]}
          position={[0, 0, -depth / 2 - 0.005]}
          color={frame ?? CLUB.navy}
          radius={0.03}
          metalness={0}
          roughness={0.5}
        />
      )}
      <mesh>
        <planeGeometry args={size} />
        <meshStandardMaterial
          map={map}
          emissiveMap={map}
          emissive="#ffffff"
          emissiveIntensity={intensity}
          roughness={0.45}
          side={DoubleSide}
          toneMapped={glow === 0}
        />
      </mesh>
    </group>
  );
}

/** 夜晚會亮的窗或燈：白天淡淡的，晚上自己發光 */
export function Glow({
  size,
  position,
  rotation,
  color,
  base = 0.15,
  strength = 0.8,
}: {
  size: V3;
  position: V3;
  rotation?: V3;
  color: string;
  base?: number;
  strength?: number;
}) {
  const neon = useNeon();
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={base + neon * strength}
        roughness={0.3}
        toneMapped={false}
      />
    </mesh>
  );
}

/** 紅燈籠：上下黑蓋 + 發光燈身 */
export function Lantern({
  position,
  scale = 1,
  color = CLUB.neonRed,
  always = 0.5,
}: {
  position: V3;
  scale?: number;
  color?: string;
  /** 白天也亮的程度 */
  always?: number;
}) {
  const neon = useNeon();
  return (
    <group position={position} scale={scale}>
      <mesh scale={[1, 1.15, 1]}>
        <sphereGeometry args={[0.22, 18, 14]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={always * 0.6 + neon * 0.75}
          roughness={0.6}
          toneMapped={false}
        />
      </mesh>
      {[0.25, -0.25].map((y) => (
        <mesh key={y} position-y={y}>
          <cylinderGeometry args={[0.1, 0.1, 0.06, 14]} />
          <meshStandardMaterial color="#2a2220" roughness={0.6} />
        </mesh>
      ))}
      <mesh position-y={-0.36}>
        <cylinderGeometry args={[0.012, 0.03, 0.16, 6]} />
        <meshStandardMaterial color="#f2c14e" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** 盆栽：陶盆 + 一叢葉子 */
export function Plant({
  position,
  scale = 1,
  pot = '#b5623f',
  leaf = CLUB.green,
}: {
  position: V3;
  scale?: number;
  pot?: string;
  leaf?: string;
}) {
  const leaves = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2;
        const r = i === 0 ? 0 : 0.12 + (i % 3) * 0.04;
        return {
          p: [Math.cos(a) * r, 0.5 + (i % 4) * 0.09, Math.sin(a) * r] as V3,
          s: 0.13 + (i % 3) * 0.03,
        };
      }),
    [],
  );
  return (
    <group position={position} scale={scale}>
      <mesh position-y={0.17} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.15, 0.34, 18]} />
        <meshStandardMaterial color={pot} roughness={0.8} />
      </mesh>
      <mesh position-y={0.345}>
        <cylinderGeometry args={[0.18, 0.18, 0.02, 18]} />
        <meshStandardMaterial color="#4a3426" roughness={1} />
      </mesh>
      {leaves.map((l, i) => (
        <mesh key={i} position={l.p} scale={[1, 0.75, 1]} castShadow>
          <icosahedronGeometry args={[l.s, 1]} />
          <meshStandardMaterial color={i % 2 ? leaf : '#5f9a7e'} roughness={0.85} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/** 吊燈投下的柔和光圈（加色混合的貼地圓片），比即時光源便宜 */
export function LightPool({
  position,
  radius,
  color = CLUB.amber,
  opacity = 0.5,
}: {
  position: V3;
  radius: number;
  color?: string;
  opacity?: number;
}) {
  const map = lightPool();
  return (
    <mesh position={position} rotation-x={-Math.PI / 2} renderOrder={2}>
      <planeGeometry args={[radius * 2, radius * 2]} />
      <meshBasicMaterial
        map={map}
        color={color}
        transparent
        opacity={opacity}
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/** 方便把一組東西放在地上某個 (x, z) */
export function At({
  x,
  z,
  y = 0,
  ry = 0,
  children,
}: {
  x: number;
  z: number;
  y?: number;
  ry?: number;
  children: ReactNode;
}) {
  return (
    <group position={[x, y, z]} rotation-y={ry}>
      {children}
    </group>
  );
}
