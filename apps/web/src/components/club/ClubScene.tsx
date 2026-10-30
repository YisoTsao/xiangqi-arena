'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, Stars } from '@react-three/drei';
import {
  BackSide,
  Color,
  Fog,
  ShaderMaterial,
  Vector3,
  type DirectionalLight,
  type Group,
  type HemisphereLight,
  type PerspectiveCamera,
} from 'three';
import { Character, PLAYER_OUTFIT, animateWalk } from './Character';
import { useInteriorWindowClock } from './InteriorWindow';
import { gameHourAt, lightingAt } from './clock';
import { Effects } from './Effects';
import {
  CAMERA_YAW,
  INTERACTABLES,
  WALK_SPEED,
  inputToWorld,
  isInside,
  nearestInteractable,
  slide,
  type Vec2,
} from './layout';
import { MahjongHall } from './MahjongHall';
import { NeonContext, QualityContext, useQuality, type Quality } from './props';
import { Street } from './Street';
import { player, useClub, walkTo } from './store';

/** 鏡頭目前的水平角度（平滑過的），方向鍵依它轉換 */
const view = { yaw: CAMERA_YAW.outside };

/**
 * 方向鍵：記下每個鍵按下的時間，放開時把「這一格裡按住的時間」留給下一格結算。
 * 這樣幀率很低時，按一下不到一格的時間也會走對應的距離。
 */
const held = new Map<string, number>();
const tapped: { code: string; ms: number }[] = [];

/** 本格的平均輸入（每軸 -1～1，長度最多 1） */
function keyInput(now: number, frameMs: number): [number, number] {
  let mx = 0;
  let mz = 0;
  const from = now - frameMs;
  for (const [code, at] of held) {
    const t = Math.min(1, (now - Math.max(at, from)) / frameMs);
    mx += KEY_DIRS[code]![0] * t;
    mz += KEY_DIRS[code]![1] * t;
  }
  for (const { code, ms } of tapped) {
    const t = Math.min(1, ms / frameMs);
    mx += KEY_DIRS[code]![0] * t;
    mz += KEY_DIRS[code]![1] * t;
  }
  tapped.length = 0;
  const len = Math.hypot(mx, mz);
  return len > 1 ? [mx / len, mz / len] : [mx, mz];
}

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

/** 漸層天空罩：上方天色、地平線霧色；跟著日夜時鐘換色（backdrop，不參與光照） */
function SkyDome({ top, bottom }: { top: Color; bottom: Color }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uTop: { value: new Color() }, uBottom: { value: new Color() } },
        vertexShader: `varying float vH;
          void main() {
            vH = normalize(position).y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `uniform vec3 uTop; uniform vec3 uBottom; varying float vH;
          void main() {
            float t = smoothstep(-0.05, 0.55, vH);
            gl_FragColor = vec4(mix(uBottom, uTop, t), 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  useEffect(() => {
    material.uniforms.uTop!.value.copy(top);
    material.uniforms.uBottom!.value.copy(bottom);
  }, [material, top, bottom]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh material={material} renderOrder={-1}>
      <sphereGeometry args={[130, 32, 16]} />
    </mesh>
  );
}

/** 太陽陰影相機的半寬（公尺） */
const SHADOW_HALF = 15;

/**
 * 依時段重建的環境貼圖（PMREM）：天空、地平線、兩側店面的暖光帶與霓虹色塊。
 * PBR 材質的反射與漫射環境光都從這裡來，所以積水、櫥窗玻璃、金屬招牌框映出的是「這條街此刻」的顏色，
 * 不是一張不相干的 HDR。只在時段明顯改變時重建（約 1/20 霓虹亮度一階），平常不花成本。
 */
function SceneProbe({ sky, horizon, neon }: { sky: Color; horizon: Color; neon: number }) {
  const key = `${sky.getHexString()}${horizon.getHexString()}${neon}`;
  return (
    // 夜晚整體環境光收一點，讓立面暗下來、窗光與招牌跳出來；霓虹色塊本身夠亮，反射仍看得到
    <Environment
      key={key}
      resolution={128}
      frames={1}
      environmentIntensity={0.6 * (1 - 0.5 * neon)}
    >
      <mesh scale={60}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshBasicMaterial color={horizon} side={BackSide} toneMapped={false} />
      </mesh>
      <Lightformer
        form="rect"
        color={sky}
        intensity={1.4}
        position={[0, 25, 0]}
        rotation-x={Math.PI / 2}
        scale={[80, 80, 1]}
      />
      {/* 俱樂部這一側的騎樓暖光（從街上看在 -z） */}
      <Lightformer
        color="#ffb870"
        intensity={0.4 + neon * 2.4}
        position={[0, 1.6, -7]}
        scale={[50, 2.4, 1]}
      />
      {/* 對面店家（鏡頭背後）的燈 */}
      <Lightformer
        color="#ffd2a0"
        intensity={0.2 + neon * 1.2}
        position={[0, 1.8, 12]}
        rotation-y={Math.PI}
        scale={[50, 2, 1]}
      />
      {neon > 0.05 && (
        <>
          <Lightformer
            color="#E95B4B"
            intensity={neon * 3}
            position={[-3, 4.5, -6]}
            scale={[7, 1.6, 1]}
          />
          <Lightformer
            color="#8552B8"
            intensity={neon * 2}
            position={[5, 8, -6]}
            scale={[3, 1, 1]}
          />
          <Lightformer
            color="#5CC2C9"
            intensity={neon * 1.2}
            position={[-12, 3, -6]}
            scale={[3, 1, 1]}
          />
        </>
      )}
    </Environment>
  );
}

function InteriorClock({ sky }: { sky: Color }) {
  useInteriorWindowClock(sky);
  return null;
}

function DayNight({ hour, children }: { hour?: number; children: ReactNode }) {
  const scene = useThree((s) => s.scene);
  const quality = useQuality();
  const inside = useClub((s) => s.inside);
  const sun = useRef<DirectionalLight>(null);
  const sunDir = useRef(new Vector3(0, 1, 0));
  const hemi = useRef<HemisphereLight>(null);
  const [neon, setNeon] = useState(1);
  const [sky, setSky] = useState(() => ({ top: new Color(), bottom: new Color() }));

  useEffect(() => {
    const apply = () => {
      const l = lightingAt(hour ?? gameHourAt(Date.now()));
      const fog = new Color(...l.fog);
      scene.background = fog;
      // 室內時遠景淡一點，讓暖色牌桌區跳出來
      scene.fog = new Fog(fog, inside ? 26 : 36, inside ? 70 : 95);
      setSky({ top: new Color(...l.sky), bottom: fog });
      // 進到室內：屋頂擋住天光（剖面圖拿掉了屋頂，用降低室外光代替），主光換成桌燈
      const dim = inside ? 0.22 : 1;
      if (sun.current) {
        const c = Math.cos(l.sunElevation);
        sunDir.current.set(
          c * Math.cos(l.sunAzimuth),
          Math.sin(l.sunElevation),
          c * Math.sin(l.sunAzimuth),
        );
        sun.current.color.setRGB(...l.sun);
        sun.current.intensity = l.sunIntensity * dim;
      }
      if (hemi.current) {
        hemi.current.color.setRGB(...l.hemiSky);
        hemi.current.groundColor.setRGB(...l.hemiGround);
        hemi.current.intensity = l.hemiIntensity * (inside ? 0.4 : 0.75);
      }
      setNeon(Math.round(l.neon * 20) / 20);
    };
    apply();
    // CLUB_ART_BIBLE §5.2：每 5 秒更新一次就夠
    const id = setInterval(apply, 5000);
    return () => clearInterval(id);
  }, [hour, scene, inside]);

  // 陰影相機跟著角色走（以 texel 為單位對齊，移動時陰影邊緣不閃），範圍小一點換取較細的陰影
  useFrame(() => {
    const l = sun.current;
    if (!l) return;
    const texel = (SHADOW_HALF * 2) / l.shadow.mapSize.x;
    const cx = Math.round(player.pos[0] / texel) * texel;
    const cz = Math.round((player.pos[1] - 2) / texel) * texel;
    l.target.position.set(cx, 0, cz);
    l.position.set(cx, 0, cz).addScaledVector(sunDir.current, 30);
    l.target.updateMatrixWorld();
  });

  const shadows = quality !== 'low';
  return (
    <NeonContext.Provider value={neon}>
      <SkyDome top={sky.top} bottom={sky.bottom} />
      {neon > 0.4 && quality !== 'low' && (
        <Stars radius={110} depth={10} count={900} factor={3} fade speed={0.4} />
      )}
      <directionalLight
        ref={sun}
        castShadow={shadows}
        shadow-mapSize={quality === 'high' ? [2048, 2048] : [1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-SHADOW_HALF}
        shadow-camera-right={SHADOW_HALF}
        shadow-camera-top={SHADOW_HALF}
        shadow-camera-bottom={-SHADOW_HALF}
        shadow-camera-far={80}
      />
      <hemisphereLight ref={hemi} />
      {quality !== 'low' && <SceneProbe sky={sky.top} horizon={sky.bottom} neon={neon} />}
      <InteriorClock sky={sky.top} />
      {children}
    </NeonContext.Provider>
  );
}

/** 依方向鍵或點地面的路徑走 h 秒；有移動回傳 true */
function stepPlayer(h: number, [mx, mz]: [number, number]): boolean {
  let dx = 0;
  let dz = 0;
  const step = WALK_SPEED * h;
  if (mx || mz) {
    player.path = [];
    const amount = Math.min(1, Math.hypot(mx, mz));
    const [wx, wz] = inputToWorld(mx, mz, view.yaw);
    dx = wx * step * amount;
    dz = wz * step * amount;
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
  const lastFrameAt = useRef(0);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!(e.code in KEY_DIRS)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select')) return;
      if (useClub.getState().mode !== 'walk') return;
      e.preventDefault();
      if (!held.has(e.code)) held.set(e.code, performance.now());
    };
    const up = (e: KeyboardEvent) => {
      const at = held.get(e.code);
      if (at === undefined) return;
      held.delete(e.code);
      // 這一格開始後才按住的那段時間，留給下一格結算
      const since = Math.max(at, lastFrameAt.current);
      tapped.push({ code: e.code, ms: performance.now() - since });
    };
    const clear = () => {
      held.clear();
      tapped.length = 0;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      clear();
    };
  }, []);

  useFrame((state, delta) => {
    const g = ref.current;
    if (!g) return;
    const dt = Math.min(delta, 0.1);
    const club = useClub.getState();
    let moving = false;

    const now = performance.now();
    const frame = Math.min(delta, 0.3);
    const input = keyInput(now, Math.max(1, frame * 1000));
    lastFrameAt.current = now;
    if (club.mode === 'walk') {
      // 幀率低時分成小步走，速度不變也不會穿牆
      let left = frame;
      while (left > 1e-6) {
        const h = Math.min(left, 0.05);
        left -= h;
        if (stepPlayer(h, input)) moving = true;
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

/**
 * 開場定鏡（ART_BIBLE_LOBBY §6.1）：站在對面人行道，前景是馬路、中景是俱樂部與左右店面、遠景是城市剪影。
 * 標題選單在桌機佔左側、在直向手機佔下半部，所以用 view offset 把畫面主體推到另一側，
 * 讓主招牌、直立招牌與入口完整落在選單之外，而不是把鏡頭轉歪。
 */
interface TitleShot {
  pos: Vector3;
  look: Vector3;
  fov: number;
  /** 畫面主體往右（+）／往上（+）推移的比例（相對畫面寬、高） */
  shiftX: number;
  shiftY: number;
}
const TITLE_WIDE: TitleShot = {
  pos: new Vector3(-3.2, 1.6, 23),
  look: new Vector3(1.2, 5.1, 0),
  fov: 40,
  shiftX: 0.17,
  shiftY: 0,
};
const TITLE_TALL: TitleShot = {
  pos: new Vector3(0.6, 1.5, 22),
  look: new Vector3(1.4, 5.6, 0),
  fov: 52,
  shiftX: 0,
  shiftY: 0.24,
};
const titleShot = (aspect: number) => (aspect < 0.9 ? TITLE_TALL : TITLE_WIDE);
const TITLE_POS = TITLE_WIDE.pos;
const INTRO_SECONDS = 2;

/**
 * 3/4 斜俯視跟隨鏡頭（約 45°）。室外拉遠、角度小，讓招牌入鏡；室內轉到斜角、略高，
 * 看進剖面娃娃屋。直向手機再拉遠一點。
 */
const FOLLOW = {
  outside: { dist: 7.4, height: 5.2, lookAhead: 1.8 },
  inside: { dist: 6.4, height: 6.6, lookAhead: 0.9 },
} as const;

const FOLLOW_FOV = 40;

/** 依開場構圖的比例 m 設定 fov 與 view offset；沒變就不重算投影矩陣 */
function applyFraming(
  camera: PerspectiveCamera,
  size: { width: number; height: number },
  shot: TitleShot,
  m: number,
) {
  const fov = FOLLOW_FOV + (shot.fov - FOLLOW_FOV) * m;
  const ox = -shot.shiftX * size.width * m;
  const oy = shot.shiftY * size.height * m;
  const v = camera.view;
  const same =
    Math.abs(camera.fov - fov) < 1e-3 &&
    (m < 1e-3 ? !v || !v.enabled : !!v && v.enabled && v.offsetX === ox && v.offsetY === oy);
  if (same) return;
  camera.fov = fov;
  if (m < 1e-3) camera.clearViewOffset();
  else camera.setViewOffset(size.width, size.height, ox, oy, size.width, size.height);
  camera.updateProjectionMatrix();
}

function CameraRig() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const look = useRef(TITLE_WIDE.look.clone());
  /** 0 = 跟隨鏡頭、1 = 開場構圖（view offset 與 fov 依它內插） */
  const titleMix = useRef(1);
  const intro = useRef<{ t: number; fromPos: Vector3; fromLook: Vector3 } | null>(null);
  const tmpPos = useRef(new Vector3());
  const tmpLook = useRef(new Vector3());

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const { mode, inside } = useClub.getState();
    const target = inside ? CAMERA_YAW.inside : CAMERA_YAW.outside;
    view.yaw += (target - view.yaw) * (mode === 'walk' ? 1 - Math.exp(-dt * 3) : 1);
    const f = inside ? FOLLOW.inside : FOLLOW.outside;
    const far = size.width / Math.max(1, size.height) < 1 ? 1.4 : 1;
    const [px, pz] = player.pos;
    const sy = Math.sin(view.yaw);
    const cy = Math.cos(view.yaw);
    const followPos = tmpPos.current.set(
      px + sy * f.dist * far,
      f.height * far,
      pz + cy * f.dist * far,
    );
    const followLook = tmpLook.current.set(px - sy * f.lookAhead, 0.9, pz - cy * f.lookAhead);
    const shot = titleShot(size.width / Math.max(1, size.height));

    if (mode === 'title') {
      intro.current = null;
      const sway = Math.sin(state.clock.elapsedTime * 0.15) * 0.6;
      camera.position.set(shot.pos.x + sway, shot.pos.y, shot.pos.z);
      look.current.copy(shot.look);
      titleMix.current = 1;
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
      titleMix.current = 1 - e;
      if (it.t >= 1) {
        intro.current = null;
        useClub.getState().setMode('walk');
      }
    } else {
      const k = 1 - Math.exp(-dt * 5);
      camera.position.lerp(followPos, k);
      look.current.lerp(followLook, k);
      titleMix.current = 0;
    }
    camera.lookAt(look.current);
    applyFraming(camera as PerspectiveCamera, size, shot, titleMix.current);
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
  const dbg = typeof window !== 'undefined' ? window.location.search : '';
  const select = (id: string) => {
    const it = INTERACTABLES.find((x) => x.id === id);
    if (it) walkTo(it.approach);
  };
  return (
    <DayNight hour={hour}>
      {!dbg.includes('nostreet') && <Street inside={inside} />}
      {!dbg.includes('nohall') && <MahjongHall onSelect={select} inside={inside} />}
      <ClickGround />
      <Player />
      <CameraRig />
    </DayNight>
  );
}

/** 網址加 ?perf=1 時，把 draw call、三角面與 FPS 掛到 window.__clubPerf（效能量測用） */
function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const frames = useRef({ n: 0, t0: 0 });
  const enabled = typeof window !== 'undefined' && window.location.search.includes('perf=1');
  useEffect(() => {
    if (!enabled) return;
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [enabled, gl]);
  // 在所有 useFrame 之前讀上一格的統計，再歸零
  useFrame(() => {
    if (!enabled) return;
    const f = frames.current;
    const now = performance.now();
    if (!f.t0) f.t0 = now;
    f.n++;
    // FPS 每 3 秒重算一次，避開一開始編譯 shader 的停頓
    const w = window as unknown as { __clubPerf?: { fps: number } };
    const fps = now - f.t0 > 3000 ? (f.n * 1000) / (now - f.t0) : (w.__clubPerf?.fps ?? 0);
    if (now - f.t0 > 3000) {
      f.t0 = now;
      f.n = 0;
    }
    w.__clubPerf = {
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0,
      fps,
    } as { fps: number };
    gl.info.reset();
  }, -1000);
  return null;
}

const DPR = { low: [1, 1], medium: [1, 1.5], high: [1, 2] } as const;

export function ClubScene({ hour, quality }: { hour?: number; quality: Quality }) {
  const seated = useClub((s) => s.mode === 'seated');
  return (
    <Canvas
      dpr={[...DPR[quality]]}
      frameloop={seated ? 'never' : 'always'}
      shadows={quality !== 'low'}
      flat={quality !== 'low'}
      // 高中畫質由後處理做抗鋸齒與色調映射；低畫質直接用 renderer 的 ACES
      gl={{
        antialias: quality === 'low',
        powerPreference: 'high-performance',
        stencil: false,
      }}
      // near 不設太小：手機的深度緩衝精度低，貼在地面與牆上的招牌、標線才不會深度打架而閃爍
      camera={{ fov: FOLLOW_FOV, near: 0.5, far: 300, position: TITLE_POS.toArray() }}
      // 手機網址列伸縮時不要每一格都重配畫布與後處理緩衝（重配那一格會清成空白）
      resize={{ debounce: 150 }}
      style={{ touchAction: 'none' }}
      aria-label="暮光遊樂館街口"
    >
      <QualityContext.Provider value={quality}>
        <World hour={hour} />
        <Effects />
        <PerfProbe />
      </QualityContext.Provider>
    </Canvas>
  );
}
