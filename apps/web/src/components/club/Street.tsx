'use client';

import { useMemo } from 'react';
import { CatmullRomCurve3, Vector3 } from 'three';
import {
  BENCH,
  DOOR,
  HALL,
  MAILBOX,
  PLANTERS,
  POLES,
  SCOOTERS,
  STREET_LAMPS,
  VENDING,
  type Box as Area,
} from './layout';
import { Bake } from './Bake';
import { Glow, Lantern, Plant, Rounded, Sign, Wood, useNeon, useQuality } from './props';
import { CLUB } from './signs';
import { asphalt, cityWindows, facadeTile, pavers, shutter, tiled } from './textures';

type V3 = [number, number, number];
const FH = HALL.height;

// ── 地面 ───────────────────────────────────────────────

function Ground() {
  const walk = useMemo(() => tiled(pavers(), 60, 4), []);
  const road = useMemo(() => tiled(asphalt(), 24, 2), []);
  return (
    <group>
      {/* 人行道（騎樓前） */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 1.75]} receiveShadow>
        <planeGeometry args={[120, 3.5]} />
        <meshStandardMaterial map={walk} roughness={0.85} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[160, 120]} />
        <meshStandardMaterial color="#6b6058" roughness={0.95} />
      </mesh>
      {/* 馬路 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.001, 7.1]} receiveShadow>
        <planeGeometry args={[120, 7.2]} />
        <meshStandardMaterial map={road} roughness={0.7} />
      </mesh>
      {Array.from({ length: 24 }, (_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[-46 + i * 4, 0.006, 7.1]}>
          <planeGeometry args={[2, 0.14]} />
          <meshStandardMaterial color="#e8d9a8" roughness={0.8} />
        </mesh>
      ))}
      {/* 斑馬線 */}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[-13, 0.006, 4.1 + i * 0.85]}>
          <planeGeometry args={[2.6, 0.45]} />
          <meshStandardMaterial color="#efe6d2" roughness={0.8} />
        </mesh>
      ))}
      {/* 人孔蓋 */}
      <mesh rotation-x={-Math.PI / 2} position={[3.5, 0.007, 5.6]}>
        <circleGeometry args={[0.38, 24]} />
        <meshStandardMaterial color="#3a3640" metalness={1} roughness={0.5} />
      </mesh>
      {/* 緣石 */}
      <Rounded
        size={[120, 0.14, 0.24]}
        position={[0, 0.07, 3.5]}
        color="#cfc2ad"
        radius={0.03}
        castShadow={false}
      />
      <Rounded
        size={[120, 0.14, 0.24]}
        position={[0, 0.07, 10.8]}
        color="#cfc2ad"
        radius={0.03}
        castShadow={false}
      />
    </group>
  );
}

// ── 共用小物 ───────────────────────────────────────────

/** 窗型冷氣 */
function AirCon({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <Rounded size={[0.75, 0.48, 0.5]} color="#e2ddd2" radius={0.05} />
      {[-0.12, -0.04, 0.04, 0.12].map((y) => (
        <mesh key={y} position={[0.06, y, 0.252]}>
          <boxGeometry args={[0.5, 0.02, 0.01]} />
          <meshStandardMaterial color="#9a958c" />
        </mesh>
      ))}
      <Rounded
        size={[0.7, 0.04, 0.5]}
        position={[0, -0.27, 0.05]}
        color="#4a4650"
        radius={0.01}
        metalness={1}
        roughness={0.5}
      />
    </group>
  );
}

/** 鐵窗：外框 + 直條 + 花紋橫條，罩在窗戶外 */
function Grille({ size, position }: { size: [number, number]; position: V3 }) {
  const bars = Math.floor(size[0] / 0.16);
  return (
    <group position={position}>
      {[-size[1] / 2, size[1] / 2, 0].map((y) => (
        <mesh key={y} position-y={y}>
          <boxGeometry args={[size[0], 0.03, 0.03]} />
          <meshStandardMaterial color={CLUB.green} metalness={1} roughness={0.5} />
        </mesh>
      ))}
      {Array.from({ length: bars + 1 }, (_, i) => (
        <mesh key={i} position-x={-size[0] / 2 + (i * size[0]) / bars}>
          <boxGeometry args={[0.022, size[1], 0.022]} />
          <meshStandardMaterial color={CLUB.green} metalness={1} roughness={0.5} />
        </mesh>
      ))}
      <Rounded
        size={[size[0] + 0.1, 0.05, 0.35]}
        position={[0, -size[1] / 2, 0.12]}
        color={CLUB.green}
        radius={0.01}
        metalness={1}
        roughness={0.5}
        castShadow={false}
      />
    </group>
  );
}

/** 一扇有框的窗：夜晚透出房間的燈 */
function Window({
  position,
  size,
  light,
  grille = false,
  plants = false,
}: {
  position: V3;
  size: [number, number];
  light: string;
  grille?: boolean;
  plants?: boolean;
}) {
  return (
    <group position={position}>
      <Rounded
        size={[size[0] + 0.16, size[1] + 0.16, 0.1]}
        position={[0, 0, -0.02]}
        color="#f3e6cf"
        radius={0.03}
        castShadow={false}
      />
      <Glow
        size={[size[0], size[1], 0.04]}
        position={[0, 0, 0.02]}
        color={light}
        base={0.06}
        strength={0.65}
      />
      <mesh position-z={0.05}>
        <boxGeometry args={[0.05, size[1], 0.02]} />
        <meshStandardMaterial color="#6a4630" />
      </mesh>
      {grille && <Grille size={[size[0] + 0.1, size[1] + 0.1]} position={[0, 0, 0.18]} />}
      {plants &&
        [-0.35, 0.05, 0.4].map((x) => (
          <Plant
            key={x}
            position={[x * size[0], -size[1] / 2 + 0.02, 0.24]}
            scale={0.42}
            pot={x > 0 ? '#c46a48' : '#3f6f8a'}
          />
        ))}
    </group>
  );
}

// ── 暮光遊樂館外觀 ─────────────────────────────────────

/** 門上的紅白條紋雨棚 */
function Awning({ width, position }: { width: number; position: V3 }) {
  const stripes = Math.round(width / 0.6);
  const w = width / stripes;
  return (
    <group position={position} rotation-x={0.32}>
      {Array.from({ length: stripes }, (_, i) => (
        <Rounded
          key={i}
          size={[w + 0.002, 0.05, 1.3]}
          position={[-width / 2 + w * (i + 0.5), 0, 0.65]}
          color={i % 2 ? CLUB.cream : CLUB.neonRed}
          radius={0.02}
          roughness={0.9}
        />
      ))}
      {Array.from({ length: stripes }, (_, i) => (
        <mesh key={`v${i}`} position={[-width / 2 + w * (i + 0.5), -0.12, 1.3]} rotation-x={-0.32}>
          <cylinderGeometry args={[w / 2, w / 2, 0.22, 12, 1, true, 0, Math.PI]} />
          <meshStandardMaterial
            color={i % 2 ? CLUB.cream : CLUB.neonRed}
            roughness={0.9}
            side={2}
          />
        </mesh>
      ))}
    </group>
  );
}

/** 燈箱招牌外圍一圈燈泡 */
function BulbFrame({ size, position }: { size: [number, number]; position: V3 }) {
  const neon = useNeon();
  const bulbs = useMemo(() => {
    const out: [number, number][] = [];
    const step = 0.28;
    for (let x = -size[0] / 2; x <= size[0] / 2 + 1e-3; x += step) {
      out.push([x, size[1] / 2], [x, -size[1] / 2]);
    }
    for (let y = -size[1] / 2 + step; y < size[1] / 2 - 1e-3; y += step) {
      out.push([-size[0] / 2, y], [size[0] / 2, y]);
    }
    return out;
  }, [size]);
  return (
    <group position={position}>
      {bulbs.map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0]}>
          <sphereGeometry args={[0.045, 8, 6]} />
          <meshStandardMaterial
            color="#fff2cc"
            emissive="#ffcf70"
            emissiveIntensity={0.3 + neon * 3}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function ClubFacade({ inside }: { inside: boolean }) {
  const quality = useQuality();
  const wall = useMemo(() => tiled(facadeTile('#ead2ad', 3), 6, 4), []);
  const top = FH * 4;
  const floors = [
    { f: 1, light: '#ffc27a', label: '2F 牌桌館', color: CLUB.green },
    { f: 2, light: '#b98cf0', label: '3F 電玩網咖', color: CLUB.purple },
    { f: 3, light: '#ffd8a0', label: '4F 包廂', color: CLUB.wood },
  ];
  return (
    <group visible={!inside}>
      {/* 1F 正面：門兩側是大片櫥窗，木框分格，看得到裡面的暖光 */}
      {[
        [HALL.minX - 0.3, DOOR.minX],
        [DOOR.maxX, HALL.maxX + 0.3],
      ].map(([a, b]) => (
        <group key={a}>
          <Wood
            size={[b! - a!, 0.5, 0.32]}
            position={[(a! + b!) / 2, 0.25, 0]}
            repeat={3}
            color="#c79a72"
          />
          <Wood
            size={[b! - a!, 0.9, 0.32]}
            position={[(a! + b!) / 2, FH - 0.45, 0]}
            repeat={3}
            color="#c79a72"
          />
          <Glow
            size={[b! - a! - 0.2, 2.1, 0.04]}
            position={[(a! + b!) / 2, 1.55, 0.02]}
            color="#ffb466"
            base={0.2}
            strength={0.32}
          />
          {Array.from({ length: 5 }, (_, i) => (
            <Wood
              key={i}
              size={[0.08, 2.2, 0.12]}
              position={[a! + ((b! - a!) * (i + 0.5)) / 5, 1.6, 0.1]}
              radius={0.02}
              castShadow={false}
            />
          ))}
          <Wood
            size={[b! - a!, 0.08, 0.14]}
            position={[(a! + b!) / 2, 1.9, 0.1]}
            castShadow={false}
          />
        </group>
      ))}
      {/* 門框、門楣、暖簾 */}
      <Wood size={[2.3, 0.2, 0.4]} position={[0, DOOR.height + 0.1, 0.05]} />
      <Wood
        size={[2.3, FH - DOOR.height - 0.2, 0.3]}
        position={[0, (FH + DOOR.height + 0.2) / 2, 0]}
        color="#c79a72"
      />
      {[DOOR.minX - 0.07, DOOR.maxX + 0.07].map((x) => (
        <Wood key={x} size={[0.16, DOOR.height, 0.4]} position={[x, DOOR.height / 2, 0.05]} />
      ))}
      {[-0.75, -0.25, 0.25, 0.75].map((x, i) => (
        <Rounded
          key={x}
          size={[0.46, 0.72, 0.02]}
          position={[x, 2.03, 0.22]}
          color={i % 2 ? CLUB.navy : '#2c3f5c'}
          radius={0.01}
          roughness={0.95}
        />
      ))}
      <Sign
        text="麻將"
        size={[0.6, 0.3]}
        position={[0, 2.12, 0.24]}
        bg="#2c3f5c"
        fg={CLUB.cream}
        glow={0}
      />
      {/* 主燈箱招牌 + 燈泡框 + 雨棚 + 燈籠 */}
      <Sign
        text="暮光遊樂館"
        size={[7.2, 1.5]}
        position={[0, 4.55, 0.6]}
        bg={CLUB.cream}
        fg={CLUB.neonRed}
        border={CLUB.neonRed}
        depth={0.35}
        frame={CLUB.neonRed}
        glow={0.8}
      />
      <BulbFrame size={[7.5, 1.8]} position={[0, 4.55, 0.65]} />
      <Sign
        text="麻將・牌桌・電玩・包廂"
        size={[4.6, 0.5]}
        position={[0, 3.45, 0.42]}
        bg={CLUB.navy}
        fg={CLUB.amber}
        depth={0.16}
        frame={CLUB.wood}
        glow={0.7}
      />
      <Awning width={7} position={[0, 3.05, 0.12]} />
      {[-3.2, -1.6, 1.6, 3.2].map((x) => (
        <Lantern key={x} position={[x, 2.75, 1.25]} scale={0.85} />
      ))}
      {/* 騎樓下的暖光：櫥窗與燈籠照亮人行道（低畫質省略） */}
      {quality !== 'low' && (
        <>
          <pointLight
            position={[-4.5, 2.4, 1.6]}
            color="#ffb870"
            intensity={4}
            distance={7}
            decay={1.5}
          />
          <pointLight
            position={[4.5, 2.4, 1.6]}
            color="#ffb870"
            intensity={4}
            distance={7}
            decay={1.5}
          />
          <pointLight
            position={[0, 4.2, 2.2]}
            color="#ffd59a"
            intensity={3}
            distance={6}
            decay={1.5}
          />
        </>
      )}

      {/* 2F 以上樓體 */}
      <mesh position={[0, FH + (top - FH) / 2, HALL.minZ / 2]} castShadow receiveShadow>
        <boxGeometry args={[18.6, top - FH, -HALL.minZ + 0.3]} />
        <meshStandardMaterial map={wall} roughness={0.85} />
      </mesh>
      {[1, 2, 3, 4].map((f) => (
        <Rounded
          key={f}
          size={[18.9, 0.2, 0.4]}
          position={[0, FH * f, 0.2]}
          color="#c79a72"
          radius={0.04}
          castShadow={false}
        />
      ))}
      {floors.map(({ f, light }) =>
        [-6.6, -3.2, 3.2, 6.2].map((x, i) => (
          <Window
            key={`${f}${x}`}
            position={[x, FH * f + 1.75, 0.16]}
            size={[2.2, 1.5]}
            light={light}
            grille={f === 1 || (f === 3 && i % 2 === 0)}
            plants={f === 1 && i % 2 === 1 && quality !== 'low'}
          />
        )),
      )}
      {quality !== 'low' &&
        [
          [-4.9, FH + 1.2],
          [4.7, FH * 2 + 1.2],
          [-1.6, FH * 3 + 1.0],
          [1.7, FH * 2 + 1.1],
        ].map(([x, y]) => <AirCon key={`${x}${y}`} position={[x!, y!, 0.42]} />)}
      {/* 各樓層招牌 */}
      <Sign
        text="牌桌館"
        size={[2.2, 0.62]}
        position={[0, FH + 2.6, 0.32]}
        bg={CLUB.green}
        fg={CLUB.cream}
        depth={0.12}
        frame={CLUB.wood}
        glow={0.7}
      />
      <Sign
        text="電玩網咖"
        size={[2.6, 0.62]}
        position={[0, FH * 2 + 2.6, 0.32]}
        bg={CLUB.purple}
        fg="#f5e9ff"
        depth={0.12}
        frame={CLUB.navy}
        glow={1}
      />
      <Sign
        text="包廂"
        size={[1.6, 0.62]}
        position={[0, FH * 3 + 2.6, 0.32]}
        bg={CLUB.wood}
        fg={CLUB.cream}
        depth={0.12}
        frame={CLUB.woodDark}
        glow={0.5}
      />
      {/* 直立霓虹招牌 */}
      <Rounded size={[1.3, 8.4, 0.5]} position={[8.1, 9, 0.7]} color={CLUB.navy} radius={0.06} />
      <Sign
        text="暮光遊樂館"
        vertical
        size={[1.05, 7.9]}
        position={[8.1, 9, 0.96]}
        bg={CLUB.neonRed}
        fg={CLUB.cream}
        border={CLUB.amber}
        glow={1}
      />
      <Sign
        text="麻將"
        vertical
        size={[0.8, 1.9]}
        position={[-8.4, 6.2, 0.55]}
        bg={CLUB.cream}
        fg={CLUB.neonRed}
        border={CLUB.neonRed}
        depth={0.3}
        frame={CLUB.neonRed}
        glow={0.8}
      />
      {/* 屋頂：女兒牆、水塔、屋頂招牌 */}
      <Rounded
        size={[18.8, 0.8, 0.35]}
        position={[0, top + 0.4, -0.1]}
        color={CLUB.cream}
        radius={0.05}
      />
      <Sign
        text="暮光遊樂館"
        size={[8, 1.6]}
        position={[-2.5, top + 1.9, -0.3]}
        bg={CLUB.navy}
        fg={CLUB.neonRed}
        border={CLUB.amber}
        depth={0.25}
        frame="#3a3a40"
        glow={1}
      />
      <group position={[5.6, top, -4]}>
        <mesh position-y={1.6} castShadow>
          <cylinderGeometry args={[0.9, 0.9, 1.6, 20]} />
          <meshStandardMaterial color="#d8d4cb" roughness={0.6} />
        </mesh>
        {[-0.6, 0.6].map((x) => (
          <mesh key={x} position={[x, 0.4, 0]}>
            <boxGeometry args={[0.08, 0.8, 0.08]} />
            <meshStandardMaterial color="#5a5a60" metalness={1} roughness={0.5} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ── 鄰居店面 ───────────────────────────────────────────

interface ShopSpec {
  x0: number;
  x1: number;
  floors: number;
  wall: string;
  sign: string;
  signBg: string;
  signFg: string;
  /** 直式招牌（掛在樓體一側） */
  vertical?: string;
  /** 1F 還在營業（櫥窗亮著），否則拉下鐵捲門 */
  open?: boolean;
  window: string;
  awning?: string;
}

function Shophouse({ s }: { s: ShopSpec }) {
  const quality = useQuality();
  const w = s.x1 - s.x0;
  const cx = (s.x0 + s.x1) / 2;
  const h = s.floors * FH;
  const tex = useMemo(
    () => tiled(facadeTile(s.wall, Math.round(s.x0)), w / 3, h / 3),
    [s.wall, s.x0, w, h],
  );
  const shut = useMemo(() => tiled(shutter(), 2, 2), []);
  return (
    <group>
      <mesh position={[cx, h / 2, -6]} castShadow receiveShadow>
        <boxGeometry args={[w - 0.1, h, 12]} />
        <meshStandardMaterial map={tex} roughness={0.85} />
      </mesh>
      {s.open ? (
        <Glow
          size={[w - 1.2, 2.3, 0.04]}
          position={[cx, 1.3, 0.02]}
          color="#ffb466"
          base={0.2}
          strength={0.32}
        />
      ) : (
        <mesh position={[cx, 1.3, 0.03]}>
          <boxGeometry args={[w - 1.2, 2.6, 0.05]} />
          <meshStandardMaterial map={shut} metalness={1} roughness={0.5} />
        </mesh>
      )}
      <Sign
        text={s.sign}
        size={[Math.min(w - 1, 4.4), 0.8]}
        position={[cx, 3.1, 0.28]}
        bg={s.signBg}
        fg={s.signFg}
        border={s.signFg}
        depth={0.2}
        frame={s.signBg}
        glow={0.8}
      />
      {s.awning && (
        <Rounded
          size={[w - 0.6, 0.06, 1.2]}
          position={[cx, 2.6, 0.55]}
          rotation={[0.25, 0, 0]}
          color={s.awning}
          radius={0.02}
        />
      )}
      {s.vertical && (
        <Sign
          text={s.vertical}
          vertical
          size={[0.8, 0.85 * [...s.vertical].length + 0.4]}
          position={[s.x1 - 0.7, FH + 0.6 + (0.85 * [...s.vertical].length) / 2, 0.55]}
          bg={s.signFg}
          fg={s.signBg}
          border={s.signBg}
          depth={0.25}
          frame={s.signBg}
          glow={0.9}
        />
      )}
      {Array.from({ length: s.floors - 1 }, (_, f) =>
        [-1, 1].map((side) => (
          <Window
            key={`${f}${side}`}
            position={[cx + (side * w) / 4.2, FH * (f + 1) + 1.7, 0.08]}
            size={[Math.min(1.6, w / 3), 1.3]}
            light={s.window}
            grille={(f + side) % 2 === 0}
            plants={quality !== 'low' && f === 0 && side === 1}
          />
        )),
      )}
      {quality !== 'low' && <AirCon position={[cx - w / 4.2, FH * (s.floors - 1) + 0.75, 0.35]} />}
      {s.open && (
        <>
          <Lantern position={[s.x0 + 0.8, 2.4, 1.2]} scale={0.7} color={CLUB.amber} />
          <Lantern position={[s.x1 - 0.8, 2.4, 1.2]} scale={0.7} color={CLUB.amber} />
        </>
      )}
    </group>
  );
}

const SHOPS: ShopSpec[] = [
  {
    x0: -17,
    x1: -9.3,
    floors: 3,
    wall: '#dcbf9c',
    sign: '冰果室',
    signBg: '#f6e7c8',
    signFg: CLUB.neonRed,
    vertical: '冰果',
    open: true,
    window: CLUB.amber,
    awning: '#5c9a8a',
  },
  {
    x0: -26,
    x1: -17,
    floors: 2,
    wall: '#c8b6a0',
    sign: '雜貨店',
    signBg: CLUB.green,
    signFg: CLUB.cream,
    window: CLUB.amber,
  },
  {
    x0: 9.3,
    x1: 16.5,
    floors: 3,
    wall: '#cdbfae',
    sign: '熱炒小吃',
    signBg: CLUB.amber,
    signFg: CLUB.neonRed,
    vertical: '熱炒',
    open: true,
    window: '#ffe9c7',
    awning: CLUB.neonRed,
  },
  {
    x0: 16.5,
    x1: 26,
    floors: 4,
    wall: '#d7c0a0',
    sign: '茶行',
    signBg: CLUB.wood,
    signFg: CLUB.cream,
    vertical: '茶',
    window: CLUB.amber,
  },
];

// ── 街道物件 ───────────────────────────────────────────

function StreetLamp({ x, z }: { x: number; z: number }) {
  const neon = useNeon();
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={2.1} castShadow>
        <cylinderGeometry args={[0.06, 0.1, 4.2, 12]} />
        <meshStandardMaterial color={CLUB.green} metalness={1} roughness={0.45} />
      </mesh>
      <mesh position={[0, 4.15, -0.32]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.3, 0.035, 8, 16, Math.PI]} />
        <meshStandardMaterial color={CLUB.green} metalness={1} roughness={0.45} />
      </mesh>
      <mesh position={[0, 3.85, -0.62]}>
        <sphereGeometry args={[0.2, 16, 12]} />
        <meshStandardMaterial
          color="#fff2cc"
          emissive="#ffd890"
          emissiveIntensity={0.1 + neon * 3}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function Scooter({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <group position={[x, 0, z]} rotation-y={0.08}>
      {[-0.55, 0.55].map((dz) => (
        <mesh key={dz} position={[0, 0.2, dz]} rotation-z={Math.PI / 2} castShadow>
          <torusGeometry args={[0.15, 0.06, 10, 18]} />
          <meshStandardMaterial color="#1f1c22" roughness={0.8} />
        </mesh>
      ))}
      <Rounded
        size={[0.36, 0.3, 1.0]}
        position={[0, 0.42, 0.05]}
        color={color}
        radius={0.12}
        roughness={0.4}
      />
      <Rounded size={[0.3, 0.08, 0.55]} position={[0, 0.62, 0.15]} color="#2a2228" radius={0.04} />
      <Rounded
        size={[0.32, 0.7, 0.18]}
        position={[0, 0.7, -0.5]}
        rotation={[-0.25, 0, 0]}
        color={color}
        radius={0.08}
        roughness={0.4}
      />
      <mesh position={[0, 1.08, -0.62]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.025, 0.025, 0.62, 8]} />
        <meshStandardMaterial color="#3a3a40" metalness={1} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.98, -0.7]}>
        <sphereGeometry args={[0.07, 12, 10]} />
        <meshStandardMaterial color="#fff6dc" emissive="#fff0c0" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

/** 電線桿 + 垂下來的電線（台灣街景的天空線） */
function PowerLines() {
  const cables = useMemo(() => {
    const [a, b] = POLES;
    const lines: Vector3[][] = [];
    for (const [i, y] of [7.6, 7.2, 6.8].entries()) {
      const p0 = new Vector3(a![0], y, a![1]);
      const p1 = new Vector3(b![0], y - 0.1 * i, b![1]);
      const midPt = p0.clone().lerp(p1, 0.5);
      midPt.y -= 0.9 + i * 0.2;
      lines.push([p0, midPt, p1]);
    }
    // 拉到俱樂部牆上的電線
    lines.push([
      new Vector3(a![0], 7, a![1]),
      new Vector3(-9.6, 6.2, 1.8),
      new Vector3(-8.8, 6.6, 0.3),
    ]);
    return lines.map((pts) => new CatmullRomCurve3(pts));
  }, []);
  return (
    <group>
      {POLES.map(([x, z]) => (
        <group key={x} position={[x, 0, z]}>
          <mesh position-y={4} castShadow>
            <cylinderGeometry args={[0.12, 0.17, 8, 12]} />
            <meshStandardMaterial color="#b4ada2" roughness={0.8} />
          </mesh>
          <mesh position-y={7.4}>
            <boxGeometry args={[1.4, 0.1, 0.1]} />
            <meshStandardMaterial color="#5a5a60" metalness={1} roughness={0.5} />
          </mesh>
          <mesh position={[0.3, 6.6, 0]}>
            <cylinderGeometry args={[0.22, 0.22, 0.6, 12]} />
            <meshStandardMaterial color="#8a8f96" metalness={1} roughness={0.5} />
          </mesh>
        </group>
      ))}
      {cables.map((c, i) => (
        <mesh key={i}>
          <tubeGeometry args={[c, 32, 0.015, 4, false]} />
          <meshStandardMaterial color="#1f1c22" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/** 騎樓前橫掛的一串燈籠 */
function LanternString() {
  const curve = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(-8.5, 3.6, 0.6),
        new Vector3(-4, 3.2, 1.6),
        new Vector3(0, 3.35, 1.9),
        new Vector3(4, 3.2, 1.6),
        new Vector3(8.5, 3.6, 0.6),
      ]),
    [],
  );
  const points = useMemo(() => curve.getSpacedPoints(16).slice(1, -1), [curve]);
  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 48, 0.012, 4, false]} />
        <meshStandardMaterial color="#1f1c22" />
      </mesh>
      {points.map((p, i) =>
        Math.abs(p.x) < 1.4 ? null : (
          <Lantern
            key={i}
            position={[p.x, p.y - 0.28, p.z]}
            scale={0.5}
            color={i % 3 ? CLUB.neonRed : CLUB.amber}
            always={0.35}
          />
        ),
      )}
    </group>
  );
}

function Vending() {
  const neon = useNeon();
  const a = VENDING;
  return (
    <group position={[(a.minX + a.maxX) / 2, 0, (a.minZ + a.maxZ) / 2]}>
      <Rounded
        size={[a.maxX - a.minX, 1.85, a.maxZ - a.minZ]}
        position={[0, 0.925, 0]}
        color="#d84b45"
        radius={0.05}
        roughness={0.45}
      />
      <mesh position={[-0.08, 1.15, (a.maxZ - a.minZ) / 2 + 0.01]}>
        <planeGeometry args={[0.6, 0.95]} />
        <meshStandardMaterial
          color="#eaf6ff"
          emissive="#d8f0ff"
          emissiveIntensity={0.5 + neon * 1.2}
          toneMapped={false}
        />
      </mesh>
      {[0.95, 1.2, 1.45].map((y) =>
        [-0.28, -0.14, 0, 0.14].map((x, i) => (
          <mesh key={`${y}${x}`} position={[x - 0.02, y, (a.maxZ - a.minZ) / 2 + 0.03]}>
            <cylinderGeometry args={[0.035, 0.035, 0.14, 10]} />
            <meshStandardMaterial color={[CLUB.neonRed, CLUB.amber, CLUB.cyan, CLUB.green][i]} />
          </mesh>
        )),
      )}
      <Rounded
        size={[0.6, 0.18, 0.05]}
        position={[-0.08, 0.35, (a.maxZ - a.minZ) / 2 + 0.02]}
        color="#2a2228"
        radius={0.02}
      />
    </group>
  );
}

function Mailboxes() {
  return (
    <group position={[MAILBOX[0], 0, MAILBOX[1]]}>
      {[
        [-0.22, CLUB.neonRed],
        [0.22, CLUB.green],
      ].map(([x, c]) => (
        <group key={x as number} position-x={x as number}>
          <Rounded
            size={[0.4, 1.0, 0.4]}
            position={[0, 0.5, 0]}
            color={c as string}
            radius={0.05}
            roughness={0.5}
          />
          <mesh position-y={1.0} rotation-z={Math.PI / 2} castShadow>
            <cylinderGeometry args={[0.2, 0.2, 0.4, 18, 1, false, 0, Math.PI]} />
            <meshStandardMaterial color={c as string} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.75, 0.205]}>
            <boxGeometry args={[0.24, 0.04, 0.01]} />
            <meshStandardMaterial color="#1f1c22" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Planters() {
  return (
    <group>
      {PLANTERS.map((p, i) => (
        <group key={i}>
          <Wood
            size={[p.maxX - p.minX, 0.5, p.maxZ - p.minZ]}
            position={[(p.minX + p.maxX) / 2, 0.25, (p.minZ + p.maxZ) / 2]}
            repeat={2}
          />
          {[-0.35, 0.05, 0.4].map((dx) => (
            <Plant
              key={dx}
              position={[(p.minX + p.maxX) / 2 + dx, 0.12, (p.minZ + p.maxZ) / 2]}
              scale={0.85}
            />
          ))}
        </group>
      ))}
      <Wood
        size={[BENCH.maxX - BENCH.minX, 0.07, BENCH.maxZ - BENCH.minZ]}
        position={[(BENCH.minX + BENCH.maxX) / 2, 0.42, (BENCH.minZ + BENCH.maxZ) / 2]}
      />
      {[BENCH.minX + 0.15, BENCH.maxX - 0.15].map((x) => (
        <Rounded
          key={x}
          size={[0.08, 0.4, 0.4]}
          position={[x, 0.2, (BENCH.minZ + BENCH.maxZ) / 2]}
          color="#3a3a40"
          radius={0.02}
          metalness={1}
          roughness={0.5}
        />
      ))}
    </group>
  );
}

/** 遠景：俱樂部後方的城市剪影，夜晚窗戶亮起（backdrop，不參與碰撞） */
function Skyline() {
  const neon = useNeon();
  const windows = useMemo(() => cityWindows(), []);
  const blocks = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const x = -42 + i * 6.4 + ((i * 37) % 5);
        const h = 14 + ((i * 53) % 17);
        return { x, h, w: 5 + ((i * 19) % 3), z: -26 - ((i * 7) % 8) };
      }),
    [],
  );
  return (
    <group>
      {blocks.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]}>
          <boxGeometry args={[b.w, b.h, 5]} />
          <meshStandardMaterial
            color={i % 2 ? '#5a5f78' : '#4c5068'}
            emissiveMap={windows}
            emissive="#ffffff"
            emissiveIntensity={0.05 + neon * 0.9}
            roughness={0.9}
          />
        </mesh>
      ))}
    </group>
  );
}

/** 街口：馬路、鄰居店面、遠景、路燈、電線、機車、郵筒、販賣機，加上俱樂部外觀 */
export function Street({ inside }: { inside: boolean }) {
  const quality = useQuality();
  return (
    <Bake deps={[inside, quality]}>
      <Ground />
      <ClubFacade inside={inside} />
      {SHOPS.map((s) => (
        <Shophouse key={s.x0} s={s} />
      ))}
      <Skyline />
      {STREET_LAMPS.map(([x, z]) => (
        <StreetLamp key={x} x={x} z={z} />
      ))}
      {!inside && <LanternString />}
      {quality !== 'low' && <PowerLines />}
      {SCOOTERS.map(([x, z], i) => (
        <Scooter key={x} x={x} z={z} color={[CLUB.cyan, CLUB.cream, CLUB.neonRed][i % 3]!} />
      ))}
      <Vending />
      <Mailboxes />
      <Planters />
    </Bake>
  );
}
