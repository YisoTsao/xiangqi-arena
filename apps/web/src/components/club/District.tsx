'use client';

import { Suspense, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial as StandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from 'three';
import {
  DISTRICT,
  DISTRICT_LAMPS,
  DISTRICT_MODELS,
  EXPANSION_LOTS,
  PLAZA,
  SIDE_STREET_HALF,
  SIDE_STREET_X,
  ALLEY,
  type DistrictModelId,
  type Lot,
  type Placement,
} from './district';
import { Fallback } from './assets';
import { glowingWindows, windowGlow } from './glbMaterials';
import { usePbr, type PbrSet } from './pbr';
import { Sign, useNeon, useQuality } from './props';
import { lightPool } from './textures';
import { CLUB } from './signs';

/**
 * 樂町街區（district.ts 的資料畫出來）：大樓、樹、車、噴水池都是免費 GLB，
 * 同一個模型的所有擺放合成一個 InstancedMesh，整個街區只多幾十個 draw call。
 */

type V3 = [number, number, number];

function Surface({
  set,
  size,
  tile,
  position,
  color = '#ffffff',
}: {
  set: PbrSet;
  size: [number, number];
  tile: number;
  position: V3;
  color?: string;
}) {
  const maps = usePbr(set, size, tile);
  return (
    <mesh rotation-x={-Math.PI / 2} position={position} receiveShadow>
      <planeGeometry args={size} />
      <meshStandardMaterial {...maps} color={color} />
    </mesh>
  );
}

/** 側街、後巷、廣場鋪面、擴建預定地的地面 */
function Grounds() {
  const x = SIDE_STREET_X;
  const w = SIDE_STREET_HALF * 2;
  // 主街那一段（z ∈ [0, 16]）由 Street／濕街面畫，側街只畫南北兩段
  const north = { z0: -62, z1: 0 };
  const south = { z0: 16, z1: 62 };
  const strips = [north, south];
  return (
    <group>
      {[-x, x].flatMap((cx) =>
        strips.map(({ z0, z1 }) => (
          <group key={`${cx}${z0}`}>
            <Surface
              set="asphalt"
              size={[w, z1 - z0]}
              tile={4}
              position={[cx, 0.002, (z0 + z1) / 2]}
            />
            {/* 中線 */}
            {Array.from({ length: Math.floor((z1 - z0) / 4) }, (_, i) => (
              <mesh key={i} rotation-x={-Math.PI / 2} position={[cx, 0.006, z0 + 1 + i * 4]}>
                <planeGeometry args={[0.14, 2]} />
                <meshStandardMaterial color="#e2d29e" roughness={0.55} />
              </mesh>
            ))}
            {/* 緣石 */}
            {[-1, 1].map((s) => (
              <mesh key={s} position={[cx + s * (SIDE_STREET_HALF + 0.12), 0.07, (z0 + z1) / 2]}>
                <boxGeometry args={[0.24, 0.14, z1 - z0]} />
                <meshStandardMaterial color="#d8cfbf" roughness={0.8} />
              </mesh>
            ))}
          </group>
        )),
      )}
      {/* 後巷：舊水泥地 */}
      <Surface
        set="concrete"
        size={[x * 2 - w, ALLEY.maxZ - ALLEY.minZ]}
        tile={2.5}
        position={[0, 0.002, (ALLEY.minZ + ALLEY.maxZ) / 2]}
        color="#8f867c"
      />
      {/* 樂町廣場：陶磚鋪面（z < 16 那一段是主街的對面人行道） */}
      <Surface
        set="arcade_tile"
        size={[PLAZA.maxX - PLAZA.minX, PLAZA.maxZ - 16]}
        tile={1.6}
        position={[(PLAZA.minX + PLAZA.maxX) / 2, 0.003, (16 + PLAZA.maxZ) / 2]}
        color="#e8dccb"
      />
      {EXPANSION_LOTS.map((lot) => (
        <Surface
          key={lot.id}
          set="concrete"
          size={[lot.maxX - lot.minX, lot.maxZ - lot.minZ]}
          tile={3}
          position={[(lot.minX + lot.maxX) / 2, 0.004, (lot.minZ + lot.maxZ) / 2]}
          color="#9a7f62"
        />
      ))}
    </group>
  );
}

/** 擴建預定地的立牌 */
function LotSign({ lot }: { lot: Lot }) {
  const cx = (lot.minX + lot.maxX) / 2;
  const cz = (lot.minZ + lot.maxZ) / 2;
  const at: Record<Lot['gate'], { p: V3; ry: number }> = {
    s: { p: [cx + 4.4, 0, lot.maxZ + 0.6], ry: 0 },
    n: { p: [cx - 4.4, 0, lot.minZ - 0.6], ry: Math.PI },
    w: { p: [lot.minX - 0.6, 0, cz + 4.4], ry: -Math.PI / 2 },
    e: { p: [lot.maxX + 0.6, 0, cz - 4.4], ry: Math.PI / 2 },
  };
  const { p, ry } = at[lot.gate];
  return (
    <group position={p} rotation-y={ry}>
      {[-1.1, 1.1].map((x) => (
        <mesh key={x} position={[x, 1, 0]} castShadow>
          <boxGeometry args={[0.1, 2, 0.1]} />
          <meshStandardMaterial color={CLUB.woodDark} roughness={0.8} />
        </mesh>
      ))}
      <Sign
        text={lot.label}
        size={[2.6, 0.62]}
        position={[0, 1.9, 0.06]}
        bg={CLUB.cream}
        fg={CLUB.navy}
        border={CLUB.wood}
        glow={0.4}
      />
      <Sign
        text="新館籌備中．敬請期待"
        size={[2.6, 0.42]}
        position={[0, 1.32, 0.06]}
        bg={CLUB.neonRed}
        fg={CLUB.cream}
        glow={0.6}
      />
    </group>
  );
}

const ALL_MODELS = Object.keys(DISTRICT_MODELS) as DistrictModelId[];

interface Part {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
}

/**
 * 最佳化過的 GLB 用 KHR_mesh_quantization（整數頂點 + 節點縮放）：先轉成 float，
 * 才能把節點變換烘進頂點，不然整數陣列會被截斷。
 */
function toFloat(geometry: BufferGeometry): BufferGeometry {
  const g = geometry;
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name);
    const interleaved = (a as { isInterleavedBufferAttribute?: boolean })
      .isInterleavedBufferAttribute;
    if (a.array instanceof Float32Array && !interleaved) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) {
      for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
    }
    g.setAttribute(name, new Float32BufferAttribute(out, a.itemSize));
  }
  return g;
}

/** 把一個 GLB 攤平成「已經套好節點變換的 geometry + 材質」 */
function flatten(root: Object3D, windows: boolean): Part[] {
  root.updateWorldMatrix(true, true);
  const parts: Part[] = [];
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const geometry = toFloat(m.geometry.clone()).applyMatrix4(m.matrixWorld);
    const src = m.material as MeshStandardMaterial;
    const material = (windows ? glowingWindows(src) : src.clone()) as MeshStandardMaterial;
    parts.push({ geometry, material });
  });
  return parts;
}

const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpS = new Vector3();
const tmpP = new Vector3();
const UP = new Vector3(0, 1, 0);
/** 圍籬模型貼在格子的 z = -0.465 那一邊，先移到中心線 */
const FENCE_SHIFT = new Matrix4().makeTranslation(0, 0, 0.465);

function matrixOf(p: Placement, out: Matrix4): Matrix4 {
  tmpQ.setFromAxisAngle(UP, p.ry ?? 0);
  tmpS.setScalar(p.s);
  tmpP.set(p.x, 0, p.z);
  out.compose(tmpP, tmpQ, tmpS);
  if (p.model === 'fence') out.multiply(FENCE_SHIFT);
  return out;
}

function ModelInstances({ id, places }: { id: DistrictModelId; places: Placement[] }) {
  const spec = DISTRICT_MODELS[id];
  const { scene } = useGLTF(spec.url);
  const meshes = useMemo(() => {
    const parts = flatten(scene, 'windows' in spec && !!spec.windows);
    const shadow = !id.startsWith('bush') && id !== 'flower' && id !== 'fence';
    return parts.map(({ geometry, material }) => {
      const im = new InstancedMesh(geometry, material, places.length);
      const color = new Color();
      places.forEach((p, i) => {
        im.setMatrixAt(i, matrixOf(p, tmpM));
        im.setColorAt(i, color.set(p.tint ?? '#ffffff'));
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = shadow;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      // 不讓 Bake 之類的合併動到它
      im.userData.noBake = true;
      return im;
    });
  }, [scene, spec, id, places]);
  useEffect(
    () => () => {
      for (const m of meshes) {
        m.geometry.dispose();
        (m.material as MeshStandardMaterial).dispose();
        m.dispose();
      }
    },
    [meshes],
  );
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}

/**
 * 街區路燈：燈桿、燈泡、地上的光圈各一個 InstancedMesh（不用即時光源，手機也撐得住）。
 * 燈泡與光圈的亮度跟著霓虹時段走。
 */
function Lamps() {
  const neon = useNeon();
  const quality = useQuality();
  const { pole, bulb, pool } = useMemo(() => {
    const n = DISTRICT_LAMPS.length;
    const pole = new InstancedMesh(
      new CylinderGeometry(0.06, 0.1, 4.2, 10).translate(0, 2.1, 0),
      new StandardMaterial({ color: CLUB.green, metalness: 1, roughness: 0.45 }),
      n,
    );
    const bulb = new InstancedMesh(
      new SphereGeometry(0.22, 14, 10).translate(0, 4.2, 0),
      new StandardMaterial({ color: '#fff2cc', emissive: '#ffd890', toneMapped: false }),
      n,
    );
    const pool = new InstancedMesh(
      new PlaneGeometry(9, 9).rotateX(-Math.PI / 2).translate(0, 0.02, 0),
      new MeshBasicMaterial({
        map: lightPool(),
        color: CLUB.amber,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      n,
    );
    pool.renderOrder = 2;
    pole.castShadow = true;
    const m = new Matrix4();
    DISTRICT_LAMPS.forEach(([x, z], i) => {
      m.makeTranslation(x, 0, z);
      pole.setMatrixAt(i, m);
      bulb.setMatrixAt(i, m);
      pool.setMatrixAt(i, m);
    });
    for (const im of [pole, bulb, pool]) {
      im.computeBoundingSphere();
      im.userData.noBake = true;
    }
    return { pole, bulb, pool };
  }, []);
  (bulb.material as StandardMaterial).emissiveIntensity = 0.1 + neon * 3;
  (pool.material as MeshBasicMaterial).opacity = neon * (quality === 'low' ? 0.45 : 0.6);
  useEffect(
    () => () => {
      for (const im of [pole, bulb, pool]) {
        im.geometry.dispose();
        (im.material as MeshBasicMaterial).dispose();
        im.dispose();
      }
    },
    [pole, bulb, pool],
  );
  return (
    <>
      <primitive object={pole} />
      <primitive object={bulb} />
      {neon > 0.05 && <primitive object={pool} />}
    </>
  );
}

/** 夜晚窗戶亮度跟著霓虹時段走 */
function WindowGlowDriver() {
  const neon = useNeon();
  useEffect(() => {
    windowGlow.value = neon * 1.15;
  }, [neon]);
  return null;
}

export function District() {
  const byModel = useMemo(() => {
    const m = new Map<DistrictModelId, Placement[]>();
    for (const p of DISTRICT) {
      const list = m.get(p.model) ?? [];
      list.push(p);
      m.set(p.model, list);
    }
    return m;
  }, []);
  return (
    <group>
      <Grounds />
      <WindowGlowDriver />
      <Lamps />
      {EXPANSION_LOTS.map((lot) => (
        <LotSign key={lot.id} lot={lot} />
      ))}
      {[...byModel].map(([id, places]) => (
        // 每個模型各自載入：一個檔案慢或壞掉，不會讓整個街區消失
        <Fallback key={id} fallback={null}>
          <Suspense fallback={null}>
            <ModelInstances id={id} places={places} />
          </Suspense>
        </Fallback>
      ))}
    </group>
  );
}

export function preloadDistrict(): void {
  for (const id of ALL_MODELS) useGLTF.preload(DISTRICT_MODELS[id].url);
}
