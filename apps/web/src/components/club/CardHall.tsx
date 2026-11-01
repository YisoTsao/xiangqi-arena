'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Color, Object3D, type InstancedMesh } from 'three';
import { Bake } from './Bake';
import { Character, HOST_OUTFIT, WATCHER_OUTFIT } from './Character';
import {
  CARD_TABLE_RADIUS,
  CARD_TABLES,
  CHESS_TABLE_SIZE,
  CHESS_TABLES,
  FLOOR_HEIGHT,
  GAME_SHELF,
  HALL,
  HOST,
  HOST_DESK,
  PLANTS_2F,
  SOFA_2F,
  STAIRS,
  STAIRS_LANDING_2F,
  TABLE_HEIGHT,
  WATCHER,
  cardChairsOf,
  chessChairsOf,
  type Box,
  type Vec2,
} from './layout';
import { Chair, Elevator, ShojiWindow, Stairs, WallPanel } from './MahjongHall';
import { LightPool, Plant, Rounded, Sign, Wood, useNeon, useQuality } from './props';
import { CLUB } from './signs';
import { usePbr } from './pbr';
import { banqiBoard, felt, tiled, xiangqiBoard } from './textures';

/**
 * 2F 牌桌館（CLUB_ART_BIBLE §2.2：綠燈罩投影光、撲克綠絨、木紋棋桌）。
 *
 * 和 1F 同一個樓板範圍，整組放在 y = FLOOR_HEIGHT。2F 一律是室內鏡頭，
 * 所以靠鏡頭的正面牆與右牆一直切低（剖面娃娃屋）；樓板下方補一塊 1F 外殼，從旁邊看不會懸空。
 */

const H = HALL.height;
const D = -HALL.minZ;
const W = HALL.maxX - HALL.minX;
const CUT = 0.9;
const CUSHION = '#3f7a62';
/** 綠燈罩下的暖光 */
const LAMP = '#ffe3a6';

const mid = (b: Box): Vec2 => [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2];
const span = (b: Box): [number, number] => [b.maxX - b.minX, b.maxZ - b.minZ];

type Pick = (e: ThreeEvent<MouseEvent>) => void;

// ── 樓板、牆、1F 外殼 ──────────────────────────────────

function FloorSlab() {
  const wood = usePbr('wood_floor', [W, D], 1.2);
  const shell = usePbr('facade_tile', [W + 0.6, FLOOR_HEIGHT], 1);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, -D / 2]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial {...wood} />
      </mesh>
      {/* 樓板厚度 + 1F 外殼（看得到樓下櫥窗的暖光） */}
      <mesh position={[0, -FLOOR_HEIGHT / 2, -D / 2]} receiveShadow>
        <boxGeometry args={[W + 0.6, FLOOR_HEIGHT - 0.01, D + 0.3]} />
        <meshStandardMaterial {...shell} color="#ead2ad" />
      </mesh>
      <Rounded
        size={[W + 0.8, 0.22, 0.42]}
        position={[0, -0.11, 0.2]}
        color="#c79a72"
        radius={0.04}
        castShadow={false}
      />
      {[
        [-5, 7.4],
        [5, 7.4],
      ].map(([x, w]) => (
        <mesh key={x} position={[x!, -FLOOR_HEIGHT + 1.55, 0.17]}>
          <planeGeometry args={[w!, 2.1]} />
          <meshStandardMaterial
            color="#ffd9a0"
            emissive="#ffb870"
            emissiveIntensity={0.9}
            toneMapped={false}
          />
        </mesh>
      ))}
      {/* 綠絨地毯：牌桌區、棋桌區各一塊 */}
      <Rounded
        size={[7.4, 0.014, 7.4]}
        position={[4.3, 0.012, -5.3]}
        color="#2f5e4c"
        radius={0.006}
        roughness={1}
        castShadow={false}
      />
      <Rounded
        size={[6.4, 0.014, 6.8]}
        position={[-4.45, 0.012, -5.1]}
        color="#6b4a34"
        radius={0.006}
        roughness={1}
        castShadow={false}
      />
      <Rounded
        size={[6, 0.016, 6.4]}
        position={[-4.45, 0.013, -5.1]}
        color="#8a5f40"
        radius={0.006}
        roughness={1}
        castShadow={false}
      />
    </group>
  );
}

function Walls() {
  return (
    <group>
      <WallPanel length={W + 0.6} position={[0, 0, HALL.minZ - 0.15]} ry={0} />
      <WallPanel
        length={D}
        position={[HALL.minX - 0.15, 0, -D / 2]}
        ry={Math.PI / 2}
        side
      />
      <WallPanel
        length={D}
        position={[HALL.maxX + 0.15, 0, -D / 2]}
        ry={-Math.PI / 2}
        height={CUT}
        side
      />
      <WallPanel length={W + 0.6} position={[0, 0, 0]} ry={Math.PI} height={CUT} />
      {/* 窗：左牆兩扇、後牆一扇 */}
      {[-2.4, -6].map((z) => (
        <ShojiWindow
          key={z}
          position={[HALL.minX + 0.02, 1.9, z]}
          ry={Math.PI / 2}
          size={[1.6, 1.3]}
        />
      ))}
      <ShojiWindow position={[3.5, 1.9, HALL.minZ + 0.02]} ry={0} />
    </group>
  );
}

// ── 綠燈罩吊燈 ─────────────────────────────────────────

function GreenLamp({ y = 2.2, radius = 0.32 }: { y?: number; radius?: number }) {
  return (
    <group>
      <mesh position-y={(H + y) / 2}>
        <cylinderGeometry args={[0.006, 0.006, H - y, 4]} />
        <meshStandardMaterial color="#2a2220" />
      </mesh>
      <mesh position-y={y + 0.1} castShadow>
        <coneGeometry args={[radius, 0.2, 20, 1, true]} />
        <meshStandardMaterial
          color="#2f6b55"
          emissive="#9ad6a8"
          emissiveIntensity={0.18}
          roughness={0.35}
          side={2}
        />
      </mesh>
      <mesh position-y={y + 0.205}>
        <cylinderGeometry args={[0.05, 0.05, 0.03, 12]} />
        <meshStandardMaterial color="#c9a14e" metalness={1} roughness={0.35} />
      </mesh>
      <mesh position-y={y + 0.04}>
        <sphereGeometry args={[0.06, 12, 10]} />
        <meshStandardMaterial
          color="#fff6d8"
          emissive={LAMP}
          emissiveIntensity={4}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

// ── 棋子（每張桌子兩個 InstancedMesh：棋身 + 字的顏色點） ─

interface Piece {
  x: number;
  z: number;
  /** 翻開的棋子有紅或黑字；null = 蓋著（暗棋） */
  side: 'red' | 'black' | null;
}

const RED = new Color('#c0392b');
const BLACK = new Color('#1f1a17');

function Pieces({ pieces, r, y }: { pieces: Piece[]; r: number; y: number }) {
  const body = useRef<InstancedMesh>(null);
  const ink = useRef<InstancedMesh>(null);
  const up = useMemo(() => pieces.filter((p) => p.side), [pieces]);
  useLayoutEffect(() => {
    const o = new Object3D();
    pieces.forEach((p, i) => {
      o.position.set(p.x, y + 0.009, p.z);
      o.updateMatrix();
      body.current?.setMatrixAt(i, o.matrix);
    });
    up.forEach((p, i) => {
      o.position.set(p.x, y + 0.0185, p.z);
      o.updateMatrix();
      ink.current?.setMatrixAt(i, o.matrix);
      ink.current?.setColorAt(i, p.side === 'red' ? RED : BLACK);
    });
    if (body.current) body.current.instanceMatrix.needsUpdate = true;
    if (ink.current) {
      ink.current.instanceMatrix.needsUpdate = true;
      if (ink.current.instanceColor) ink.current.instanceColor.needsUpdate = true;
    }
  }, [pieces, up, y]);
  return (
    <group>
      <instancedMesh ref={body} args={[undefined, undefined, pieces.length]} castShadow>
        <cylinderGeometry args={[r, r, 0.018, 16]} />
        <meshStandardMaterial color="#f1dfbd" roughness={0.45} />
      </instancedMesh>
      {up.length > 0 && (
        <instancedMesh ref={ink} args={[undefined, undefined, up.length]}>
          <cylinderGeometry args={[r * 0.62, r * 0.62, 0.002, 16]} />
          <meshStandardMaterial color="#ffffff" roughness={0.6} />
        </instancedMesh>
      )}
    </group>
  );
}

/** 象棋盤面大小（9 路 × 10 線，貼圖邊界 22/256） */
const XQ = { w: 0.62, h: 0.68, margin: 22 / 256 } as const;
/** 暗棋盤面（8 × 4 格，貼圖邊界 20/256） */
const BQ = { w: 0.72, h: 0.4, margin: 20 / 256 } as const;

/** 開局後兩步（炮二平五、馬８進７）的局面 */
function xiangqiPieces(): Piece[] {
  const gx = (XQ.w * (1 - 2 * XQ.margin)) / 8;
  const gz = (XQ.h * (1 - 2 * XQ.margin)) / 9;
  const at = (c: number, r: number, side: 'red' | 'black'): Piece => ({
    x: -XQ.w / 2 + XQ.w * XQ.margin + c * gx,
    z: -XQ.h / 2 + XQ.h * XQ.margin + r * gz,
    side,
  });
  const out: Piece[] = [];
  for (const [side, back, cannon, pawn] of [
    ['black', 0, 2, 3],
    ['red', 9, 7, 6],
  ] as const) {
    for (let c = 0; c < 9; c++) {
      // 黑方右馬已跳到 (6, 2)
      if (side === 'black' && c === 7) out.push(at(6, 2, side));
      else out.push(at(c, back, side));
    }
    // 紅方右炮平到中路
    out.push(at(1, cannon, side), at(side === 'red' ? 4 : 7, cannon, side));
    for (const c of [0, 2, 4, 6, 8]) out.push(at(c, pawn, side));
  }
  return out;
}

/** 暗棋：32 子蓋著排滿 4 × 8，已經翻開幾顆 */
function banqiPieces(seed: number): Piece[] {
  const gx = (BQ.w * (1 - 2 * BQ.margin)) / 8;
  const gz = (BQ.h * (1 - 2 * BQ.margin)) / 4;
  const out: Piece[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
      const k = (r * 8 + c) * 7 + seed * 13;
      const open = k % 5 === 0;
      out.push({
        x: -BQ.w / 2 + BQ.w * BQ.margin + (c + 0.5) * gx,
        z: -BQ.h / 2 + BQ.h * BQ.margin + (r + 0.5) * gz,
        side: open ? (k % 2 ? 'red' : 'black') : null,
      });
    }
  }
  return out;
}

// ── 棋桌 ───────────────────────────────────────────────

function ChessTable({
  at,
  mode,
  number,
  onSelect,
}: {
  at: Vec2;
  mode: 'classic' | 'banqi';
  number: number;
  onSelect: Pick;
}) {
  const board = useMemo(
    () => tiled(mode === 'classic' ? xiangqiBoard() : banqiBoard(), 1, 1),
    [mode],
  );
  const s = CHESS_TABLE_SIZE;
  const [x, z] = at;
  const dims = mode === 'classic' ? XQ : BQ;
  return (
    <group>
      <group position={[x, 0, z]} onClick={onSelect}>
        {/* 桌腳、裙板、桌面 */}
        {[
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].map(([a, b]) => (
          <Wood
            key={`${a}${b}`}
            size={[0.07, TABLE_HEIGHT - 0.06, 0.07]}
            position={[(a! * (s - 0.16)) / 2, (TABLE_HEIGHT - 0.06) / 2, (b! * (s - 0.16)) / 2]}
            color="#a87850"
          />
        ))}
        <Wood
          size={[s - 0.1, 0.1, s - 0.1]}
          position={[0, TABLE_HEIGHT - 0.1, 0]}
          color="#a87850"
        />
        <Wood
          size={[s, 0.05, s]}
          position={[0, TABLE_HEIGHT - 0.025, 0]}
          color="#c99a6a"
          radius={0.02}
        />
        <mesh rotation-x={-Math.PI / 2} position-y={TABLE_HEIGHT + 0.002} receiveShadow>
          <planeGeometry args={[dims.w, dims.h]} />
          <meshStandardMaterial map={board} roughness={0.55} />
        </mesh>
        {/* 茶杯 */}
        <mesh position={[s / 2 - 0.1, TABLE_HEIGHT + 0.03, 0.05]}>
          <cylinderGeometry args={[0.035, 0.028, 0.06, 12]} />
          <meshStandardMaterial color={CLUB.ivory} roughness={0.3} />
        </mesh>
        <GreenLamp />
        <LightPool
          position={[0, TABLE_HEIGHT + 0.012, 0]}
          radius={0.55}
          color={LAMP}
          opacity={0.38}
        />
        <LightPool position={[0, 0.03, 0]} radius={1.2} color={LAMP} opacity={0.16} />
        <Sign
          text={`${number}`}
          size={[0.2, 0.2]}
          position={[0, 1.98, 0.24]}
          bg={CLUB.cream}
          fg={CLUB.green}
          glow={0}
        />
      </group>
      {chessChairsOf(at).map((c, i) => (
        <Chair key={i} at={c} face={i === 0 ? 0 : Math.PI} cushion={CUSHION} />
      ))}
    </group>
  );
}

/** 棋子另外畫（InstancedMesh 不進 Bake） */
function ChessPieces() {
  const classic = useMemo(() => xiangqiPieces(), []);
  const banqi = useMemo(() => [banqiPieces(1), banqiPieces(2)], []);
  let b = 0;
  return (
    <group>
      {CHESS_TABLES.map(({ at, mode }) => (
        <group key={`${at[0]}${at[1]}`} position={[at[0], 0, at[1]]}>
          {mode === 'classic' ? (
            <Pieces pieces={classic} r={0.026} y={TABLE_HEIGHT} />
          ) : (
            <Pieces pieces={banqi[b++ % 2]!} r={0.03} y={TABLE_HEIGHT} />
          )}
        </group>
      ))}
    </group>
  );
}

// ── 撲克圓桌 ───────────────────────────────────────────

function CardTable({ at, number, onSelect }: { at: Vec2; number: number; onSelect: Pick }) {
  const feltMap = useMemo(() => tiled(felt(), 1, 1), []);
  const r = CARD_TABLE_RADIUS;
  const [x, z] = at;
  const faces = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  return (
    <group>
      <group position={[x, 0, z]} onClick={onSelect}>
        {/* 底座與中柱 */}
        <mesh position-y={0.04} castShadow receiveShadow>
          <cylinderGeometry args={[0.36, 0.42, 0.08, 24]} />
          <meshStandardMaterial color="#5e3f2c" roughness={0.6} />
        </mesh>
        <mesh position-y={TABLE_HEIGHT / 2} castShadow>
          <cylinderGeometry args={[0.09, 0.12, TABLE_HEIGHT - 0.1, 16]} />
          <meshStandardMaterial color="#6e4a32" roughness={0.6} />
        </mesh>
        {/* 桌面：木圈 + 綠絨 */}
        <mesh position-y={TABLE_HEIGHT - 0.035} castShadow receiveShadow>
          <cylinderGeometry args={[r, r - 0.02, 0.07, 40]} />
          <meshStandardMaterial color="#8a5a3a" roughness={0.45} />
        </mesh>
        <mesh position-y={TABLE_HEIGHT + 0.004} rotation-x={Math.PI / 2}>
          <torusGeometry args={[r - 0.05, 0.045, 10, 40]} />
          <meshStandardMaterial color="#5e3f2c" roughness={0.5} />
        </mesh>
        <mesh position-y={TABLE_HEIGHT + 0.002} rotation-x={-Math.PI / 2} receiveShadow>
          <circleGeometry args={[r - 0.09, 40]} />
          <meshStandardMaterial map={feltMap} roughness={0.95} />
        </mesh>
        {/* 每個座位前一小疊牌、中央出過的牌 */}
        {faces.map((f, i) => (
          <group key={i} rotation-y={f}>
            {[-0.04, 0, 0.04].map((dx, k) => (
              <mesh
                key={dx}
                position={[dx, TABLE_HEIGHT + 0.006 + k * 0.002, r - 0.24]}
                rotation-y={dx * 3}
              >
                <boxGeometry args={[0.06, 0.002, 0.088]} />
                <meshStandardMaterial color={CLUB.navy} roughness={0.6} />
              </mesh>
            ))}
          </group>
        ))}
        {[0, 1, 2].map((k) => (
          <mesh
            key={k}
            position={[-0.05 + k * 0.05, TABLE_HEIGHT + 0.006 + k * 0.002, 0.02 * k]}
            rotation-y={0.3 * k - 0.2}
          >
            <boxGeometry args={[0.06, 0.002, 0.088]} />
            <meshStandardMaterial color={CLUB.ivory} roughness={0.6} />
          </mesh>
        ))}
        <GreenLamp radius={0.42} y={2.15} />
        <LightPool
          position={[0, TABLE_HEIGHT + 0.012, 0]}
          radius={0.7}
          color={LAMP}
          opacity={0.4}
        />
        <LightPool position={[0, 0.03, 0]} radius={1.6} color={LAMP} opacity={0.18} />
        <Sign
          text={`${number}`}
          size={[0.22, 0.22]}
          position={[0, 1.9, 0.32]}
          bg={CLUB.green}
          fg={CLUB.cream}
          glow={0.2}
        />
      </group>
      {cardChairsOf(at).map((c, i) => (
        <Chair key={i} at={c} face={faces[i]!} cushion={CUSHION} />
      ))}
    </group>
  );
}

// ── 服務台、棋具櫃、樓梯口、沙發 ───────────────────────

function HostDesk({ onSelect }: { onSelect: Pick }) {
  const [cx, cz] = mid(HOST_DESK);
  const [w, d] = span(HOST_DESK);
  return (
    <group onClick={onSelect}>
      <Wood size={[w, 1.0, d]} position={[cx, 0.5, cz]} repeat={2} color="#d8b089" />
      {Array.from({ length: 8 }, (_, i) => (
        <Wood
          key={i}
          size={[0.06, 0.82, 0.04]}
          position={[HOST_DESK.minX + 0.2 + i * 0.37, 0.48, HOST_DESK.maxZ + 0.02]}
          radius={0.01}
          color="#9a6a48"
          castShadow={false}
        />
      ))}
      <Rounded
        size={[w + 0.12, 0.06, d + 0.12]}
        position={[cx, 1.03, cz]}
        color={CLUB.cream}
        radius={0.025}
        roughness={0.4}
      />
      {/* 牌盒、棋盒、計時鐘 */}
      {[-1, -0.82, -0.64].map((x, i) => (
        <Rounded
          key={x}
          size={[0.12, 0.05, 0.17]}
          position={[x, 1.085, cz]}
          color={[CLUB.neonRed, CLUB.navy, CLUB.green][i]!}
          radius={0.01}
        />
      ))}
      <Wood size={[0.42, 0.08, 0.42]} position={[0.55, 1.1, cz]} color="#a87850" />
      <Rounded size={[0.26, 0.14, 0.1]} position={[0.05, 1.13, cz]} color="#3a3a40" radius={0.02} />
      {[-0.04, 0.14].map((x) => (
        <mesh key={x} position={[x, 1.14, cz + 0.052]}>
          <circleGeometry args={[0.04, 16]} />
          <meshStandardMaterial color={CLUB.ivory} />
        </mesh>
      ))}
      <group position={[cx + 1.1, 1.06, cz]}>
        <GreenLamp y={0.32} radius={0.12} />
      </group>
    </group>
  );
}

function GameShelf() {
  const [cx, cz] = mid(GAME_SHELF);
  const [w, d] = span(GAME_SHELF);
  const colors = [CLUB.neonRed, CLUB.navy, CLUB.green, CLUB.amber, CLUB.cream, CLUB.wood];
  return (
    <group>
      <Wood size={[w, 1.9, d]} position={[cx, 0.95, cz]} color="#7a5038" repeat={2} />
      {[0.5, 1.05, 1.6].map((y, row) =>
        Array.from({ length: 7 }, (_, i) => (
          <Rounded
            key={`${y}${i}`}
            size={[0.28, 0.32 - (i % 3) * 0.04, 0.3]}
            position={[
              GAME_SHELF.minX + 0.3 + i * 0.37,
              y - 0.12 + (0.32 - (i % 3) * 0.04) / 2,
              GAME_SHELF.maxZ + 0.02,
            ]}
            color={colors[(i + row * 2) % colors.length]!}
            radius={0.015}
            castShadow={false}
          />
        )),
      )}
      <Sign
        text="棋具租借"
        size={[1.4, 0.36]}
        position={[cx, 2.25, HALL.minZ + 0.02]}
        bg={CLUB.wood}
        fg={CLUB.cream}
        glow={0}
      />
    </group>
  );
}

/** 往 3F 的樓梯拉上紅繩；樓梯口旁的牆上指往 1F */
function StairsTo3F({ onSelect }: { onSelect: Pick }) {
  const [cx] = mid(STAIRS);
  return (
    <group>
      <Stairs onSelect={onSelect} sign="3F 電玩網咖・整修中" />
      {[STAIRS.minX + 0.08, STAIRS.maxX - 0.08].map((x) => (
        <group key={x} position={[x, 0, STAIRS.maxZ + 0.15]}>
          <mesh position-y={0.45}>
            <cylinderGeometry args={[0.025, 0.025, 0.9, 10]} />
            <meshStandardMaterial color="#c9a14e" metalness={1} roughness={0.35} />
          </mesh>
          <mesh position-y={0.04}>
            <cylinderGeometry args={[0.12, 0.14, 0.06, 16]} />
            <meshStandardMaterial color="#c9a14e" metalness={1} roughness={0.35} />
          </mesh>
        </group>
      ))}
      <mesh position={[cx, 0.82, STAIRS.maxZ + 0.15]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.018, 0.018, STAIRS.maxX - STAIRS.minX - 0.16, 8]} />
        <meshStandardMaterial color="#a8443a" roughness={0.8} />
      </mesh>
      <Sign
        text="↓ 1F 麻將館"
        size={[1.2, 0.3]}
        position={[HALL.minX + 0.02, 2.2, STAIRS_LANDING_2F[1]]}
        rotation={[0, Math.PI / 2, 0]}
        bg={CLUB.cream}
        fg={CLUB.neonRed}
        border={CLUB.neonRed}
        glow={0.2}
      />
    </group>
  );
}

function Sofa() {
  const [cx, cz] = mid(SOFA_2F);
  const [w, d] = span(SOFA_2F);
  return (
    <group>
      <Rounded
        size={[w, 0.42, d]}
        position={[cx, 0.21, cz]}
        color="#2f5e4c"
        radius={0.06}
        roughness={0.9}
      />
      <Rounded
        size={[w, 0.5, 0.14]}
        position={[cx, 0.6, SOFA_2F.maxZ - 0.07]}
        color="#2f5e4c"
        radius={0.06}
        roughness={0.9}
      />
      {[SOFA_2F.minX + 0.07, SOFA_2F.maxX - 0.07].map((x) => (
        <Rounded
          key={x}
          size={[0.14, 0.58, d]}
          position={[x, 0.29, cz]}
          color="#28503f"
          radius={0.05}
          roughness={0.9}
        />
      ))}
    </group>
  );
}

function Decor() {
  return (
    <group>
      <Sign
        text="牌桌館"
        size={[1.9, 0.5]}
        position={[0, 2.85, HALL.minZ + 0.02]}
        bg={CLUB.green}
        fg={CLUB.cream}
        border={CLUB.amber}
        depth={0.08}
        frame={CLUB.wood}
        glow={0.5}
      />
      <Sign
        text="觀棋不語"
        size={[0.6, 1.6]}
        position={[HALL.minX + 0.02, 2.05, -4.2]}
        rotation={[0, Math.PI / 2, 0]}
        bg={CLUB.cream}
        fg={CLUB.woodDark}
        border={CLUB.wood}
        glow={0}
        vertical
      />
      <Sign
        text="起手無回"
        size={[0.6, 1.6]}
        position={[HALL.minX + 0.02, 2.05, -0.9]}
        rotation={[0, Math.PI / 2, 0]}
        bg={CLUB.cream}
        fg={CLUB.woodDark}
        border={CLUB.wood}
        glow={0}
        vertical
      />
      <Sign
        text="大老二・今晚開桌"
        size={[2.2, 0.42]}
        position={[5.2, 2.75, HALL.minZ + 0.02]}
        bg={CLUB.navy}
        fg={CLUB.amber}
        border={CLUB.amber}
        glow={0.6}
      />
      {/* 牆上的棋力榜 */}
      <group position={[-1.9, 1.9, HALL.minZ + 0.03]}>
        <Wood size={[1, 1.2, 0.04]} color="#5e3f2c" castShadow={false} />
        {[0.38, 0.18, -0.02, -0.22, -0.42].map((y, i) => (
          <mesh key={y} position={[0, y, 0.025]}>
            <planeGeometry args={[0.8 - i * 0.06, 0.08]} />
            <meshStandardMaterial color={i === 0 ? CLUB.amber : CLUB.cream} />
          </mesh>
        ))}
      </group>
      {PLANTS_2F.map(([x, z]) => (
        <Plant key={`${x}${z}`} position={[x, 0, z]} scale={1.35} />
      ))}
      <Sofa />
    </group>
  );
}

/** 2F 燈光：一直在室內，燈常亮；綠燈罩下的暖光、窗光（夜晚冷藍） */
function Lights() {
  const quality = useQuality();
  const neon = useNeon();
  const night = neon > 0.5;
  const lamps: Vec2[] = [...CHESS_TABLES.map((t) => t.at), ...CARD_TABLES];
  return (
    <group>
      <ambientLight color="#fff0cf" intensity={0.42} />
      {lamps.map(([x, z], i) =>
        quality !== 'low' || i % 2 === 0 ? (
          <pointLight
            key={i}
            position={[x, 1.95, z]}
            color={LAMP}
            intensity={3.4}
            distance={4}
            decay={1.6}
          />
        ) : null,
      )}
      <pointLight
        position={[0, 2.2, -9.8]}
        color="#ffd59a"
        intensity={2.4}
        distance={5}
        decay={1.6}
      />
      <pointLight
        position={[0, 3.2, -2]}
        color="#ffe3b8"
        intensity={1.6}
        distance={9}
        decay={1.4}
      />
      {quality !== 'low' && (
        <pointLight
          position={[HALL.minX + 0.9, 2, -4.2]}
          color={night ? '#9cc4ff' : '#fff1d6'}
          intensity={1.6}
          distance={5}
          decay={1.6}
        />
      )}
    </group>
  );
}

/** 2F 牌桌館室內；onSelect 收到互動點 id（點桌子、小葵、樓梯、電梯就走過去） */
export function CardHall({ onSelect }: { onSelect: (id: string) => void }) {
  const quality = useQuality();
  const pick = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(id);
  };
  return (
    <group position-y={FLOOR_HEIGHT}>
      <Bake deps={[quality]}>
        <FloorSlab />
        <Walls />
        {CHESS_TABLES.map(({ at, mode }, i) => (
          <ChessTable
            key={i}
            at={at}
            mode={mode}
            number={i + 1}
            onSelect={pick(`chess-${i + 1}`)}
          />
        ))}
        {CARD_TABLES.map((t, i) => (
          <CardTable key={i} at={t} number={i + 1} onSelect={pick(`cards-${i + 1}`)} />
        ))}
        <HostDesk onSelect={pick('host')} />
        <GameShelf />
        <StairsTo3F onSelect={pick('stairs-down')} />
        <Elevator onSelect={pick('elevator-2f')} />
        <Decor />
      </Bake>
      <ChessPieces />
      <group position={[HOST[0], 0, HOST[1]]} onClick={pick('host')}>
        <Character outfit={HOST_OUTFIT} />
      </group>
      {/* 觀棋的老伯：面向 2 號棋桌 */}
      <group position={[WATCHER[0], 0, WATCHER[1]]} rotation-y={-Math.PI * 0.62}>
        <Character outfit={WATCHER_OUTFIT} />
      </group>
      <Lights />
    </group>
  );
}
