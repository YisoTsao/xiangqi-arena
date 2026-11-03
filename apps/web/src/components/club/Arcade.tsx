'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { Bake } from './Bake';
import { ARCADE_MACHINES, type ArcadeGame, type ArcadeMachine } from './layout';
import { ARCADE_H, ARCADE_SPECS, ARCADE_W, type ArcadeInput, type ArcadeRun } from './arcadeGames';
import { Glow, Rounded, Sign, useNeon, useQuality } from './props';
import { CLUB } from './signs';

type V3 = [number, number, number];

/** 機台螢幕：在 2D canvas 上跑遊戲的待機示範，每秒更新幾次貼圖 */
function useAttractScreen(game: ArcadeGame, animate: boolean) {
  const state = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = ARCADE_W / 2;
    canvas.height = ARCADE_H / 2;
    const g = canvas.getContext('2d');
    if (!g) return null;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return { g, texture, run: ARCADE_SPECS[game].create() as ArcadeRun, t: 0, acc: 0 };
  }, [game]);

  useEffect(() => {
    if (!state) return;
    state.g.setTransform(0.5, 0, 0, 0.5, 0, 0);
    state.run.draw(state.g, 0);
    state.texture.needsUpdate = true;
    return () => state.texture.dispose();
  }, [state]);

  useFrame((_, delta) => {
    if (!state || !animate) return;
    const dt = Math.min(delta, 0.1);
    state.t += dt;
    state.acc += dt;
    // 自動示範：跟著畫面左右擺動，偶爾按一下動作鈕
    const sway = Math.sin(state.t * 1.3);
    const demo: ArcadeInput = {
      left: sway < -0.3,
      right: sway > 0.3,
      pointer: null,
      pointerDown: false,
      pointerMoved: false,
      taps: [],
      action: Math.random() < dt * 0.8,
      keys: [],
    };
    state.run.update(dt, demo);
    if (state.run.over) state.run = ARCADE_SPECS[game].create();
    // 貼圖一秒更新 8 次就夠（上傳貼圖比畫圖貴）
    if (state.acc < 0.125) return;
    state.acc = 0;
    state.g.setTransform(0.5, 0, 0, 0.5, 0, 0);
    state.run.draw(state.g, state.t);
    state.texture.needsUpdate = true;
  });
  return state?.texture ?? null;
}

function Screen({
  game,
  size,
  position,
  rotation,
}: {
  game: ArcadeGame;
  size: [number, number];
  position: V3;
  rotation?: V3;
}) {
  const quality = useQuality();
  const map = useAttractScreen(game, quality !== 'low');
  return (
    <mesh position={position} rotation={rotation} userData={{ noBake: true }}>
      <planeGeometry args={size} />
      <meshStandardMaterial
        map={map}
        emissiveMap={map}
        emissive="#ffffff"
        emissiveIntensity={0.9}
        roughness={0.25}
        toneMapped={false}
      />
    </mesh>
  );
}

/** 跑馬燈泡：一排小燈輪流亮 */
function Bulbs({ count, width, position }: { count: number; width: number; position: V3 }) {
  const neon = useNeon();
  const refs = useRef<({ emissiveIntensity: number } | null)[]>([]);
  useFrame(({ clock }) => {
    const step = Math.floor(clock.elapsedTime * 5);
    refs.current.forEach((m, i) => {
      if (m) m.emissiveIntensity = (step + i) % 3 === 0 ? 1.6 : 0.25 + neon * 0.2;
    });
  });
  return (
    <group position={position}>
      {Array.from({ length: count }, (_, i) => (
        <mesh
          key={i}
          position-x={-width / 2 + (i + 0.5) * (width / count)}
          userData={{ noBake: true }}
        >
          <sphereGeometry args={[0.022, 8, 6]} />
          <meshStandardMaterial
            ref={(m) => {
              refs.current[i] = m;
            }}
            color={CLUB.amber}
            emissive={CLUB.amber}
            emissiveIntensity={0.6}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// ── 直立街機（星際巡航、磚塊爆破） ─────────────────────

function Cabinet({ m, body, trim }: { m: ArcadeMachine; body: string; trim: string }) {
  const { w, d } = m;
  const spec = ARCADE_SPECS[m.game];
  return (
    <group>
      {/* 機身：下半直、上半往後收 */}
      <Rounded
        size={[w, 0.95, d]}
        position={[0, 0.475, 0]}
        color={body}
        radius={0.04}
        roughness={0.55}
      />
      <Rounded
        size={[w, 0.8, d * 0.6]}
        position={[0, 1.33, -d * 0.2]}
        color={body}
        radius={0.04}
        roughness={0.55}
      />
      {/* 側板飾條 */}
      {[-1, 1].map((s) => (
        <Rounded
          key={s}
          size={[0.03, 1.72, d + 0.02]}
          position={[(s * (w + 0.03)) / 2, 0.86, 0]}
          color={trim}
          radius={0.01}
          emissive={trim}
          emissiveIntensity={0.35}
        />
      ))}
      {/* 操作台：斜面、搖桿、按鈕 */}
      <Rounded
        size={[w - 0.04, 0.06, 0.32]}
        position={[0, 0.98, d / 2 - 0.12]}
        rotation={[0.25, 0, 0]}
        color="#1c1a26"
        radius={0.02}
      />
      <mesh position={[-w * 0.22, 1.06, d / 2 - 0.12]}>
        <cylinderGeometry args={[0.012, 0.012, 0.1, 8]} />
        <meshStandardMaterial color="#202020" />
      </mesh>
      <mesh position={[-w * 0.22, 1.12, d / 2 - 0.12]}>
        <sphereGeometry args={[0.03, 12, 10]} />
        <meshStandardMaterial color={CLUB.neonRed} roughness={0.35} />
      </mesh>
      {[0.05, 0.15, 0.25].map((x, i) => (
        <mesh key={x} position={[x * w, 1.025, d / 2 - 0.1]} rotation={[0.25, 0, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.02, 12]} />
          <meshStandardMaterial color={[CLUB.amber, CLUB.cyan, CLUB.neonRed][i]} roughness={0.35} />
        </mesh>
      ))}
      {/* 投幣口 */}
      <Rounded
        size={[0.16, 0.2, 0.02]}
        position={[0, 0.55, d / 2 + 0.005]}
        color="#2a2733"
        radius={0.01}
      />
      <Glow
        size={[0.03, 0.08, 0.01]}
        position={[0, 0.57, d / 2 + 0.018]}
        color={CLUB.neonRed}
        base={0.6}
        strength={0.6}
      />
      {/* 螢幕框 */}
      <Rounded
        size={[w - 0.08, 0.62, 0.05]}
        position={[0, 1.34, d * 0.1 + 0.005]}
        rotation={[-0.12, 0, 0]}
        color="#111018"
        radius={0.02}
      />
      {/* 招牌燈箱 */}
      <Rounded
        size={[w, 0.26, d * 0.5]}
        position={[0, 1.86, -d * 0.15]}
        color={body}
        radius={0.03}
      />
      <Sign
        text={spec.title}
        size={[w - 0.08, 0.2]}
        position={[0, 1.86, d * 0.1 + 0.005]}
        bg={CLUB.navy}
        fg={trim}
        border={trim}
        glow={0.9}
      />
    </group>
  );
}

// ── 夾娃娃機 ───────────────────────────────────────────

const PLUSH_COLORS = ['#c48a5a', '#f3e6e8', '#f6d55c', '#f08fb0', '#fbf4e8', '#8fd0d6', '#c9a7e8'];

function ClawMachine({ m }: { m: ArcadeMachine }) {
  const { w, d } = m;
  const plush = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        p: [
          -w / 2 + 0.3 + ((i * 0.37) % (w - 0.42)),
          0.92 + (i % 3) * 0.07,
          -d / 2 + 0.15 + ((i * 0.53) % (d - 0.3)),
        ] as V3,
        c: PLUSH_COLORS[i % PLUSH_COLORS.length]!,
        r: 0.07 + (i % 3) * 0.015,
      })),
    [w, d],
  );
  return (
    <group>
      {/* 下座 */}
      <Rounded
        size={[w, 0.85, d]}
        position={[0, 0.425, 0]}
        color="#f08fb0"
        radius={0.04}
        roughness={0.5}
      />
      <Rounded
        size={[w + 0.02, 0.06, d + 0.02]}
        position={[0, 0.86, 0]}
        color="#ffffff"
        radius={0.02}
      />
      {/* 出貨口與投幣口 */}
      <Rounded
        size={[0.3, 0.26, 0.04]}
        position={[-w / 2 + 0.24, 0.3, d / 2 + 0.01]}
        color="#2a1a2a"
        radius={0.02}
      />
      <Rounded
        size={[0.22, 0.16, 0.06]}
        position={[w * 0.18, 0.75, d / 2 + 0.02]}
        color="#2a2733"
        radius={0.02}
      />
      {/* 搖桿與按鈕（在下座的前緣） */}
      <mesh position={[w * 0.12, 0.95, d / 2 - 0.06]}>
        <sphereGeometry args={[0.028, 12, 10]} />
        <meshStandardMaterial color={CLUB.neonRed} roughness={0.35} />
      </mesh>
      <mesh position={[w * 0.12, 0.91, d / 2 - 0.06]}>
        <cylinderGeometry args={[0.01, 0.01, 0.07, 8]} />
        <meshStandardMaterial color="#202020" />
      </mesh>
      <mesh position={[w * 0.3, 0.9, d / 2 - 0.06]}>
        <cylinderGeometry args={[0.03, 0.03, 0.03, 14]} />
        <meshStandardMaterial color={CLUB.amber} roughness={0.35} />
      </mesh>
      {/* 娃娃堆 */}
      {plush.map((x, i) => (
        <mesh key={i} position={x.p} castShadow>
          <sphereGeometry args={[x.r, 12, 10]} />
          <meshStandardMaterial color={x.c} roughness={0.95} />
        </mesh>
      ))}
      {/* 出貨口隔板 */}
      <mesh position={[-w / 2 + 0.24, 1.05, d / 2 - 0.2]}>
        <boxGeometry args={[0.32, 0.3, 0.32]} />
        <meshStandardMaterial color="#d6f0f2" transparent opacity={0.3} roughness={0.1} />
      </mesh>
      {/* 四根立柱 + 玻璃 */}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz]) => (
        <Rounded
          key={`${sx}${sz}`}
          size={[0.05, 0.9, 0.05]}
          position={[(sx! * (w - 0.05)) / 2, 1.34, (sz! * (d - 0.05)) / 2]}
          color="#ffffff"
          radius={0.015}
        />
      ))}
      <mesh position={[0, 1.34, 0]} userData={{ noBake: true }} renderOrder={3}>
        <boxGeometry args={[w - 0.04, 0.9, d - 0.04]} />
        <meshStandardMaterial
          color="#cfe9ef"
          transparent
          opacity={0.14}
          roughness={0.05}
          metalness={0.1}
          depthWrite={false}
        />
      </mesh>
      {/* 天車與爪子 */}
      <Rounded
        size={[w - 0.1, 0.03, 0.04]}
        position={[0, 1.74, 0.05]}
        color="#9aa0ad"
        radius={0.01}
        metalness={0.6}
        roughness={0.35}
      />
      <mesh position={[0.1, 1.55, 0.05]}>
        <cylinderGeometry args={[0.004, 0.004, 0.36, 4]} />
        <meshStandardMaterial color="#c9ccd6" />
      </mesh>
      <mesh position={[0.1, 1.36, 0.05]}>
        <cylinderGeometry args={[0.04, 0.03, 0.06, 10]} />
        <meshStandardMaterial color="#c9ccd6" metalness={0.7} roughness={0.3} />
      </mesh>
      {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((a) => (
        <mesh
          key={a}
          position={[0.1 + Math.sin(a) * 0.04, 1.29, 0.05 + Math.cos(a) * 0.04]}
          rotation={[Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5]}
        >
          <boxGeometry args={[0.012, 0.1, 0.012]} />
          <meshStandardMaterial color="#c9ccd6" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      {/* 頂蓋與招牌 */}
      <Rounded
        size={[w, 0.22, d]}
        position={[0, 1.9, 0]}
        color="#f08fb0"
        radius={0.04}
        roughness={0.5}
      />
      <Sign
        text="夾娃娃"
        size={[w - 0.16, 0.17]}
        position={[0, 1.9, d / 2 + 0.006]}
        bg="#fff4f8"
        fg={CLUB.neonRed}
        border="#f08fb0"
        glow={0.9}
      />
    </group>
  );
}

// ── 打地鼠 ─────────────────────────────────────────────

function MoleMachine({ m }: { m: ArcadeMachine }) {
  const { w, d } = m;
  const heads = useRef<({ position: { y: number } } | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    heads.current.forEach((h, i) => {
      if (!h) return;
      const k = Math.max(0, Math.sin(t * 1.7 + i * 2.1));
      h.position.y = 0.86 + k * k * 0.1;
    });
  });
  const holes = useMemo(
    () =>
      Array.from(
        { length: 9 },
        (_, i) =>
          [((i % 3) - 1) * w * 0.28, (Math.floor(i / 3) - 1) * d * 0.25 + 0.06] as [number, number],
      ),
    [w, d],
  );
  return (
    <group>
      <Rounded
        size={[w, 0.82, d]}
        position={[0, 0.41, 0]}
        color="#3f7a52"
        radius={0.05}
        roughness={0.6}
      />
      <Rounded
        size={[w + 0.04, 0.05, d + 0.04]}
        position={[0, 0.84, 0]}
        color={CLUB.amber}
        radius={0.02}
      />
      {/* 九個洞 */}
      {holes.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.868, z]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.09, 18]} />
          <meshStandardMaterial color="#20160f" />
        </mesh>
      ))}
      {/* 冒出來的地鼠（會動，不合併） */}
      {holes.map(([x, z], i) =>
        i % 3 === 1 || i === 6 ? (
          <mesh
            key={i}
            ref={(h) => {
              heads.current[i] = h;
            }}
            position={[x, 0.9, z]}
            userData={{ noBake: true }}
            castShadow
          >
            <sphereGeometry args={[0.07, 14, 10]} />
            <meshStandardMaterial color={i === 6 ? '#f2c14e' : '#9a6b4a'} roughness={0.8} />
          </mesh>
        ) : null,
      )}
      {/* 槌子 */}
      <group position={[w / 2 - 0.12, 0.92, d / 2 - 0.12]} rotation={[0, 0.6, Math.PI / 2]}>
        <mesh>
          <cylinderGeometry args={[0.018, 0.018, 0.3, 8]} />
          <meshStandardMaterial color="#e8d3a8" />
        </mesh>
        <mesh position-y={0.17} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.05, 0.05, 0.13, 14]} />
          <meshStandardMaterial color={CLUB.neonRed} roughness={0.5} />
        </mesh>
      </group>
      {/* 背板招牌（低於窗台，不擋到左牆的窗） */}
      <Rounded
        size={[w, 0.42, 0.08]}
        position={[0, 1.05, -d / 2 + 0.04]}
        color="#3f7a52"
        radius={0.03}
      />
      <Sign
        text="敲敲地鼠"
        size={[w - 0.12, 0.3]}
        position={[0, 1.05, -d / 2 + 0.085]}
        bg={CLUB.cream}
        fg="#3f7a52"
        border={CLUB.amber}
        glow={0.7}
      />
    </group>
  );
}

// ── 投籃機 ─────────────────────────────────────────────

function HoopsMachine({ m }: { m: ArcadeMachine }) {
  // 投籃機的「w」是球道長度（沿著局部 z），「d」是寬
  const len = m.w;
  const wid = m.d;
  const back = -len / 2;
  return (
    <group>
      {/* 前面的投球台 */}
      <Rounded
        size={[wid, 0.8, 0.5]}
        position={[0, 0.4, len / 2 - 0.25]}
        color="#c4472f"
        radius={0.04}
        roughness={0.5}
      />
      {/* 球道：往後上斜 */}
      <Rounded
        size={[wid - 0.06, 0.06, len - 0.5]}
        position={[0, 0.82, -0.25]}
        rotation={[0.08, 0, 0]}
        color="#b5763f"
        radius={0.02}
        roughness={0.6}
      />
      {[-1, 1].map((s) => (
        <Rounded
          key={s}
          size={[0.06, 0.95, len - 0.5]}
          position={[(s * (wid - 0.06)) / 2, 0.5, -0.25]}
          color="#c4472f"
          radius={0.02}
        />
      ))}
      {/* 球道上的球 */}
      {[-0.25, 0, 0.25].map((x, i) => (
        <mesh key={x} position={[x, 0.95, len / 2 - 0.35 - i * 0.06]} castShadow>
          <sphereGeometry args={[0.1, 16, 12]} />
          <meshStandardMaterial color="#e8743b" roughness={0.7} />
        </mesh>
      ))}
      {/* 兩側的護網（半透明） */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[(s * (wid - 0.04)) / 2, 1.75, -0.4]}
          rotation-y={Math.PI / 2}
          userData={{ noBake: true }}
        >
          <planeGeometry args={[len - 0.8, 1.2]} />
          <meshStandardMaterial
            color="#ffffff"
            transparent
            opacity={0.12}
            side={2}
            depthWrite={false}
          />
        </mesh>
      ))}
      {/* 背板立柱、籃板與籃框 */}
      <Rounded
        size={[wid, 2.4, 0.12]}
        position={[0, 1.2, back + 0.06]}
        color="#2a3550"
        radius={0.03}
      />
      <Rounded
        size={[0.7, 0.5, 0.03]}
        position={[0, 2.05, back + 0.14]}
        color="#f6efdc"
        radius={0.02}
        roughness={0.3}
      />
      <mesh position={[0, 1.95, back + 0.155]}>
        <boxGeometry args={[0.24, 0.18, 0.005]} />
        <meshStandardMaterial color={CLUB.neonRed} />
      </mesh>
      <mesh position={[0, 1.84, back + 0.33]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.17, 0.012, 8, 24]} />
        <meshStandardMaterial color={CLUB.neonRed} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.72, back + 0.33]} userData={{ noBake: true }}>
        <cylinderGeometry args={[0.17, 0.11, 0.22, 14, 1, true]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.5} side={2} wireframe />
      </mesh>
      {/* 頂上的招牌與分數板 */}
      <Rounded
        size={[wid, 0.36, 0.14]}
        position={[0, 2.52, back + 0.08]}
        color="#c4472f"
        radius={0.03}
      />
      <Sign
        text="街頭投籃"
        size={[wid - 0.1, 0.26]}
        position={[0, 2.52, back + 0.156]}
        bg={CLUB.navy}
        fg={CLUB.amber}
        border={CLUB.neonRed}
        glow={1}
      />
      <Bulbs count={9} width={wid - 0.1} position={[0, 2.73, back + 0.14]} />
    </group>
  );
}

/** 投籃機前台的分數螢幕：放在 Bake 外面才能更新 */
function HoopsScreen({ m }: { m: ArcadeMachine }) {
  return (
    <Screen
      game="hoops"
      size={[0.36, 0.48]}
      position={[0, 1.02, m.w / 2 - 0.02]}
      rotation={[-0.5, 0, 0]}
    />
  );
}

/** 1F 左牆與玄關的遊樂機台；點機台會走過去 */
export function Arcade({
  onSelect,
}: {
  onSelect: (id: string) => (e: ThreeEvent<MouseEvent>) => void;
}) {
  const quality = useQuality();
  return (
    <group>
      <Bake deps={[quality]}>
        {ARCADE_MACHINES.map((m) => (
          <group
            key={m.game}
            position={[m.at[0], 0, m.at[1]]}
            rotation-y={m.facing}
            onClick={onSelect(`arcade-${m.game}`)}
          >
            {m.game === 'claw' && <ClawMachine m={m} />}
            {m.game === 'mole' && <MoleMachine m={m} />}
            {m.game === 'blaster' && <Cabinet m={m} body="#2c3a63" trim={CLUB.cyan} />}
            {m.game === 'bricks' && <Cabinet m={m} body="#4a2e6b" trim="#c9a7e8" />}
            {m.game === 'hoops' && <HoopsMachine m={m} />}
          </group>
        ))}
      </Bake>
      {/* 會動的螢幕放在 Bake 外面 */}
      {ARCADE_MACHINES.map((m) => (
        <group
          key={m.game}
          position={[m.at[0], 0, m.at[1]]}
          rotation-y={m.facing}
          onClick={onSelect(`arcade-${m.game}`)}
        >
          {(m.game === 'blaster' || m.game === 'bricks') && (
            <Screen
              game={m.game}
              size={[m.w - 0.16, 0.52]}
              position={[0, 1.345, m.d * 0.1 + 0.034]}
              rotation={[-0.12, 0, 0]}
            />
          )}
          {m.game === 'hoops' && <HoopsScreen m={m} />}
        </group>
      ))}
    </group>
  );
}
