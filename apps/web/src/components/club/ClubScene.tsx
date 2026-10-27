'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import {
  Color,
  Fog,
  Vector3,
  type DirectionalLight,
  type Group,
  type HemisphereLight,
} from 'three';
import { Character, PLAYER_OUTFIT, animateWalk } from './Character';
import { gameHourAt, lightingAt } from './clock';
import {
  INTERACTABLES,
  WALK_SPEED,
  findPath,
  isInside,
  nearestInteractable,
  slide,
  type Vec2,
} from './layout';
import { MahjongHall } from './MahjongHall';
import { NeonContext, Street } from './Street';
import { player, useClub } from './store';

/** 目前按住的方向鍵 */
const held = new Set<string>();
const KEY_DIRS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

/** 點地面或點物件：走過去 */
export function walkTo(target: Vec2): void {
  if (useClub.getState().mode !== 'walk') return;
  player.path = findPath(player.pos, target);
}

function DayNight({ hour, children }: { hour?: number; children: ReactNode }) {
  const scene = useThree((s) => s.scene);
  const sun = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const [neon, setNeon] = useState(1);

  useEffect(() => {
    const apply = () => {
      const l = lightingAt(hour ?? gameHourAt(Date.now()));
      const sky = new Color(...l.sky);
      scene.background = sky;
      scene.fog = new Fog(new Color(...l.fog), 32, 80);
      if (sun.current) {
        const c = Math.cos(l.sunElevation);
        sun.current.position.set(
          c * Math.cos(l.sunAzimuth) * 30,
          Math.sin(l.sunElevation) * 30,
          c * Math.sin(l.sunAzimuth) * 30,
        );
        sun.current.color.setRGB(...l.sun);
        sun.current.intensity = l.sunIntensity;
      }
      if (hemi.current) {
        hemi.current.color.setRGB(...l.hemiSky);
        hemi.current.groundColor.setRGB(...l.hemiGround);
        hemi.current.intensity = l.hemiIntensity;
      }
      setNeon(Math.round(l.neon * 20) / 20);
    };
    apply();
    // CLUB_ART_BIBLE §5.2：每 5 秒更新一次就夠
    const id = setInterval(apply, 5000);
    return () => clearInterval(id);
  }, [hour, scene]);

  return (
    <NeonContext.Provider value={neon}>
      <directionalLight ref={sun} />
      <hemisphereLight ref={hemi} />
      {/* 只給金屬一點反光（招牌框、鐵捲門、電梯門），不載入外部 HDR */}
      <Environment resolution={64} frames={1} environmentIntensity={0.45}>
        <Lightformer intensity={1.5} position={[0, 6, 8]} scale={[16, 6, 1]} />
        <Lightformer intensity={0.8} color="#F2B552" position={[-8, 3, -2]} scale={[6, 4, 1]} />
      </Environment>
      {children}
    </NeonContext.Provider>
  );
}

/** 依方向鍵或點地面的路徑走 h 秒；有移動回傳 true */
function stepPlayer(h: number): boolean {
  let mx = 0;
  let mz = 0;
  for (const k of held) {
    mx += KEY_DIRS[k]![0];
    mz += KEY_DIRS[k]![1];
  }
  let dx = 0;
  let dz = 0;
  const step = WALK_SPEED * h;
  if (mx || mz) {
    player.path = [];
    const len = Math.hypot(mx, mz);
    dx = (mx / len) * step;
    dz = (mz / len) * step;
  } else if (player.path.length > 0) {
    const [tx, tz] = player.path[0]!;
    const ox = tx - player.pos[0];
    const oz = tz - player.pos[1];
    const dist = Math.hypot(ox, oz);
    if (dist <= step) {
      dx = ox;
      dz = oz;
      player.path.shift();
    } else {
      dx = (ox / dist) * step;
      dz = (oz / dist) * step;
    }
  }
  if (!dx && !dz) return false;
  const next = slide(player.pos, dx, dz);
  const moved = Math.hypot(next[0] - player.pos[0], next[1] - player.pos[1]);
  // 尋路時被擋住（例如路線貼著牆角）就放棄這條路
  if (moved < step * 0.2 && player.path.length > 0) player.path = [];
  if (moved <= 1e-4) return false;
  player.yaw = Math.atan2(dx, dz);
  player.pos = [next[0], next[1]];
  return true;
}

function Player() {
  const ref = useRef<Group>(null);
  const visible = useClub((s) => s.mode !== 'seated');
  const walk = useRef(0);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!(e.code in KEY_DIRS)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select')) return;
      if (useClub.getState().mode !== 'walk') return;
      e.preventDefault();
      held.add(e.code);
    };
    const up = (e: KeyboardEvent) => held.delete(e.code);
    const clear = () => held.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      held.clear();
    };
  }, []);

  useFrame((state, delta) => {
    const g = ref.current;
    if (!g) return;
    const dt = Math.min(delta, 0.1);
    const club = useClub.getState();
    let moving = false;

    if (club.mode === 'walk') {
      // 幀率低時分成小步走，速度不變也不會穿牆
      let left = Math.min(delta, 0.3);
      while (left > 1e-6) {
        const h = Math.min(left, 0.05);
        left -= h;
        if (stepPlayer(h)) moving = true;
      }
      club.setNearby(nearestInteractable(player.pos));
      club.setInside(isInside(player.pos));
    }

    player.moving = moving;
    g.position.set(player.pos[0], 0, player.pos[1]);
    // 轉身取最短角度
    let diff = player.yaw - g.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    g.rotation.y += diff * Math.min(1, dt * 14);
    walk.current += ((moving ? 1 : 0) - walk.current) * Math.min(1, dt * 10);
    animateWalk(g, state.clock.elapsedTime, walk.current);
  });

  return (
    <group visible={visible}>
      <Character ref={ref} outfit={PLAYER_OUTFIT} />
    </group>
  );
}

/** 開場鏡頭：街口斜角看整棟樓與直立招牌 */
const TITLE_POS = new Vector3(-6.5, 1.9, 12.6);
const TITLE_LOOK = new Vector3(2, 6.4, 0);
const INTRO_SECONDS = 2;

function CameraRig() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const look = useRef(TITLE_LOOK.clone());
  const intro = useRef<{ t: number; fromPos: Vector3; fromLook: Vector3 } | null>(null);
  const tmpPos = useRef(new Vector3());
  const tmpLook = useRef(new Vector3());

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const { mode, inside } = useClub.getState();
    // 直向手機拉遠一點，左右才看得到桌子
    const far = size.width / Math.max(1, size.height) < 1 ? 1.45 : 1;
    const [px, pz] = player.pos;
    const followPos = tmpPos.current.set(
      px,
      (inside ? 7.4 : 5.6) * far,
      pz + (inside ? 6.2 : 7.6) * far,
    );
    const followLook = tmpLook.current.set(px, 0.9, pz - (inside ? 0.8 : 1.6));

    if (mode === 'title') {
      intro.current = null;
      const sway = Math.sin(state.clock.elapsedTime * 0.15) * 0.8;
      camera.position.set(TITLE_POS.x + sway, TITLE_POS.y, TITLE_POS.z);
      look.current.copy(TITLE_LOOK);
    } else if (mode === 'intro') {
      if (!intro.current) {
        intro.current = { t: 0, fromPos: camera.position.clone(), fromLook: look.current.clone() };
      }
      const it = intro.current;
      // 用真實經過時間（不夾 0.1 秒），低幀率時推鏡也是 2 秒左右
      it.t = Math.min(1, it.t + Math.min(delta, 0.5) / INTRO_SECONDS);
      const e = it.t < 0.5 ? 4 * it.t ** 3 : 1 - (-2 * it.t + 2) ** 3 / 2;
      camera.position.lerpVectors(it.fromPos, followPos, e);
      look.current.lerpVectors(it.fromLook, followLook, e);
      if (it.t >= 1) {
        intro.current = null;
        useClub.getState().setMode('walk');
      }
    } else {
      const k = 1 - Math.exp(-dt * 6);
      camera.position.lerp(followPos, k);
      look.current.lerp(followLook, k);
    }
    camera.lookAt(look.current);
  });
  return null;
}

/** 看不見的地面：點一下就走過去。範圍很大，點到樓上的牆時也會落在樓後方，角色就走進門裡 */
function ClickGround() {
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position-y={0.02}
      onClick={(e) => {
        e.stopPropagation();
        walkTo([e.point.x, e.point.z]);
      }}
    >
      <planeGeometry args={[400, 400]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function World({ hour }: { hour?: number }) {
  const inside = useClub((s) => s.inside);
  const select = (id: string) => {
    const it = INTERACTABLES.find((x) => x.id === id);
    if (it) walkTo(it.approach);
  };
  return (
    <DayNight hour={hour}>
      <Street inside={inside} />
      <MahjongHall onSelect={select} />
      <ClickGround />
      <Player />
      <CameraRig />
    </DayNight>
  );
}

const DPR = { low: [1, 1], medium: [1, 1.5], high: [1, 2] } as const;

export function ClubScene({
  hour,
  quality,
}: {
  hour?: number;
  quality: 'low' | 'medium' | 'high';
}) {
  const seated = useClub((s) => s.mode === 'seated');
  return (
    <Canvas
      dpr={[...DPR[quality]]}
      frameloop={seated ? 'never' : 'always'}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance' }}
      camera={{ fov: 42, near: 0.1, far: 140, position: TITLE_POS.toArray() }}
      style={{ touchAction: 'none' }}
      aria-label="暮光遊樂館街口"
    >
      <World hour={hour} />
    </Canvas>
  );
}
