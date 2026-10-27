'use client';

import { createContext, useContext } from 'react';
import { DoubleSide } from 'three';
import {
  BENCH,
  DOOR,
  HALL,
  MAILBOX,
  PLANTERS,
  STREET_LAMPS,
  VENDING,
  type Box as Area,
} from './layout';
import { CLUB, useSignTexture } from './signs';

/** 霓虹與窗光亮度 0～1，由日夜時鐘提供 */
export const NeonContext = createContext(1);
export const useNeon = () => useContext(NeonContext);

/** 在地面上以 Box 範圍放一個方塊 */
function Block({
  area,
  y0 = 0,
  height,
  color,
  roughness = 0.8,
}: {
  area: Area;
  y0?: number;
  height: number;
  color: string;
  roughness?: number;
}) {
  return (
    <mesh position={[(area.minX + area.maxX) / 2, y0 + height / 2, (area.minZ + area.maxZ) / 2]}>
      <boxGeometry args={[area.maxX - area.minX, height, area.maxZ - area.minZ]} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
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
}: {
  text: string;
  vertical?: boolean;
  size: [number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  bg: string;
  fg: string;
  border?: string;
  /** 夜晚發光強度倍率；0 = 不發光的木招牌 */
  glow?: number;
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
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={size} />
      <meshStandardMaterial
        map={map}
        emissiveMap={map}
        emissive="#ffffff"
        emissiveIntensity={0.08 + neon * 0.9 * glow}
        roughness={0.5}
        side={DoubleSide}
      />
    </mesh>
  );
}

/** 夜晚會亮的窗或燈：白天是淡色，晚上自己發光 */
function Glow({
  size,
  position,
  color,
  base = 0.15,
}: {
  size: [number, number, number];
  position: [number, number, number];
  color: string;
  base?: number;
}) {
  const neon = useNeon();
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={base + neon * 1.1}
        roughness={0.3}
      />
    </mesh>
  );
}

/** 地面：馬路、人行道、對街 */
function Ground() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 3]}>
        <planeGeometry args={[120, 60]} />
        <meshStandardMaterial color={CLUB.sidewalk} roughness={0.95} />
      </mesh>
      {/* 馬路 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 6.8]}>
        <planeGeometry args={[120, 6.6]} />
        <meshStandardMaterial color={CLUB.asphalt} roughness={0.9} />
      </mesh>
      {/* 中線虛線 */}
      {Array.from({ length: 24 }, (_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[-46 + i * 4, 0.005, 6.8]}>
          <planeGeometry args={[2, 0.14]} />
          <meshStandardMaterial color="#e8d9a8" roughness={0.8} />
        </mesh>
      ))}
      {/* 人行道緣石 */}
      <mesh position={[0, 0.06, 3.45]}>
        <boxGeometry args={[120, 0.12, 0.2]} />
        <meshStandardMaterial color="#d8c8ae" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.06, 10.15]}>
        <boxGeometry args={[120, 0.12, 0.2]} />
        <meshStandardMaterial color="#d8c8ae" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** 一間鄰居店面：鐵捲門 + 招牌 + 樓上窗戶 */
function Shophouse({
  x0,
  x1,
  floors,
  wall,
  sign,
  signBg,
  signFg,
  windowColor,
  z = 0,
  back = -12,
  face = 1,
}: {
  x0: number;
  x1: number;
  floors: number;
  wall: string;
  sign?: string;
  signBg?: string;
  signFg?: string;
  windowColor: string;
  z?: number;
  back?: number;
  /** 1 = 店面朝 +z（街這一側）；-1 = 朝 -z（對街） */
  face?: 1 | -1;
}) {
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const h = floors * HALL.height;
  const front = z + 0.02 * face;
  return (
    <group>
      <mesh position={[cx, h / 2, (z + back) / 2]}>
        <boxGeometry args={[w - 0.1, h, Math.abs(z - back)]} />
        <meshStandardMaterial color={wall} roughness={0.85} />
      </mesh>
      {/* 1F 鐵捲門 */}
      <mesh position={[cx, 1.3, front]}>
        <boxGeometry args={[w - 1.2, 2.6, 0.06]} />
        <meshStandardMaterial color="#9a9ea6" metalness={1} roughness={0.5} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[cx, 0.2 + i * 0.32, front + 0.03 * face]}>
          <boxGeometry args={[w - 1.2, 0.03, 0.02]} />
          <meshStandardMaterial color="#6e727a" metalness={1} roughness={0.5} />
        </mesh>
      ))}
      {sign && (
        <Sign
          text={sign}
          size={[Math.min(w - 1, 4), 0.8]}
          position={[cx, 3.05, front + 0.06 * face]}
          rotation={[0, face === 1 ? 0 : Math.PI, 0]}
          bg={signBg ?? CLUB.cream}
          fg={signFg ?? CLUB.navy}
          border={signFg}
          glow={0.6}
        />
      )}
      {/* 樓上窗戶 */}
      {Array.from({ length: floors - 1 }, (_, f) =>
        [-1, 1].map((s) => (
          <Glow
            key={`${f}-${s}`}
            size={[Math.min(1.6, w / 3), 1.3, 0.05]}
            position={[cx + (s * w) / 4, HALL.height * (f + 1) + 1.7, front]}
            color={windowColor}
            base={0.05}
          />
        )),
      )}
    </group>
  );
}

function StreetLamp({ x, z }: { x: number; z: number }) {
  const neon = useNeon();
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={2}>
        <cylinderGeometry args={[0.07, 0.1, 4, 10]} />
        <meshStandardMaterial color={CLUB.green} metalness={1} roughness={0.5} />
      </mesh>
      <mesh position={[0, 4, -0.35]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.05, 0.05, 0.7, 8]} />
        <meshStandardMaterial color={CLUB.green} metalness={1} roughness={0.5} />
      </mesh>
      <mesh position={[0, 3.9, -0.7]}>
        <sphereGeometry args={[0.22, 16, 12]} />
        <meshStandardMaterial
          color="#fff2cc"
          emissive="#ffd890"
          emissiveIntensity={0.1 + neon * 2.2}
        />
      </mesh>
    </group>
  );
}

function Lantern({ position }: { position: [number, number, number] }) {
  const neon = useNeon();
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.24, 16, 12]} />
        <meshStandardMaterial
          color={CLUB.neonRed}
          emissive={CLUB.neonRed}
          emissiveIntensity={0.25 + neon * 1.2}
          roughness={0.6}
        />
      </mesh>
      <mesh position-y={0.26}>
        <cylinderGeometry args={[0.1, 0.1, 0.06, 12]} />
        <meshStandardMaterial color="#2a2220" />
      </mesh>
      <mesh position-y={-0.26}>
        <cylinderGeometry args={[0.1, 0.1, 0.06, 12]} />
        <meshStandardMaterial color="#2a2220" />
      </mesh>
    </group>
  );
}

/** 門上的紅白條紋雨棚 */
function Awning() {
  const stripes = 10;
  const w = 6 / stripes;
  return (
    <group position={[0, 3.5, 0]} rotation-x={0.28}>
      {Array.from({ length: stripes }, (_, i) => (
        <mesh key={i} position={[-3 + w * (i + 0.5), 0, 0.7]}>
          <boxGeometry args={[w, 0.05, 1.4]} />
          <meshStandardMaterial color={i % 2 ? CLUB.cream : CLUB.neonRed} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 暮光遊樂館外觀：1F 正面（門、櫥窗、招牌）＋ 2F 以上的樓體。
 * 角色進到室內時，正面與樓上會藏起來，變成剖面看 1F。
 */
function ClubFacade({ inside }: { inside: boolean }) {
  const floorsAbove = [
    { y: 1, color: CLUB.green, label: '2F 牌桌館' },
    { y: 2, color: CLUB.purple, label: '3F 電玩網咖' },
    { y: 3, color: '#FFE9C7', label: '4F 包廂' },
  ];
  const top = HALL.height * 4;
  return (
    <group visible={!inside}>
      {/* 1F 正面牆（門兩側） */}
      <Block
        area={{ minX: HALL.minX - 0.3, maxX: DOOR.minX, minZ: -0.15, maxZ: 0.15 }}
        height={HALL.height}
        color={CLUB.cream}
      />
      <Block
        area={{ minX: DOOR.maxX, maxX: HALL.maxX + 0.3, minZ: -0.15, maxZ: 0.15 }}
        height={HALL.height}
        color={CLUB.cream}
      />
      {/* 門楣 */}
      <Block
        area={{ minX: DOOR.minX, maxX: DOOR.maxX, minZ: -0.15, maxZ: 0.15 }}
        y0={DOOR.height}
        height={HALL.height - DOOR.height}
        color={CLUB.cream}
      />
      {/* 木門框 */}
      {[DOOR.minX - 0.06, DOOR.maxX + 0.06].map((x) => (
        <mesh key={x} position={[x, DOOR.height / 2, 0.18]}>
          <boxGeometry args={[0.14, DOOR.height, 0.1]} />
          <meshStandardMaterial color={CLUB.wood} roughness={0.75} />
        </mesh>
      ))}
      {/* 暖簾 */}
      {[-0.75, -0.25, 0.25, 0.75].map((x) => (
        <mesh key={x} position={[x, 2.05, 0.2]}>
          <boxGeometry args={[0.46, 0.7, 0.02]} />
          <meshStandardMaterial color={CLUB.navy} roughness={0.9} />
        </mesh>
      ))}
      {/* 櫥窗：看得到裡面的暖光 */}
      {[-5.2, 5.2].map((x) => (
        <group key={x}>
          <Glow size={[4.6, 1.8, 0.04]} position={[x, 1.55, 0.17]} color={CLUB.amber} base={0.35} />
          <mesh position={[x, 1.55, 0.2]}>
            <boxGeometry args={[0.08, 1.8, 0.04]} />
            <meshStandardMaterial color={CLUB.wood} />
          </mesh>
          <mesh position={[x, 0.6, 0.22]}>
            <boxGeometry args={[4.7, 0.1, 0.12]} />
            <meshStandardMaterial color={CLUB.wood} />
          </mesh>
          <mesh position={[x, 2.5, 0.22]}>
            <boxGeometry args={[4.7, 0.1, 0.12]} />
            <meshStandardMaterial color={CLUB.wood} />
          </mesh>
        </group>
      ))}
      {/* 門上木招牌 */}
      <Sign
        text="麻將館"
        size={[2.6, 0.7]}
        position={[0, 2.95, 0.2]}
        bg={CLUB.wood}
        fg={CLUB.cream}
        border={CLUB.cream}
        glow={0.25}
      />
      <Awning />
      <Lantern position={[-1.55, 2.75, 0.5]} />
      <Lantern position={[1.55, 2.75, 0.5]} />

      {/* 2F 以上樓體 */}
      <mesh position={[0, HALL.height + (top - HALL.height) / 2, HALL.minZ / 2]}>
        <boxGeometry args={[18.6, top - HALL.height, -HALL.minZ + 0.3]} />
        <meshStandardMaterial color="#e9cfa8" roughness={0.85} />
      </mesh>
      {/* 樓層之間的線腳 */}
      {[1, 2, 3, 4].map((f) => (
        <mesh key={f} position={[0, HALL.height * f, 0.2]}>
          <boxGeometry args={[18.8, 0.18, 0.3]} />
          <meshStandardMaterial color={CLUB.wood} roughness={0.75} />
        </mesh>
      ))}
      {floorsAbove.map((f) =>
        [-6, -2, 2].map((x) => (
          <Glow
            key={`${f.y}-${x}`}
            size={[2.8, 1.6, 0.06]}
            position={[x, HALL.height * f.y + 1.8, 0.18]}
            color={f.color}
            base={0.12}
          />
        )),
      )}
      {/* 屋頂女兒牆 + 屋頂招牌 */}
      <mesh position={[0, top + 0.4, -0.2]}>
        <boxGeometry args={[18.6, 0.8, 0.3]} />
        <meshStandardMaterial color={CLUB.cream} roughness={0.85} />
      </mesh>
      <Sign
        text="暮光遊樂館"
        size={[9, 1.8]}
        position={[0, top + 1.8, -0.2]}
        bg={CLUB.navy}
        fg={CLUB.neonRed}
        border={CLUB.amber}
      />
      {/* 直立霓虹招牌 */}
      <mesh position={[7.6, 8.2, 0.35]}>
        <boxGeometry args={[1.2, 7.8, 0.5]} />
        <meshStandardMaterial color={CLUB.navy} metalness={1} roughness={0.5} />
      </mesh>
      <Sign
        text="暮光遊樂館"
        vertical
        size={[1, 7.4]}
        position={[7.6, 8.2, 0.61]}
        bg={CLUB.neonRed}
        fg={CLUB.cream}
        border={CLUB.amber}
      />
      {/* 樓層指示 */}
      <Sign
        text="2F 牌桌 · 3F 網咖 · 4F 包廂"
        size={[5.2, 0.55]}
        position={[-3.6, HALL.height + 0.55, 0.21]}
        bg={CLUB.cream}
        fg={CLUB.navy}
        glow={0.4}
      />
    </group>
  );
}

function Vending() {
  const neon = useNeon();
  const a = VENDING;
  return (
    <group position={[(a.minX + a.maxX) / 2, 0, (a.minZ + a.maxZ) / 2]}>
      <mesh position-y={0.9}>
        <boxGeometry args={[a.maxX - a.minX, 1.8, a.maxZ - a.minZ]} />
        <meshStandardMaterial color="#c8d8e8" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.1, (a.maxZ - a.minZ) / 2 + 0.01]}>
        <planeGeometry args={[0.7, 0.9]} />
        <meshStandardMaterial
          color="#eaf6ff"
          emissive="#bfe8ff"
          emissiveIntensity={0.3 + neon * 0.9}
        />
      </mesh>
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
          <mesh position-y={0.55}>
            <boxGeometry args={[0.4, 1.1, 0.4]} />
            <meshStandardMaterial color={c as string} roughness={0.55} />
          </mesh>
          <mesh position-y={1.15} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.2, 0.2, 0.4, 16, 1, false, 0, Math.PI]} />
            <meshStandardMaterial color={c as string} roughness={0.55} />
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
          <Block area={p} height={0.5} color={CLUB.wood} />
          {[-0.35, 0.05, 0.4].map((dx) => (
            <mesh key={dx} position={[(p.minX + p.maxX) / 2 + dx, 0.75, (p.minZ + p.maxZ) / 2]}>
              <sphereGeometry args={[0.3, 12, 10]} />
              <meshStandardMaterial color={CLUB.green} roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
      <Block
        area={{ ...BENCH, minZ: BENCH.minZ + 0.05 }}
        y0={0.38}
        height={0.07}
        color={CLUB.wood}
      />
      {[BENCH.minX + 0.15, BENCH.maxX - 0.15].map((x) => (
        <mesh key={x} position={[x, 0.19, (BENCH.minZ + BENCH.maxZ) / 2]}>
          <boxGeometry args={[0.08, 0.38, 0.38]} />
          <meshStandardMaterial color="#3a3a40" metalness={1} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** 街口：馬路、鄰居店面、對街、路燈、郵筒、販賣機，加上俱樂部外觀 */
export function Street({ inside }: { inside: boolean }) {
  return (
    <group>
      <Ground />
      <ClubFacade inside={inside} />
      {/* 同一側的鄰居 */}
      <Shophouse
        x0={-17}
        x1={-9.3}
        floors={3}
        wall="#d9b99a"
        sign="冰果室"
        signBg="#f6e7c8"
        signFg={CLUB.neonRed}
        windowColor={CLUB.amber}
      />
      <Shophouse
        x0={-26}
        x1={-17}
        floors={2}
        wall="#c8b6a0"
        sign="雜貨店"
        signBg={CLUB.green}
        signFg={CLUB.cream}
        windowColor={CLUB.amber}
      />
      <Shophouse
        x0={9.3}
        x1={16.5}
        floors={3}
        wall="#cdbfae"
        sign="理髮廳"
        signBg={CLUB.navy}
        signFg={CLUB.cream}
        windowColor="#ffe9c7"
      />
      <Shophouse
        x0={16.5}
        x1={26}
        floors={2}
        wall="#d7c0a0"
        sign="茶行"
        signBg={CLUB.wood}
        signFg={CLUB.cream}
        windowColor={CLUB.amber}
      />
      {/* 對街 */}
      <Shophouse
        x0={-24}
        x1={-12}
        floors={3}
        wall="#bfa98f"
        sign="照相館"
        signBg={CLUB.cream}
        signFg={CLUB.navy}
        windowColor={CLUB.amber}
        z={14}
        back={22}
        face={-1}
      />
      <Shophouse
        x0={-12}
        x1={-2}
        floors={4}
        wall="#cfb79b"
        sign="唱片行"
        signBg={CLUB.purple}
        signFg={CLUB.cream}
        windowColor={CLUB.cyan}
        z={14}
        back={22}
        face={-1}
      />
      <Shophouse
        x0={-2}
        x1={9}
        floors={2}
        wall="#d8c3a5"
        sign="麵店"
        signBg={CLUB.neonRed}
        signFg={CLUB.cream}
        windowColor={CLUB.amber}
        z={14}
        back={22}
        face={-1}
      />
      <Shophouse
        x0={9}
        x1={24}
        floors={3}
        wall="#c4ae94"
        sign="五金行"
        signBg={CLUB.green}
        signFg={CLUB.cream}
        windowColor="#ffe9c7"
        z={14}
        back={22}
        face={-1}
      />
      {STREET_LAMPS.map(([x, z]) => (
        <StreetLamp key={x} x={x} z={z} />
      ))}
      <Vending />
      <Mailboxes />
      <Planters />
    </group>
  );
}
