'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Object3D, type InstancedMesh } from 'three';
import { Bake } from './Bake';
import { Character, A_LE_OUTFIT } from './Character';
import {
  A_LE,
  CHAIR_SIZE,
  COUNTER,
  DISPLAY_CASE,
  ELEVATOR,
  FOYER_DEPTH,
  HALL,
  INDOOR_PLANTS,
  PARTITIONS,
  SHOE_CABINET,
  STAIRS,
  TABLE_HEIGHT,
  TABLE_SIZE,
  TABLES,
  TEA_CABINET,
  chairsOf,
  type Box,
  type Vec2,
} from './layout';
import { Glow, Lantern, LightPool, Plant, Rounded, Sign, Wood, useNeon, useQuality } from './props';
import { CLUB } from './signs';
import { felt, retroTile, shoji, terrazzo, tiled, wallpaper, woodPlanks } from './textures';

const WAINSCOT = 1.1;
const H = HALL.height;
const D = -HALL.minZ;
const W = HALL.maxX - HALL.minX;
/** 室內時，靠鏡頭的正面牆與右牆切成這個高度（剖面娃娃屋） */
const CUT = 0.9;

const mid = (b: Box): Vec2 => [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2];
const span = (b: Box): [number, number] => [b.maxX - b.minX, b.maxZ - b.minZ];

// ── 地板與牆 ───────────────────────────────────────────

function Floor() {
  const wood = useMemo(() => tiled(woodPlanks(), W / 3, (D - FOYER_DEPTH) / 3), []);
  const stone = useMemo(() => tiled(terrazzo(), W / 2.5, FOYER_DEPTH / 2.5), []);
  return (
    <group>
      {/* 牌桌區：木地板 */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, 0.006, HALL.minZ + (D - FOYER_DEPTH) / 2]}
        receiveShadow
      >
        <planeGeometry args={[W, D - FOYER_DEPTH]} />
        <meshStandardMaterial map={wood} roughness={0.62} />
      </mesh>
      {/* 玄關：磨石子 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, -FOYER_DEPTH / 2]} receiveShadow>
        <planeGeometry args={[W, FOYER_DEPTH]} />
        <meshStandardMaterial map={stone} roughness={0.5} />
      </mesh>
      {/* 門口地墊 */}
      <Rounded
        size={[1.8, 0.02, 1.1]}
        position={[0, 0.012, -0.75]}
        color="#a8443a"
        radius={0.008}
        roughness={0.95}
        castShadow={false}
      />
      <Rounded
        size={[1.5, 0.022, 0.8]}
        position={[0, 0.013, -0.75]}
        color="#c4583f"
        radius={0.008}
        roughness={0.95}
        castShadow={false}
      />
    </group>
  );
}

/** 一面牆：下半磁磚、上半壁紙、木腰線與天花線腳 */
function WallPanel({
  length,
  position,
  ry,
  height = H,
}: {
  length: number;
  position: [number, number, number];
  ry: number;
  height?: number;
}) {
  const tile = useMemo(() => tiled(retroTile(), length / 1.2, WAINSCOT / 1.2), [length]);
  const paper = useMemo(
    () => tiled(wallpaper(), length / 1.6, Math.max(0.1, height - WAINSCOT) / 1.6),
    [length, height],
  );
  const low = Math.min(WAINSCOT, height);
  return (
    <group position={position} rotation-y={ry}>
      <mesh position-y={low / 2} receiveShadow>
        <boxGeometry args={[length, low, 0.3]} />
        <meshStandardMaterial map={tile} roughness={0.45} />
      </mesh>
      {height > WAINSCOT && (
        <mesh position-y={WAINSCOT + (height - WAINSCOT) / 2} receiveShadow>
          <boxGeometry args={[length, height - WAINSCOT, 0.3]} />
          <meshStandardMaterial map={paper} roughness={0.85} />
        </mesh>
      )}
      <Wood
        size={[length, 0.08, 0.36]}
        position={[0, low, 0]}
        repeat={length / 2}
        castShadow={false}
      />
      {height > WAINSCOT && (
        <Wood
          size={[length, 0.14, 0.38]}
          position={[0, height - 0.07, 0]}
          repeat={length / 2}
          castShadow={false}
        />
      )}
    </group>
  );
}

/** 窗：木框 + 和紙格，光從外面透進來（白天暖白、夜晚冷藍月光） */
function ShojiWindow({
  position,
  ry,
  size = [1.6, 1.3],
}: {
  position: [number, number, number];
  ry: number;
  size?: [number, number];
}) {
  const neon = useNeon();
  const paper = useMemo(() => tiled(shoji(), 1, 1), []);
  // 白天外面亮、晚上外面暗藍：窗光用冷色，與室內暖光形成對比
  const cool = neon > 0.5;
  return (
    <group position={position} rotation-y={ry}>
      <Wood
        size={[size[0] + 0.16, size[1] + 0.16, 0.08]}
        position={[0, 0, -0.01]}
        castShadow={false}
      />
      <mesh position-z={0.035}>
        <planeGeometry args={size} />
        <meshStandardMaterial
          map={paper}
          emissiveMap={paper}
          emissive={cool ? '#9cc4ff' : '#fff1d6'}
          emissiveIntensity={cool ? 0.75 : 1.1}
          toneMapped={false}
        />
      </mesh>
      <Wood
        size={[size[0] + 0.3, 0.06, 0.2]}
        position={[0, -size[1] / 2 - 0.1, 0.06]}
        castShadow={false}
      />
    </group>
  );
}

function Walls({ inside }: { inside: boolean }) {
  const frontH = inside ? CUT : H;
  return (
    <group>
      {/* 後牆、左牆：完整高度 */}
      <WallPanel length={W + 0.6} position={[0, 0, HALL.minZ - 0.15]} ry={0} />
      <WallPanel length={D} position={[HALL.minX - 0.15, 0, -D / 2]} ry={Math.PI / 2} />
      {/* 右牆：進到室內時切低，鏡頭從右前方看進來 */}
      <WallPanel
        length={D}
        position={[HALL.maxX + 0.15, 0, -D / 2]}
        ry={-Math.PI / 2}
        height={inside ? CUT : H}
      />
      {/* 正面牆內側（門的兩邊）：只有在室內時出現，切低 */}
      {inside &&
        [
          [HALL.minX - 0.3, -1],
          [1, HALL.maxX + 0.3],
        ].map(([a, b]) => (
          <WallPanel
            key={a}
            length={b! - a!}
            position={[(a! + b!) / 2, 0, 0]}
            ry={Math.PI}
            height={frontH}
          />
        ))}
      {/* 後牆三扇和紙窗、左牆兩扇 */}
      {[-4.6, 0.2, 4.4].map((x) => (
        <ShojiWindow key={x} position={[x, 1.9, HALL.minZ + 0.02]} ry={0} />
      ))}
      {[-4.4, -9].map((z) => (
        <ShojiWindow
          key={z}
          position={[HALL.minX + 0.02, 1.9, z]}
          ry={Math.PI / 2}
          size={[1.4, 1.2]}
        />
      ))}
    </group>
  );
}

// ── 玄關 ───────────────────────────────────────────────

/** 木格隔間：木框 + 直格 + 下半和紙 */
function Partition({ area }: { area: Box }) {
  const [cx, cz] = mid(area);
  const [len] = span(area);
  const h = 1.9;
  const slats = Math.floor(len / 0.18);
  const paper = useMemo(() => tiled(shoji(), len / 1.2, 1), [len]);
  return (
    <group position={[cx, 0, cz]}>
      <Wood size={[len, 0.08, 0.12]} position={[0, h, 0]} repeat={len} />
      <Wood size={[len, 0.1, 0.14]} position={[0, 0.05, 0]} repeat={len} />
      <Wood size={[len, 0.06, 0.1]} position={[0, 0.8, 0]} repeat={len} />
      <mesh position-y={0.45}>
        <boxGeometry args={[len - 0.1, 0.7, 0.03]} />
        <meshStandardMaterial map={paper} roughness={0.9} />
      </mesh>
      {Array.from({ length: slats }, (_, i) => (
        <Wood
          key={i}
          size={[0.035, h - 0.85, 0.05]}
          position={[-len / 2 + 0.09 + i * 0.18, 0.83 + (h - 0.85) / 2, 0]}
          radius={0.01}
          castShadow={false}
        />
      ))}
      {[-len / 2, len / 2].map((x) => (
        <Wood key={x} size={[0.1, h, 0.14]} position={[x, h / 2, 0]} />
      ))}
    </group>
  );
}

function Foyer() {
  const neon = useNeon();
  const [sx, sz] = mid(SHOE_CABINET);
  const [sw, sd] = span(SHOE_CABINET);
  const [dx, dz] = mid(DISPLAY_CASE);
  const [dw, dd] = span(DISPLAY_CASE);
  return (
    <group>
      {PARTITIONS.map((p, i) => (
        <Partition key={i} area={p} />
      ))}
      {/* 鞋櫃：上面放招財貓與花瓶 */}
      <Wood size={[sw, 0.9, sd]} position={[sx, 0.45, sz]} repeat={2} />
      {[-0.4, 0, 0.4].map((x) => (
        <Rounded
          key={x}
          size={[0.36, 0.3, 0.02]}
          position={[sx + x, 0.5, sz + sd / 2 + 0.005]}
          color="#6e4a33"
          radius={0.01}
          castShadow={false}
        />
      ))}
      <group position={[sx - 0.5, 0.9, sz]}>
        <mesh position-y={0.1} castShadow>
          <sphereGeometry args={[0.1, 14, 12]} />
          <meshStandardMaterial color={CLUB.ivory} roughness={0.4} />
        </mesh>
        <mesh position-y={0.24} castShadow>
          <sphereGeometry args={[0.08, 14, 12]} />
          <meshStandardMaterial color={CLUB.ivory} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.12, 0.09]}>
          <sphereGeometry args={[0.03, 10, 8]} />
          <meshStandardMaterial color={CLUB.amber} roughness={0.3} metalness={1} />
        </mesh>
      </group>
      <Plant position={[sx + 0.5, 0.9, sz]} scale={0.55} pot="#3f6f8a" />
      {/* 傘架 */}
      <mesh position={[sx - 1.05, 0.3, sz]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.6, 16, 1, true]} />
        <meshStandardMaterial color="#7a8a96" metalness={1} roughness={0.4} side={2} />
      </mesh>
      {/* 展示櫃：玻璃門內放麻將組與獎盃，夜晚透出櫃燈 */}
      <Wood size={[dw, 0.12, dd]} position={[dx, 0.06, dz]} />
      <Wood size={[dw, 0.08, dd]} position={[dx, 1.74, dz]} />
      {[-dw / 2 + 0.05, dw / 2 - 0.05].map((x) => (
        <Wood key={x} size={[0.08, 1.72, dd]} position={[dx + x, 0.9, dz]} />
      ))}
      {[0.55, 1.1].map((y) => (
        <Wood
          key={y}
          size={[dw - 0.1, 0.03, dd - 0.06]}
          position={[dx, y, dz]}
          castShadow={false}
        />
      ))}
      <Glow
        size={[dw - 0.16, 0.02, dd - 0.1]}
        position={[dx, 1.68, dz]}
        color="#ffe2b0"
        base={0.6}
        strength={0.6}
      />
      {[0.12, 0.58, 1.13].map((y, row) =>
        [-0.6, -0.15, 0.3, 0.7].map((x, i) =>
          (row + i) % 2 ? (
            <Rounded
              key={`${y}${x}`}
              size={[0.3, 0.1, 0.2]}
              position={[dx + x, y + 0.06, dz]}
              color={[CLUB.green, CLUB.neonRed, '#3f6f8a'][(row + i) % 3]!}
              radius={0.02}
              castShadow={false}
            />
          ) : (
            <group key={`${y}${x}`} position={[dx + x, y, dz]}>
              <mesh position-y={0.04}>
                <cylinderGeometry args={[0.05, 0.06, 0.08, 12]} />
                <meshStandardMaterial color="#c99a3b" metalness={1} roughness={0.35} />
              </mesh>
              <mesh position-y={0.16}>
                <cylinderGeometry args={[0.07, 0.03, 0.14, 14]} />
                <meshStandardMaterial color="#e3b55b" metalness={1} roughness={0.3} />
              </mesh>
            </group>
          ),
        ),
      )}
      <mesh position={[dx, 0.9, dz + dd / 2 + 0.01]}>
        <planeGeometry args={[dw - 0.12, 1.6]} />
        <meshStandardMaterial
          color="#cfe6ee"
          transparent
          opacity={0.18 + neon * 0.05}
          roughness={0.05}
        />
      </mesh>
      {/* 玄關牆上的營業時間木牌 */}
      <Sign
        text="營業時間 24 小時"
        size={[1.8, 0.36]}
        position={[-5.4, 2.55, -0.17]}
        rotation={[0, Math.PI, 0]}
        bg={CLUB.wood}
        fg={CLUB.cream}
        glow={0}
      />
      <Lantern position={[-1.6, 2.7, -0.5]} scale={0.8} />
      <Lantern position={[1.6, 2.7, -0.5]} scale={0.8} />
    </group>
  );
}

// ── 牌桌 ───────────────────────────────────────────────

const TILE = { w: 0.028, h: 0.02, d: 0.038 } as const;
const STACKS = 17;

/** 每張桌上四道牌牆（兩層、牌背朝上）：全部桌子共用兩個 InstancedMesh */
function TileWalls() {
  const body = useRef<InstancedMesh>(null);
  const back = useRef<InstancedMesh>(null);
  const count = TABLES.length * 4 * STACKS * 2;
  useLayoutEffect(() => {
    const o = new Object3D();
    let i = 0;
    for (const [tx, tz] of TABLES) {
      for (let side = 0; side < 4; side++) {
        const rot = (side * Math.PI) / 2;
        for (let s = 0; s < STACKS; s++) {
          for (let layer = 0; layer < 2; layer++) {
            const along = (s - (STACKS - 1) / 2) * TILE.w;
            const lx = along;
            const lz = 0.25;
            o.position.set(
              tx + lx * Math.cos(rot) + lz * Math.sin(rot),
              TABLE_HEIGHT + 0.012 + TILE.h * (layer + 0.5) - 0.004,
              tz - lx * Math.sin(rot) + lz * Math.cos(rot),
            );
            o.rotation.set(0, rot, 0);
            o.updateMatrix();
            body.current?.setMatrixAt(i, o.matrix);
            o.position.y += TILE.h * 0.32;
            o.scale.set(1, 0.36, 1);
            o.updateMatrix();
            back.current?.setMatrixAt(i, o.matrix);
            o.scale.set(1, 1, 1);
            i++;
          }
        }
      }
    }
    if (body.current) body.current.instanceMatrix.needsUpdate = true;
    if (back.current) back.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group>
      <instancedMesh ref={body} args={[undefined, undefined, count]} castShadow>
        <boxGeometry args={[TILE.w * 0.94, TILE.h * 0.94, TILE.d]} />
        <meshStandardMaterial color={CLUB.ivory} roughness={0.35} />
      </instancedMesh>
      <instancedMesh ref={back} args={[undefined, undefined, count]}>
        <boxGeometry args={[TILE.w * 0.96, TILE.h * 0.96, TILE.d * 1.01]} />
        <meshStandardMaterial color="#2f8a6a" roughness={0.35} />
      </instancedMesh>
    </group>
  );
}

/** 木椅：靠背 + 紅色坐墊，面向桌子 */
function Chair({ at, face }: { at: Vec2; face: number }) {
  const s = CHAIR_SIZE;
  return (
    <group position={[at[0], 0, at[1]]} rotation-y={face}>
      <Wood size={[s, 0.05, s]} position={[0, 0.43, 0]} />
      <Rounded
        size={[s - 0.06, 0.05, s - 0.06]}
        position={[0, 0.47, 0]}
        color="#b8433a"
        radius={0.02}
        roughness={0.9}
      />
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([a, b]) => (
        <Wood
          key={`${a}${b}`}
          size={[0.045, 0.42, 0.045]}
          position={[(a! * (s - 0.07)) / 2, 0.21, (b! * (s - 0.07)) / 2]}
          radius={0.01}
          castShadow={false}
        />
      ))}
      {/* 靠背在遠離桌子的那側（-z 是桌子方向） */}
      <Wood size={[s, 0.42, 0.05]} position={[0, 0.7, s / 2 - 0.03]} />
      <Wood
        size={[s - 0.12, 0.08, 0.055]}
        position={[0, 0.62, s / 2 - 0.03]}
        color="#d9b38c"
        castShadow={false}
      />
    </group>
  );
}

function MahjongTable({
  at,
  number,
  onSelect,
}: {
  at: Vec2;
  number: number;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const feltMap = useMemo(() => tiled(felt(), 1, 1), []);
  const [x, z] = at;
  const chairs = chairsOf(at);
  // 椅子面向桌子：南椅朝 -z（rotation 0 時靠背在 +z）
  const faces = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  return (
    <group>
      <group position={[x, 0, z]} onClick={onSelect}>
        {/* 地毯 */}
        <Rounded
          size={[2.5, 0.015, 2.5]}
          position={[0, 0.012, 0]}
          color="#7a2f2a"
          radius={0.006}
          roughness={1}
          castShadow={false}
        />
        <Rounded
          size={[2.2, 0.017, 2.2]}
          position={[0, 0.013, 0]}
          color="#9c463a"
          radius={0.006}
          roughness={1}
          castShadow={false}
        />
        {/* 桌腳與裙板 */}
        <Wood
          size={[TABLE_SIZE - 0.14, 0.12, TABLE_SIZE - 0.14]}
          position={[0, TABLE_HEIGHT - 0.12, 0]}
        />
        {[
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].map(([a, b]) => (
          <Wood
            key={`${a}${b}`}
            size={[0.08, TABLE_HEIGHT - 0.1, 0.08]}
            position={[a! * 0.4, (TABLE_HEIGHT - 0.1) / 2, b! * 0.4]}
          />
        ))}
        {/* 桌面：木框高出絨布一點，四邊放籌碼槽 */}
        {[0, 1, 2, 3].map((side) => (
          <Wood
            key={side}
            size={[TABLE_SIZE, 0.06, 0.08]}
            position={[
              Math.sin((side * Math.PI) / 2) * (TABLE_SIZE / 2 - 0.04),
              TABLE_HEIGHT - 0.02,
              Math.cos((side * Math.PI) / 2) * (TABLE_SIZE / 2 - 0.04),
            ]}
            rotation={[0, (side * Math.PI) / 2, 0]}
            radius={0.025}
          />
        ))}
        <mesh position-y={TABLE_HEIGHT - 0.03} receiveShadow>
          <boxGeometry args={[TABLE_SIZE - 0.14, 0.04, TABLE_SIZE - 0.14]} />
          <meshStandardMaterial map={feltMap} roughness={0.95} />
        </mesh>
        {/* 中央的骰盤 */}
        <mesh position-y={TABLE_HEIGHT - 0.003}>
          <cylinderGeometry args={[0.08, 0.09, 0.02, 24]} />
          <meshStandardMaterial color="#b57a3c" metalness={1} roughness={0.35} />
        </mesh>
        <mesh position-y={TABLE_HEIGHT + 0.008}>
          <cylinderGeometry args={[0.055, 0.055, 0.004, 24]} />
          <meshStandardMaterial color="#2f6b55" roughness={0.6} />
        </mesh>
        {[-0.015, 0.02].map((dx) => (
          <Rounded
            key={dx}
            size={[0.022, 0.022, 0.022]}
            position={[dx, TABLE_HEIGHT + 0.022, dx * 0.6]}
            color={CLUB.ivory}
            radius={0.005}
            castShadow={false}
          />
        ))}
        {/* 吊燈：木框燈罩 + 燈泡 + 投在桌上的光圈 */}
        <mesh position-y={3.0}>
          <cylinderGeometry args={[0.006, 0.006, 1.2, 4]} />
          <meshStandardMaterial color="#2a2220" />
        </mesh>
        <mesh position-y={2.32} castShadow>
          <coneGeometry args={[0.34, 0.24, 16, 1, true]} />
          <meshStandardMaterial
            color="#e9c48a"
            emissive="#f2b552"
            emissiveIntensity={0.55}
            roughness={0.7}
            side={2}
          />
        </mesh>
        <Wood size={[0.62, 0.03, 0.62]} position={[0, 2.2, 0]} radius={0.012} castShadow={false} />
        <mesh position-y={2.26}>
          <sphereGeometry args={[0.07, 12, 10]} />
          <meshStandardMaterial
            color="#fff2cc"
            emissive="#ffcf80"
            emissiveIntensity={4}
            toneMapped={false}
          />
        </mesh>
        <LightPool position={[0, TABLE_HEIGHT + 0.012, 0]} radius={0.62} opacity={0.42} />
        <LightPool position={[0, 0.03, 0]} radius={1.55} opacity={0.32} />
        {/* 桌號木牌 */}
        <Sign
          text={`${number}`}
          size={[0.24, 0.24]}
          position={[0, 2.06, 0.31]}
          bg={CLUB.cream}
          fg={CLUB.neonRed}
          glow={0}
        />
      </group>
      {chairs.map((c, i) => (
        <Chair key={i} at={c} face={faces[i]!} />
      ))}
    </group>
  );
}

// ── 櫃台、茶櫃、樓梯、電梯 ─────────────────────────────

function Counter({ onSelect }: { onSelect: (e: ThreeEvent<MouseEvent>) => void }) {
  const [cx, cz] = mid(COUNTER);
  const [cw, cd] = span(COUNTER);
  const [tx, tz] = mid(TEA_CABINET);
  const [tw, td] = span(TEA_CABINET);
  return (
    <group>
      <group onClick={onSelect}>
        <Wood size={[cw, 1.0, cd]} position={[cx, 0.5, cz]} repeat={2} color="#d8b089" />
        {/* 櫃台正面的直條木飾 */}
        {Array.from({ length: 10 }, (_, i) => (
          <Wood
            key={i}
            size={[0.04, 0.82, 0.06]}
            position={[COUNTER.minX - 0.02, 0.48, COUNTER.minZ + 0.3 + i * 0.4]}
            radius={0.01}
            color="#9a6a48"
            castShadow={false}
          />
        ))}
        <Rounded
          size={[cw + 0.14, 0.06, cd + 0.12]}
          position={[cx, 1.03, cz]}
          color={CLUB.cream}
          radius={0.025}
          roughness={0.4}
        />
        {/* 茶具、收銀機、小燈 */}
        <mesh position={[cx, 1.14, -3.4]} castShadow>
          <sphereGeometry args={[0.1, 16, 12]} />
          <meshStandardMaterial color="#8a4a32" roughness={0.25} />
        </mesh>
        {[-3.75, -3.6].map((z) => (
          <mesh key={z} position={[cx - 0.18, 1.1, z]}>
            <cylinderGeometry args={[0.035, 0.028, 0.06, 12]} />
            <meshStandardMaterial color={CLUB.ivory} roughness={0.3} />
          </mesh>
        ))}
        <Rounded
          size={[0.36, 0.22, 0.32]}
          position={[cx, 1.17, -5.6]}
          color="#c9b48f"
          radius={0.03}
          metalness={0}
        />
        <Rounded
          size={[0.3, 0.06, 0.2]}
          position={[cx - 0.05, 1.31, -5.6]}
          color="#3a3a40"
          radius={0.02}
        />
        <group position={[cx, 1.06, -4.6]}>
          <mesh position-y={0.18}>
            <cylinderGeometry args={[0.01, 0.01, 0.36, 6]} />
            <meshStandardMaterial color="#2a2220" />
          </mesh>
          <mesh position-y={0.38}>
            <coneGeometry args={[0.12, 0.12, 14, 1, true]} />
            <meshStandardMaterial
              color={CLUB.green}
              side={2}
              emissive="#ffcf80"
              emissiveIntensity={0.3}
            />
          </mesh>
        </group>
      </group>
      <LightPool position={[cx, 1.065, -4.6]} radius={0.45} opacity={0.5} />
      {/* 老茶櫃：層板 + 茶葉罐 */}
      <Wood size={[tw, 2.5, td]} position={[tx, 1.25, tz]} color="#7a5038" repeat={2} />
      {[0.55, 1.15, 1.75].map((y) => (
        <Wood
          key={y}
          size={[0.36, 0.035, td - 0.1]}
          position={[TEA_CABINET.minX - 0.15, y - 0.17, tz]}
          castShadow={false}
        />
      ))}
      {[0.55, 1.15, 1.75].map((y, row) =>
        [-2.5, -3.4, -4.3, -5.2, -6.1].map((z, i) => (
          <mesh
            key={`${y}${z}`}
            position={[TEA_CABINET.minX - 0.15, y, z + (row % 2) * 0.2]}
            castShadow
          >
            <cylinderGeometry args={[0.11, 0.11, 0.3, 14]} />
            <meshStandardMaterial
              color={[CLUB.neonRed, CLUB.green, CLUB.cream, CLUB.amber, CLUB.navy][(i + row) % 5]}
              roughness={0.45}
            />
          </mesh>
        )),
      )}
      <Sign
        text="茶"
        size={[0.6, 0.6]}
        position={[TEA_CABINET.minX - 0.02, 2.85, tz]}
        rotation={[0, -Math.PI / 2, 0]}
        bg={CLUB.neonRed}
        fg={CLUB.cream}
        glow={0.6}
      />
      {/* 菜單木牌 */}
      <Sign
        text="烏龍 30・咖啡 50・汽水 25"
        size={[2.6, 0.38]}
        position={[HALL.maxX - 0.02, 2.55, -4.5]}
        rotation={[0, -Math.PI / 2, 0]}
        bg={CLUB.wood}
        fg={CLUB.cream}
        glow={0}
      />
    </group>
  );
}

function Stairs({ onSelect }: { onSelect: (e: ThreeEvent<MouseEvent>) => void }) {
  const s = STAIRS;
  const steps = 11;
  const depth = (s.maxZ - s.minZ) / steps;
  const [cx] = mid(s);
  return (
    <group onClick={onSelect}>
      {Array.from({ length: steps }, (_, i) => (
        <group key={i}>
          <Wood
            size={[s.maxX - s.minX, 0.18 * (i + 1), depth]}
            position={[cx, (0.18 * (i + 1)) / 2, s.maxZ - depth * (i + 0.5)]}
            color={i % 2 ? '#ffffff' : '#e6cdb4'}
            radius={0.015}
          />
          <Rounded
            size={[s.maxX - s.minX - 0.3, 0.012, depth - 0.06]}
            position={[cx, 0.18 * (i + 1) + 0.006, s.maxZ - depth * (i + 0.5)]}
            color="#9c463a"
            radius={0.004}
            castShadow={false}
          />
        </group>
      ))}
      {/* 扶手 */}
      {Array.from({ length: 6 }, (_, i) => (
        <Wood
          key={i}
          size={[0.04, 0.9, 0.04]}
          position={[s.maxX - 0.04, 0.45 + 0.18 * (i * 2 + 1), s.maxZ - depth * (i * 2 + 0.5)]}
          radius={0.01}
          castShadow={false}
        />
      ))}
      <Wood
        size={[0.07, 0.07, s.maxZ - s.minZ + 0.6]}
        position={[s.maxX - 0.04, 1.95, (s.minZ + s.maxZ) / 2]}
        rotation={[Math.atan2(2, s.maxZ - s.minZ), 0, 0]}
      />
      <Sign
        text="2F 牌桌館・整修中"
        size={[1.9, 0.4]}
        position={[cx + 0.8, 2.95, HALL.minZ + 0.02]}
        bg={CLUB.cream}
        fg={CLUB.green}
        border={CLUB.green}
        glow={0.2}
      />
    </group>
  );
}

function Elevator({ onSelect }: { onSelect: (e: ThreeEvent<MouseEvent>) => void }) {
  const e = ELEVATOR;
  const [cx, cz] = mid(e);
  const [w, d] = span(e);
  return (
    <group onClick={onSelect}>
      <Rounded size={[w, 3.0, d]} position={[cx, 1.5, cz]} color="#d8cbb4" radius={0.04} />
      <Rounded
        size={[1.9, 2.5, 0.06]}
        position={[cx, 1.25, e.maxZ + 0.01]}
        color="#7a5038"
        radius={0.03}
      />
      {[-0.42, 0.42].map((dx) => (
        <Rounded
          key={dx}
          size={[0.8, 2.3, 0.04]}
          position={[cx + dx, 1.17, e.maxZ + 0.04]}
          color="#b9bec4"
          metalness={1}
          roughness={0.3}
          radius={0.015}
        />
      ))}
      {/* 樓層指示：半圓錶盤 */}
      <mesh position={[cx, 2.72, e.maxZ + 0.05]}>
        <circleGeometry args={[0.24, 24, 0, Math.PI]} />
        <meshStandardMaterial color={CLUB.cream} emissive={CLUB.amber} emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[cx + 0.1, 2.78, e.maxZ + 0.06]} rotation-z={0.6}>
        <boxGeometry args={[0.18, 0.015, 0.01]} />
        <meshStandardMaterial color={CLUB.neonRed} />
      </mesh>
      <Rounded
        size={[0.08, 0.2, 0.03]}
        position={[cx + 1.1, 1.2, e.maxZ + 0.04]}
        color="#c9a14e"
        metalness={1}
        roughness={0.35}
        radius={0.01}
      />
    </group>
  );
}

/** 牆上的生活感：電視、海報、掛鐘、月曆、壁扇、燈籠串 */
function Decor() {
  const quality = useQuality();
  return (
    <group>
      {/* 後牆的映像管電視（架在牆角） */}
      <group position={[-2.3, 2.45, HALL.minZ + 0.32]}>
        <Rounded size={[0.9, 0.66, 0.5]} color="#5a4a40" radius={0.06} />
        <mesh position-z={0.26}>
          <planeGeometry args={[0.7, 0.5]} />
          <meshStandardMaterial
            color="#9fd0d4"
            emissive={CLUB.cyan}
            emissiveIntensity={1.4}
            toneMapped={false}
          />
        </mesh>
        <Wood size={[0.6, 0.04, 0.4]} position={[0, -0.36, -0.05]} castShadow={false} />
      </group>
      <Sign
        text="自摸"
        size={[0.7, 0.95]}
        position={[HALL.minX + 0.02, 2.3, -6.7]}
        rotation={[0, Math.PI / 2, 0]}
        bg={CLUB.neonRed}
        fg={CLUB.cream}
        border={CLUB.amber}
        glow={0.15}
        vertical
      />
      <Sign
        text="清一色"
        size={[0.62, 1.2]}
        position={[HALL.minX + 0.02, 2.2, -2.9]}
        rotation={[0, Math.PI / 2, 0]}
        bg={CLUB.cream}
        fg={CLUB.green}
        border={CLUB.green}
        glow={0.1}
        vertical
      />
      <Sign
        text="平安喜樂"
        size={[1.6, 0.42]}
        position={[-6.4, 2.95, HALL.minZ + 0.02]}
        bg={CLUB.neonRed}
        fg={CLUB.amber}
        glow={0.2}
      />
      {/* 掛鐘 */}
      <group position={[2.4, 2.95, HALL.minZ + 0.04]}>
        <mesh rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.24, 0.24, 0.05, 24]} />
          <meshStandardMaterial color="#7a5038" roughness={0.6} />
        </mesh>
        <mesh position-z={0.027}>
          <circleGeometry args={[0.2, 24]} />
          <meshStandardMaterial color={CLUB.ivory} />
        </mesh>
        <mesh position={[0, 0.06, 0.03]}>
          <boxGeometry args={[0.012, 0.12, 0.005]} />
          <meshBasicMaterial color="#2a2220" />
        </mesh>
        <mesh position={[0.05, 0, 0.03]} rotation-z={Math.PI / 2}>
          <boxGeometry args={[0.012, 0.1, 0.005]} />
          <meshBasicMaterial color="#2a2220" />
        </mesh>
      </group>
      {/* 月曆 */}
      <group position={[6.2, 1.9, HALL.minZ + 0.02]}>
        <mesh>
          <planeGeometry args={[0.45, 0.62]} />
          <meshStandardMaterial color={CLUB.ivory} />
        </mesh>
        <mesh position={[0, 0.19, 0.002]}>
          <planeGeometry args={[0.45, 0.24]} />
          <meshStandardMaterial color={CLUB.neonRed} />
        </mesh>
      </group>
      {/* 走道上方的燈籠串 */}
      <mesh position={[0, 3.2, -6]}>
        <boxGeometry args={[0.012, 0.012, 10]} />
        <meshStandardMaterial color="#2a2220" />
      </mesh>
      {[-2.6, -4.6, -6.6, -8.6, -10.6].map((z) => (
        <Lantern key={z} position={[0, 2.95, z]} scale={0.6} />
      ))}
      {/* 室內盆栽 */}
      {INDOOR_PLANTS.map(([x, z]) => (
        <Plant key={`${x}${z}`} position={[x, 0, z]} scale={1.35} />
      ))}
      {/* 等待區的長椅與茶几 */}
      {quality !== 'low' && (
        <group position={[-7.3, 0, -1.2]}>
          <Wood size={[1.6, 0.08, 0.5]} position={[0, 0.42, 0]} />
          <Rounded
            size={[1.5, 0.08, 0.45]}
            position={[0, 0.48, 0]}
            color="#b8433a"
            radius={0.03}
            roughness={0.9}
          />
          <Wood size={[1.6, 0.4, 0.06]} position={[0, 0.7, -0.22]} />
          {[-0.7, 0.7].map((x) => (
            <Wood key={x} size={[0.06, 0.42, 0.45]} position={[x, 0.21, 0]} castShadow={false} />
          ))}
        </group>
      )}
    </group>
  );
}

/** 1F 麻將館室內（燈一直亮，不隨時段變暗） */
export function MahjongHall({
  onSelect,
  inside,
}: {
  onSelect: (id: string) => void;
  inside: boolean;
}) {
  const quality = useQuality();
  const pick = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(id);
  };
  return (
    <group>
      <Bake deps={[inside, quality]}>
        <Floor />
        <Walls inside={inside} />
        <Foyer />
        {TABLES.map((t, i) => (
          <MahjongTable key={i} at={t} number={i + 1} onSelect={pick(`table-${i + 1}`)} />
        ))}
        <Counter onSelect={pick('a-le')} />
        <Stairs onSelect={pick('stairs')} />
        <Elevator onSelect={pick('elevator')} />
        <Decor />
      </Bake>
      <TileWalls />
      <group position={[A_LE[0], 0, A_LE[1]]} rotation-y={-Math.PI / 2} onClick={pick('a-le')}>
        <Character outfit={A_LE_OUTFIT} />
      </group>
      {/*
        室內燈只在角色進門後才掛上（室外看不到室內，省下每個材質的光源計算）。
        主光是各桌吊燈，低畫質只點前排三盞；另有櫃台燈與入口補光。
      */}
      {inside && (
        <group>
          {/* 室內的暖色環境光：屋頂擋住天光後，暗處也保持看得清楚 */}
          <ambientLight color="#ffd9a8" intensity={0.55} />
          {TABLES.map(([x, z], i) =>
            quality !== 'low' || i < 3 ? (
              <pointLight
                key={i}
                position={[x, 1.9, z]}
                color="#ffc878"
                intensity={3.2}
                distance={4.2}
                decay={1.6}
              />
            ) : null,
          )}
          <pointLight
            position={[(COUNTER.minX + COUNTER.maxX) / 2 - 0.5, 2.2, -4.5]}
            color="#ffd59a"
            intensity={2.6}
            distance={4.5}
            decay={1.6}
          />
          <pointLight
            position={[-1, 3.2, -1.4]}
            color="#ffd59a"
            intensity={2.2}
            distance={8}
            decay={1.4}
          />
        </group>
      )}
    </group>
  );
}
