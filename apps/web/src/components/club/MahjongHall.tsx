'use client';

import type { ThreeEvent } from '@react-three/fiber';
import { Character, A_LE_OUTFIT } from './Character';
import {
  A_LE,
  CHAIR_SIZE,
  COUNTER,
  ELEVATOR,
  HALL,
  STAIRS,
  TABLE_HEIGHT,
  TABLE_SIZE,
  TABLES,
  TEA_CABINET,
  chairsOf,
  type Vec2,
} from './layout';
import { CLUB } from './signs';
import { Sign, useNeon } from './Street';

const WAINSCOT = 1.1;

function Walls() {
  const d = -HALL.minZ;
  const w = HALL.maxX - HALL.minX;
  const h = HALL.height;
  const sides: { pos: [number, number, number]; size: [number, number, number] }[] = [
    { pos: [HALL.minX - 0.15, 0, -d / 2], size: [0.3, 1, d] },
    { pos: [HALL.maxX + 0.15, 0, -d / 2], size: [0.3, 1, d] },
    { pos: [0, 0, HALL.minZ - 0.15], size: [w + 0.6, 1, 0.3] },
  ];
  return (
    <group>
      {sides.map((s, i) => (
        <group key={i}>
          {/* 下半截：復古綠磁磚 */}
          <mesh position={[s.pos[0], WAINSCOT / 2, s.pos[2]]}>
            <boxGeometry args={[s.size[0], WAINSCOT, s.size[2]]} />
            <meshStandardMaterial color="#6f9a88" roughness={0.55} />
          </mesh>
          <mesh position={[s.pos[0], WAINSCOT + (h - WAINSCOT) / 2, s.pos[2]]}>
            <boxGeometry args={[s.size[0], h - WAINSCOT, s.size[2]]} />
            <meshStandardMaterial color={CLUB.cream} roughness={0.85} />
          </mesh>
        </group>
      ))}
      {/* 磨石子地板 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, HALL.minZ / 2]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={CLUB.terrazzo} roughness={0.6} />
      </mesh>
      {/* 門口的紅地墊 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, -0.8]}>
        <planeGeometry args={[1.8, 1.2]} />
        <meshStandardMaterial color="#a8443a" roughness={0.95} />
      </mesh>
    </group>
  );
}

/** 桌上的牌牆：四邊各一排象牙色小方塊 */
function TileWalls() {
  const y = TABLE_HEIGHT + 0.05;
  const len = 0.62;
  const sides: [number, number, number][] = [
    [0, 0.33, 0],
    [0.33, 0, Math.PI / 2],
    [0, -0.33, 0],
    [-0.33, 0, Math.PI / 2],
  ];
  return (
    <group>
      {sides.map(([x, z, r], i) => (
        <mesh key={i} position={[x, y, z]} rotation-y={r}>
          <boxGeometry args={[len, 0.05, 0.05]} />
          <meshStandardMaterial color={CLUB.ivory} roughness={0.4} />
        </mesh>
      ))}
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
  const [x, z] = at;
  return (
    <group>
      <group position={[x, 0, z]} onClick={onSelect}>
        {/* 桌面：木框 + 綠絨布 */}
        <mesh position-y={TABLE_HEIGHT - 0.04}>
          <boxGeometry args={[TABLE_SIZE, 0.08, TABLE_SIZE]} />
          <meshStandardMaterial color={CLUB.wood} roughness={0.75} />
        </mesh>
        <mesh position-y={TABLE_HEIGHT + 0.001}>
          <boxGeometry args={[TABLE_SIZE - 0.12, 0.01, TABLE_SIZE - 0.12]} />
          <meshStandardMaterial color={CLUB.green} roughness={0.9} />
        </mesh>
        {[
          [-0.42, -0.42],
          [0.42, -0.42],
          [-0.42, 0.42],
          [0.42, 0.42],
        ].map(([lx, lz]) => (
          <mesh key={`${lx}${lz}`} position={[lx!, (TABLE_HEIGHT - 0.08) / 2, lz!]}>
            <boxGeometry args={[0.07, TABLE_HEIGHT - 0.08, 0.07]} />
            <meshStandardMaterial color={CLUB.woodDark} roughness={0.75} />
          </mesh>
        ))}
        <TileWalls />
        {/* 吊燈 */}
        <mesh position-y={2.55}>
          <coneGeometry args={[0.32, 0.22, 20, 1, true]} />
          <meshStandardMaterial color={CLUB.green} roughness={0.6} side={2} />
        </mesh>
        <mesh position-y={2.47}>
          <sphereGeometry args={[0.08, 12, 8]} />
          <meshStandardMaterial color="#fff2cc" emissive={CLUB.amber} emissiveIntensity={2} />
        </mesh>
        <mesh position-y={3.1}>
          <cylinderGeometry args={[0.01, 0.01, 1, 4]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        {/* 桌號 */}
        <Sign
          text={`${number}`}
          size={[0.32, 0.32]}
          position={[0, 2.25, 0]}
          bg={CLUB.cream}
          fg={CLUB.neonRed}
          glow={0.2}
        />
      </group>
      {/* 四張圓凳 */}
      {chairsOf(at).map(([cx, cz], i) => (
        <group key={i} position={[cx, 0, cz]}>
          <mesh position-y={0.43}>
            <cylinderGeometry args={[CHAIR_SIZE / 2, CHAIR_SIZE / 2, 0.06, 18]} />
            <meshStandardMaterial color={CLUB.neonRed} roughness={0.7} />
          </mesh>
          <mesh position-y={0.2}>
            <cylinderGeometry args={[0.04, 0.06, 0.4, 8]} />
            <meshStandardMaterial color="#3a3a40" metalness={1} roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Counter({ onSelect }: { onSelect: (e: ThreeEvent<MouseEvent>) => void }) {
  const c = COUNTER;
  const t = TEA_CABINET;
  return (
    <group>
      <group onClick={onSelect}>
        <mesh position={[(c.minX + c.maxX) / 2, 0.5, (c.minZ + c.maxZ) / 2]}>
          <boxGeometry args={[c.maxX - c.minX, 1, c.maxZ - c.minZ]} />
          <meshStandardMaterial color={CLUB.wood} roughness={0.75} />
        </mesh>
        <mesh position={[(c.minX + c.maxX) / 2, 1.03, (c.minZ + c.maxZ) / 2]}>
          <boxGeometry args={[c.maxX - c.minX + 0.1, 0.06, c.maxZ - c.minZ + 0.1]} />
          <meshStandardMaterial color={CLUB.cream} roughness={0.5} />
        </mesh>
        {/* 茶壺與茶杯 */}
        <mesh position={[(c.minX + c.maxX) / 2, 1.14, -3.6]}>
          <sphereGeometry args={[0.1, 14, 10]} />
          <meshStandardMaterial color="#8a4a32" roughness={0.3} />
        </mesh>
        {[-3.9, -3.75].map((z) => (
          <mesh key={z} position={[(c.minX + c.maxX) / 2 - 0.15, 1.1, z]}>
            <cylinderGeometry args={[0.035, 0.03, 0.06, 10]} />
            <meshStandardMaterial color={CLUB.ivory} roughness={0.3} />
          </mesh>
        ))}
      </group>
      <group position={[A_LE[0], 0, A_LE[1]]} rotation-y={-Math.PI / 2} onClick={onSelect}>
        <Character outfit={A_LE_OUTFIT} />
      </group>
      {/* 老茶櫃 */}
      <mesh position={[(t.minX + t.maxX) / 2, 1.2, (t.minZ + t.maxZ) / 2]}>
        <boxGeometry args={[t.maxX - t.minX, 2.4, t.maxZ - t.minZ]} />
        <meshStandardMaterial color={CLUB.woodDark} roughness={0.75} />
      </mesh>
      {[0.7, 1.3, 1.9].map((y) =>
        [-6.3, -5.4, -4.5, -3.6, -2.7].map((z, i) => (
          <mesh key={`${y}${z}`} position={[t.minX - 0.12, y, z]}>
            <cylinderGeometry args={[0.13, 0.13, 0.3, 12]} />
            <meshStandardMaterial
              color={
                [CLUB.neonRed, CLUB.green, CLUB.cream, CLUB.amber, CLUB.navy][(i + y * 10) % 5]
              }
              roughness={0.5}
            />
          </mesh>
        )),
      )}
      <Sign
        text="茶"
        size={[0.6, 0.6]}
        position={[t.minX - 0.02, 2.75, -4.5]}
        rotation={[0, -Math.PI / 2, 0]}
        bg={CLUB.neonRed}
        fg={CLUB.cream}
        glow={0.5}
      />
    </group>
  );
}

function Stairs({ onSelect }: { onSelect: (e: ThreeEvent<MouseEvent>) => void }) {
  const s = STAIRS;
  const steps = 11;
  const depth = (s.maxZ - s.minZ) / steps;
  return (
    <group onClick={onSelect}>
      {Array.from({ length: steps }, (_, i) => (
        <mesh
          key={i}
          position={[(s.minX + s.maxX) / 2, (0.18 * (i + 1)) / 2, s.maxZ - depth * (i + 0.5)]}
        >
          <boxGeometry args={[s.maxX - s.minX, 0.18 * (i + 1), depth]} />
          <meshStandardMaterial color={i % 2 ? CLUB.wood : '#8f6448'} roughness={0.75} />
        </mesh>
      ))}
      <mesh position={[s.maxX + 0.04, 1.4, (s.minZ + s.maxZ) / 2]}>
        <boxGeometry args={[0.06, 0.06, s.maxZ - s.minZ]} />
        <meshStandardMaterial color={CLUB.woodDark} />
      </mesh>
      <Sign
        text="2F 牌桌館 整修中"
        size={[1.8, 0.4]}
        position={[(s.minX + s.maxX) / 2 + 0.6, 2.7, HALL.minZ + 0.02]}
        bg={CLUB.cream}
        fg={CLUB.green}
        glow={0.3}
      />
    </group>
  );
}

function Elevator({ onSelect }: { onSelect: (e: ThreeEvent<MouseEvent>) => void }) {
  const e = ELEVATOR;
  const cx = (e.minX + e.maxX) / 2;
  return (
    <group onClick={onSelect}>
      <mesh position={[cx, 1.4, (e.minZ + e.maxZ) / 2]}>
        <boxGeometry args={[e.maxX - e.minX, 2.8, e.maxZ - e.minZ]} />
        <meshStandardMaterial color="#d8cbb4" roughness={0.8} />
      </mesh>
      {[-0.42, 0.42].map((dx) => (
        <mesh key={dx} position={[cx + dx, 1.15, e.maxZ + 0.01]}>
          <boxGeometry args={[0.82, 2.3, 0.04]} />
          <meshStandardMaterial color="#a9b0b8" metalness={1} roughness={0.35} />
        </mesh>
      ))}
      <Sign
        text="電梯"
        size={[0.8, 0.3]}
        position={[cx, 2.55, e.maxZ + 0.02]}
        bg={CLUB.navy}
        fg={CLUB.amber}
        glow={0.8}
      />
    </group>
  );
}

/** 牆上的裝飾：電視、海報、時鐘、紅燈籠串 */
function Decor() {
  const neon = useNeon();
  return (
    <group>
      <mesh position={[-2, 2.3, HALL.minZ + 0.1]}>
        <boxGeometry args={[1.1, 0.75, 0.2]} />
        <meshStandardMaterial color="#3a3a40" roughness={0.6} />
      </mesh>
      <mesh position={[-2, 2.3, HALL.minZ + 0.21]}>
        <planeGeometry args={[0.95, 0.6]} />
        <meshStandardMaterial color="#9fd0d4" emissive={CLUB.cyan} emissiveIntensity={0.9} />
      </mesh>
      <Sign
        text="自摸"
        size={[0.9, 0.5]}
        position={[HALL.minX + 0.02, 2.2, -4]}
        rotation={[0, Math.PI / 2, 0]}
        bg={CLUB.neonRed}
        fg={CLUB.cream}
        glow={0.3}
      />
      <Sign
        text="清一色"
        size={[1.1, 0.5]}
        position={[HALL.minX + 0.02, 2.2, -8]}
        rotation={[0, Math.PI / 2, 0]}
        bg={CLUB.cream}
        fg={CLUB.green}
        glow={0.3}
      />
      <Sign
        text="二十四小時營業"
        size={[2.4, 0.42]}
        position={[2.6, 2.6, HALL.minZ + 0.02]}
        bg={CLUB.wood}
        fg={CLUB.cream}
        glow={0.2}
      />
      {/* 掛鐘 */}
      <mesh position={[4.6, 2.5, HALL.minZ + 0.03]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.28, 0.28, 0.06, 24]} />
        <meshStandardMaterial color={CLUB.ivory} roughness={0.5} />
      </mesh>
      {/* 中央走道上方的燈籠串 */}
      <mesh position={[0, 3.24, -5.5]}>
        <boxGeometry args={[0.015, 0.015, 9]} />
        <meshStandardMaterial color="#2a2220" />
      </mesh>
      {[-1.5, -3.5, -5.5, -7.5, -9.5].map((z) => (
        <mesh key={z} position={[0, 3.05, z]}>
          <sphereGeometry args={[0.16, 12, 10]} />
          <meshStandardMaterial
            color={CLUB.neonRed}
            emissive={CLUB.neonRed}
            emissiveIntensity={0.6 + neon * 0.4}
            roughness={0.6}
          />
        </mesh>
      ))}
    </group>
  );
}

/** 1F 麻將館室內（燈一直亮，不隨時段變暗） */
export function MahjongHall({ onSelect }: { onSelect: (id: string) => void }) {
  const pick = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(id);
  };
  return (
    <group>
      <Walls />
      {TABLES.map((t, i) => (
        <MahjongTable key={i} at={t} number={i + 1} onSelect={pick(`table-${i + 1}`)} />
      ))}
      <Counter onSelect={pick('a-le')} />
      <Stairs onSelect={pick('stairs')} />
      <Elevator onSelect={pick('elevator')} />
      <Decor />
      {/* 室內暖琥珀燈 */}
      <pointLight
        position={[-3.8, 3, -4]}
        color={CLUB.amber}
        intensity={9}
        distance={9}
        decay={1.6}
      />
      <pointLight
        position={[-0.2, 3, -8]}
        color={CLUB.amber}
        intensity={9}
        distance={9}
        decay={1.6}
      />
      <pointLight position={[6, 3, -5]} color="#ffe2b0" intensity={6} distance={7} decay={1.6} />
    </group>
  );
}
