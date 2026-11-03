'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, Stars } from '@react-three/drei';
import {
  BackSide,
  Color,
  Fog,
  Scene,
  ShaderMaterial,
  Vector3,
  type DirectionalLight,
  type Group,
  type HemisphereLight,
  type Light,
  type PerspectiveCamera,
} from 'three';
import { Avatar } from './Avatar';
import { Character, PLAYER_OUTFIT } from './Character';
import { District, preloadDistrict } from './District';
import { ClubPresence } from './RemotePlayers';
import { useInteriorWindowClock } from './InteriorWindow';
import { gameHourAt, lightingAt } from './clock';
import { Effects } from './Effects';
import {
  CAMERA_YAW,
  OCCLUDERS_INSIDE,
  OCCLUDERS_OUTSIDE,
  RUN_MULTIPLIER,
  WALK_SPEED,
  floorY,
  inputToWorld,
  interactablesOf,
  isInsideSticky,
  nearestInteractable,
  slide,
  type Occluder,
  type Vec2,
} from './layout';
import { CardHall } from './CardHall';
import { MahjongHall } from './MahjongHall';
import { NeonContext, QualityContext, useQuality, type Quality } from './props';
import { Street } from './Street';
import { orbit, player, pointerGuard, stick, transition, useClub, walkTo } from './store';

export const ORBIT_LIMITS = { minPitch: 0.06, maxPitch: 1.38, minDist: 2.2, maxDist: 22 } as const;

function resetOrbit() {
  orbit.yaw = CAMERA_YAW.outside;
  orbit.pitch = 0.55;
  orbit.dist = 8.5;
}

// 街區的 GLB 一進頁面就開始下載（開場選單停留的時間通常就夠載完）
if (typeof window !== 'undefined') preloadDistrict();

/** Shift：跑步 */
const runKeys = new Set<string>();

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

/** 室內時牆外的背景：深色，不露出街景與天空 */
const INDOOR_BG = new Color('#120d0b');

/** 顏色分成每色 24 階，當重建環境貼圖的 key */
const coarse = (c: Color) =>
  `${Math.round(c.r * 24)},${Math.round(c.g * 24)},${Math.round(c.b * 24)};`;

/** 太陽陰影相機的半寬（公尺） */
const SHADOW_HALF = 15;

/**
 * 依時段重建的環境貼圖（PMREM）：天空、地平線、兩側店面的暖光帶與霓虹色塊。
 * PBR 材質的反射與漫射環境光都從這裡來，所以積水、櫥窗玻璃、金屬招牌框映出的是「這條街此刻」的顏色，
 * 不是一張不相干的 HDR。只在時段明顯改變時重建（約 1/20 霓虹亮度一階），平常不花成本。
 */
function SceneProbe({
  sky,
  horizon,
  neon,
  inside,
}: {
  sky: Color;
  horizon: Color;
  neon: number;
  inside: boolean;
}) {
  const scene = useThree((s) => s.scene);
  const floor = useClub((s) => s.floor);
  // 室外、室內兩張環境貼圖都一直掛著，各自畫到自己的暫存場景裡；進出門只是換掉 scene.environment。
  // 以前進門才卸掉街景貼圖、重新畫室內貼圖，而且兩張解析度不同（128／64），
  // 換貼圖時所有 PBR 材質的 shader 都要重新編譯，畫面會卡住一陣子才出現室內。
  const [outdoor] = useState(() => new Scene());
  const [hall] = useState(() => new Scene());
  // 天色每 5 秒都會微微變：顏色取粗一點的階再當 key，免得每 5 秒就重建一次環境貼圖（每次重建都會頓一下）
  const outKey = `${coarse(sky)}${coarse(horizon)}${neon}`;
  const hallKey = `${neon}${floor}`;
  useEffect(() => {
    const prev = { env: scene.environment, intensity: scene.environmentIntensity };
    return () => {
      scene.environment = prev.env;
      scene.environmentIntensity = prev.intensity;
    };
  }, [scene]);
  useFrame(() => {
    const src = inside ? hall : outdoor;
    if (src.environment && scene.environment !== src.environment)
      scene.environment = src.environment;
    scene.environmentIntensity = src.environmentIntensity;
  });
  return (
    <>
      {/* 夜晚整體環境光收一點，讓立面暗下來、窗光與招牌跳出來；霓虹色塊本身夠亮，反射仍看得到 */}
      <Environment
        key={outKey}
        scene={outdoor}
        resolution={PROBE_RES}
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
      <HallProbe
        key={hallKey}
        scene={hall}
        neon={neon}
        lamp={floor === 2 ? '#d8f0b0' : '#ffc878'}
      />
    </>
  );
}

/** 兩張環境貼圖用同一個解析度：轉成 PMREM 後尺寸相同，換貼圖時材質不用重新編譯 */
const PROBE_RES = 128;

/**
 * 1F 室內的環境貼圖：深木色的牆與地板、暖色天花、六盞桌燈的亮塊，和紙窗透進來的光
 * （白天暖白、夜晚冷藍）。漆面木頭、茶具、麻將牌映出的是室內的燈，而不是街上的天空。
 */
function HallProbe({ neon, lamp, scene }: { neon: number; lamp: string; scene: Scene }) {
  const night = neon > 0.5;
  return (
    <Environment scene={scene} resolution={PROBE_RES} frames={1} environmentIntensity={0.55}>
      <mesh scale={30}>
        <sphereGeometry args={[1, 24, 12]} />
        <meshBasicMaterial color="#3a2618" side={BackSide} toneMapped={false} />
      </mesh>
      <Lightformer
        form="rect"
        color="#ffd9a8"
        intensity={0.9}
        position={[0, 6, 0]}
        rotation-x={Math.PI / 2}
        scale={[20, 14, 1]}
      />
      {[-4, 0, 4].map((x) => (
        <Lightformer
          key={x}
          form="circle"
          color={lamp}
          intensity={3}
          position={[x, 4, -2]}
          rotation-x={Math.PI / 2}
          scale={1.4}
        />
      ))}
      <Lightformer
        color={night ? '#9cc4ff' : '#fff1d6'}
        intensity={night ? 0.8 : 1.6}
        position={[0, 2, -9]}
        scale={[14, 1.6, 1]}
      />
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
  const indoor = useClub((s) => s.inside || s.floor === 2);
  const rain = useClub((s) => s.weather === 'rain');
  const sun = useRef<DirectionalLight>(null);
  /** 室外的背景色（霧色）；室內換成深色，牆外不露出天空 */
  const outdoorBg = useRef(new Color());
  const sunDir = useRef(new Vector3(0, 1, 0));
  const hemi = useRef<HemisphereLight>(null);
  const [neon, setNeon] = useState(1);
  const [sky, setSky] = useState(() => ({ top: new Color(), bottom: new Color() }));

  /** 依時段算好的基準值；進出門的內插在每格的 useFrame 裡做 */
  const base = useRef({ sun: 0, hemiOut: 0, hemiIn: 0, fog: { near: [36, 26], far: [95, 70] } });

  useEffect(() => {
    const apply = () => {
      const l = lightingAt(hour ?? gameHourAt(Date.now()));
      const fog = new Color(...l.fog);
      const skyTop = new Color(...l.sky);
      if (rain) {
        // 雨天：雲層壓低、天色偏灰藍，遠景被雨霧吃掉
        const grey = new Color(0.32, 0.35, 0.4).lerp(new Color(0.07, 0.08, 0.12), l.neon);
        fog.lerp(grey, 0.7);
        skyTop.lerp(grey.clone().multiplyScalar(0.75), 0.75);
      }
      // 背景直接用這個 Color 物件（室內時換成 INDOOR_BG，見下方 effect）
      outdoorBg.current.copy(fog);
      // 室內時遠景淡一點，讓暖色牌桌區跳出來（[室外, 室內]）
      base.current.fog = rain
        ? { near: [18, 22], far: [62, 60] }
        : { near: [36, 26], far: [95, 70] };
      if (!(scene.fog instanceof Fog)) scene.fog = new Fog(fog, 36, 95);
      scene.fog.color.copy(fog);
      setSky({ top: skyTop, bottom: fog });
      if (sun.current) {
        const c = Math.cos(l.sunElevation);
        sunDir.current.set(
          c * Math.cos(l.sunAzimuth),
          Math.sin(l.sunElevation),
          c * Math.sin(l.sunAzimuth),
        );
        sun.current.color.setRGB(...l.sun);
      }
      base.current.sun = l.sunIntensity * (rain ? 0.35 : 1);
      if (hemi.current) {
        hemi.current.color.setRGB(...l.hemiSky);
        hemi.current.groundColor.setRGB(...l.hemiGround);
      }
      base.current.hemiOut = l.hemiIntensity * 0.75 * (rain ? 0.8 : 1);
      base.current.hemiIn = l.hemiIntensity * 0.4 * (rain ? 0.8 : 1);
      setNeon(Math.round(l.neon * 20) / 20);
    };
    apply();
    // CLUB_ART_BIBLE §5.2：每 5 秒更新一次就夠
    const id = setInterval(apply, 5000);
    return () => clearInterval(id);
  }, [hour, scene, rain]);

  useEffect(() => {
    scene.background = indoor ? INDOOR_BG : outdoorBg.current;
  }, [indoor, scene]);

  // 進出門：室外光與霧在約 0.6 秒內內插到室內值（屋頂擋住天光，剖面圖拿掉了屋頂，用降低室外光代替）
  useFrame((_, delta) => {
    const target = useClub.getState().inside ? 1 : 0;
    const t = transition;
    t.inside += (target - t.inside) * (1 - Math.exp(-Math.min(delta, 0.1) * 7));
    if (Math.abs(target - t.inside) < 1e-3) t.inside = target;
    const m = t.inside;
    const b = base.current;
    if (sun.current) sun.current.intensity = b.sun * (1 - 0.78 * m);
    if (hemi.current) hemi.current.intensity = b.hemiOut + (b.hemiIn - b.hemiOut) * m;
    if (scene.fog instanceof Fog) {
      scene.fog.near = b.fog.near[0]! + (b.fog.near[1]! - b.fog.near[0]!) * m;
      scene.fog.far = b.fog.far[0]! + (b.fog.far[1]! - b.fog.far[0]!) * m;
    }
  });

  // 陰影相機跟著角色走（以 texel 為單位對齊，移動時陰影邊緣不閃），範圍小一點換取較細的陰影
  useFrame(() => {
    const l = sun.current;
    if (!l) return;
    const texel = (SHADOW_HALF * 2) / l.shadow.mapSize.x;
    const cx = Math.round(player.pos[0] / texel) * texel;
    const cz = Math.round((player.pos[1] - 2) / texel) * texel;
    const y0 = floorY(useClub.getState().floor);
    l.target.position.set(cx, y0, cz);
    l.position.set(cx, y0, cz).addScaledVector(sunDir.current, 30);
    l.target.updateMatrixWorld();
  });

  const shadows = quality !== 'low';
  return (
    <NeonContext.Provider value={neon}>
      {/* 天空與星星沒有光源，室內直接藏起來即可 */}
      <group visible={!indoor}>
        <SkyDome top={sky.top} bottom={sky.bottom} />
        {neon > 0.4 && quality !== 'low' && !rain && (
          <Stars radius={110} depth={10} count={900} factor={3} fade speed={0.4} />
        )}
      </group>
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
      {quality !== 'low' && (
        <SceneProbe sky={sky.top} horizon={sky.bottom} neon={neon} inside={inside} />
      )}
      <InteriorClock sky={sky.top} />
      {children}
    </NeonContext.Provider>
  );
}

/** 依方向鍵或點地面的路徑走 h 秒；有移動回傳 true */
function stepPlayer(h: number, [mx, mz]: [number, number]): boolean {
  let dx = 0;
  let dz = 0;
  const step = WALK_SPEED * h * (player.running ? RUN_MULTIPLIER : 1);
  if (mx || mz) {
    player.path = [];
    const amount = Math.min(1, Math.hypot(mx, mz));
    const [wx, wz] = inputToWorld(mx, mz, orbit.yaw);
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
  const next = slide(player.pos, dx, dz, useClub.getState().floor);
  const moved = Math.hypot(next[0] - player.pos[0], next[1] - player.pos[1]);
  // 尋路時被擋住（例如路線貼著牆角）就放棄這條路。要和「這一步本來要走多遠」比，
  // 不能和整步的長度比：剛好抵達中途點時剩下的距離很短，會被誤判成卡住而停在半路。
  const wanted = Math.hypot(dx, dz);
  if (moved < wanted * 0.2 && player.path.length > 0) player.path = [];
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
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') runKeys.add(e.code);
      if (!(e.code in KEY_DIRS)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select')) return;
      if (useClub.getState().mode !== 'walk') return;
      e.preventDefault();
      if (!held.has(e.code)) held.set(e.code, performance.now());
    };
    const up = (e: KeyboardEvent) => {
      runKeys.delete(e.code);
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
      runKeys.clear();
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

  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const dt = Math.min(delta, 0.1);
    const club = useClub.getState();
    let moving = false;

    const now = performance.now();
    const frame = Math.min(delta, 0.3);
    const keys = keyInput(now, Math.max(1, frame * 1000));
    // 鍵盤與手機搖桿相加（長度最多 1）
    let input: [number, number] = [keys[0] + stick.x, keys[1] + stick.z];
    const len = Math.hypot(input[0], input[1]);
    if (len > 1) input = [input[0] / len, input[1] / len];
    lastFrameAt.current = now;
    // 按住 Shift 或搖桿推到底就跑步；點很遠的地方（剩下的路超過 10m）也自動用跑的
    player.running = runKeys.size > 0 || (stick.run && len > 0) || remainingPath() > 10;
    if (club.mode === 'walk') {
      // 幀率低時分成小步走，速度不變也不會穿牆
      let left = frame;
      while (left > 1e-6) {
        const h = Math.min(left, 0.05);
        left -= h;
        if (stepPlayer(h, input)) moving = true;
      }
      club.setNearby(nearestInteractable(player.pos, club.floor));
      club.setInside(isInsideSticky(player.pos, club.floor, club.inside));
    }

    // 一兩格沒移動（例如剛好抵達中途點）不要馬上切回站立動畫
    walk.current = moving ? 0.12 : Math.max(0, walk.current - dt);
    player.moving = moving || walk.current > 0;
    if (!player.moving) player.running = false;
    g.position.set(player.pos[0], floorY(club.floor), player.pos[1]);
    // 轉身取最短角度
    let diff = player.yaw - g.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    g.rotation.y += diff * Math.min(1, dt * 14);
  });

  return (
    <group visible={visible}>
      <Avatar
        ref={ref}
        color={player.color}
        motion={player}
        fallback={<Character outfit={PLAYER_OUTFIT} />}
      />
    </group>
  );
}

/** 尋路剩下的距離 */
function remainingPath(): number {
  let d = 0;
  let prev: Vec2 = player.pos;
  for (const p of player.path) {
    d += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return d;
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

/** 鏡頭看的點：角色胸口 */
const PIVOT_HEIGHT = 1.15;
const CAMERA_PAD = 0.25;

/**
 * 從 pivot 往鏡頭方向走，碰到牆或大樓就把鏡頭拉近，免得鏡頭鑽進牆裡、角色被擋住。
 * 回傳可用的最遠距離。
 */
function clampDistance(
  pivot: Vector3,
  dir: Vector3,
  want: number,
  occluders: readonly Occluder[],
  y0: number,
): number {
  const N = 28;
  for (let i = 1; i <= N; i++) {
    const t = (i / N) * want;
    const x = pivot.x + dir.x * t;
    const y = pivot.y + dir.y * t;
    const z = pivot.z + dir.z * t;
    for (const o of occluders) {
      if (
        x > o.minX - CAMERA_PAD &&
        x < o.maxX + CAMERA_PAD &&
        z > o.minZ - CAMERA_PAD &&
        z < o.maxZ + CAMERA_PAD &&
        y < y0 + o.top + CAMERA_PAD
      ) {
        return Math.max(ORBIT_LIMITS.minDist * 0.6, ((i - 1) / N) * want);
      }
    }
  }
  return want;
}

/**
 * 拖曳畫面轉視角（滑鼠任一鍵或單指）、滾輪或雙指縮放。
 * 拖超過 6px 才算拖曳，點一下仍然是「走過去」。
 */
function useOrbitControls() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    const pts = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number } | null = null;
    let pinch = 0;
    const active = () => useClub.getState().mode === 'walk';
    const clampPitch = (p: number) =>
      Math.max(ORBIT_LIMITS.minPitch, Math.min(ORBIT_LIMITS.maxPitch, p));
    const clampDist = (d: number) =>
      Math.max(ORBIT_LIMITS.minDist, Math.min(ORBIT_LIMITS.maxDist, d));

    const down = (e: PointerEvent) => {
      pointerGuard.dragged = false;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      start = { x: e.clientX, y: e.clientY };
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    };
    const move = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId);
      if (!prev || !active()) return;
      const cur = { x: e.clientX, y: e.clientY };
      pts.set(e.pointerId, cur);
      if (pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch > 0 && d > 0) orbit.dist = clampDist(orbit.dist * (pinch / d));
        pinch = d;
        pointerGuard.dragged = true;
        return;
      }
      if (start && !pointerGuard.dragged) {
        if (Math.hypot(cur.x - start.x, cur.y - start.y) < 6) return;
        pointerGuard.dragged = true;
        el.setPointerCapture?.(e.pointerId);
      }
      orbit.yaw -= (cur.x - prev.x) * 0.0065;
      orbit.pitch = clampPitch(orbit.pitch + (cur.y - prev.y) * 0.0045);
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = 0;
      if (pts.size === 0) start = null;
      // 讓這次放開後的 click 事件先看到 dragged，再清掉
      if (pointerGuard.dragged) setTimeout(() => (pointerGuard.dragged = false), 0);
    };
    const wheel = (e: WheelEvent) => {
      if (!active()) return;
      e.preventDefault();
      orbit.dist = clampDist(orbit.dist * Math.exp(e.deltaY * 0.0012));
    };
    const menu = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('contextmenu', menu);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('contextmenu', menu);
    };
  }, [gl]);
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
  const tmpDir = useRef(new Vector3());
  /** 碰撞後實際用的距離（拉近立刻、放遠慢慢） */
  const dist = useRef(orbit.dist);
  const lastFloor = useRef(1);
  useOrbitControls();
  // 網址加 ?cam=yaw,pitch,dist 固定鏡頭（截圖比對用）
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('cam');
    const [y, p, d] = (raw ?? '').split(',').map(Number);
    if (raw && Number.isFinite(y) && Number.isFinite(p) && Number.isFinite(d)) {
      orbit.yaw = y!;
      orbit.pitch = p!;
      orbit.dist = d!;
      dist.current = d!;
    }
  }, []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const { mode, inside, floor } = useClub.getState();
    if (mode === 'title') resetOrbit();
    const y0 = floorY(floor);
    // 直向手機畫面窄：預設再拉遠一點
    const far = size.width / Math.max(1, size.height) < 1 ? 1.3 : 1;
    const [px, pz] = player.pos;
    const followLook = tmpLook.current.set(px, y0 + PIVOT_HEIGHT, pz);
    const cp = Math.cos(orbit.pitch);
    const dir = tmpDir.current.set(
      Math.sin(orbit.yaw) * cp,
      Math.sin(orbit.pitch),
      Math.cos(orbit.yaw) * cp,
    );
    const want = orbit.dist * far;
    const allowed = clampDistance(
      followLook,
      dir,
      want,
      inside ? OCCLUDERS_INSIDE : OCCLUDERS_OUTSIDE,
      y0,
    );
    // 被牆擋住時拉近要快（不然會看到牆裡面），但不要一格就跳過去：碰撞是分段取樣的，
    // 角色貼著牆走時可用距離會一階一階變，直接套用鏡頭就會一跳一跳。放遠則慢慢來。
    dist.current =
      allowed < dist.current
        ? Math.max(allowed, dist.current + (allowed - dist.current) * (1 - Math.exp(-dt * 18)))
        : dist.current + (allowed - dist.current) * (1 - Math.exp(-dt * 4));
    if (dist.current - allowed > 1.5) dist.current = allowed + 1.5;
    const followPos = tmpPos.current.copy(followLook).addScaledVector(dir, dist.current);
    // 不鑽到地板下
    followPos.y = Math.max(followPos.y, y0 + 0.35);
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
    } else if (floor !== lastFloor.current) {
      // 換樓層發生在黑幕裡：鏡頭直接跳到新樓層，淡入時不會看到鏡頭穿過樓板
      camera.position.copy(followPos);
      look.current.copy(followLook);
      titleMix.current = 0;
    } else {
      // 位置跟得緊一點，拖曳轉視角時才不會覺得延遲
      const k = 1 - Math.exp(-dt * 12);
      camera.position.lerp(followPos, k);
      look.current.lerp(followLook, k);
      titleMix.current = 0;
    }
    lastFloor.current = floor;
    camera.lookAt(look.current);
    applyFraming(camera as PerspectiveCamera, size, shot, titleMix.current);
  });
  return null;
}

/** 室內時街景放到鏡頭看不到的圖層 */
const HIDDEN_LAYER = 31;

/**
 * 室內看不到外面：把街口與街區的物件移到鏡頭不看的圖層，而不是 visible = false。
 * three.js 不收集隱藏子樹裡的光源，光源數量一變，所有材質都要重新編譯 shader，
 * 畫面會卡住、閃一下；這裡光源留在原圖層、只把亮度調成 0，光源數量永遠不變。
 * 也不重新掛載任何東西，進出門不用重新合併網格。
 */
function Outdoors({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null);
  const shown = useRef(true);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const { inside, floor } = useClub.getState();
    const indoor = inside || floor === 2;
    // 室外：預設圖層就看得到，只在剛走出門的那一格還原
    if (!indoor && shown.current) return;
    shown.current = !indoor;
    g.traverse((o) => {
      const light = o as Light;
      if (light.isLight) {
        if (indoor) {
          // React 之後若改了亮度（例如霓虹時段），也記下來，出門時還原成最新的值
          if (light.intensity !== 0) light.userData.outdoorIntensity = light.intensity;
          light.intensity = 0;
        } else if (typeof light.userData.outdoorIntensity === 'number') {
          light.intensity = light.userData.outdoorIntensity;
        }
        return;
      }
      if (indoor) o.layers.set(HIDDEN_LAYER);
      else o.layers.set(0);
    });
  });
  return <group ref={ref}>{children}</group>;
}

/** 看不見的地面：點一下就走過去。範圍很大，點到樓上的牆時也會落在樓後方，角色就走進門裡 */
function ClickGround() {
  const floor = useClub((s) => s.floor);
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position-y={floorY(floor) + 0.02}
      onClick={(e) => {
        e.stopPropagation();
        if (pointerGuard.dragged) return;
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
  const floor = useClub((s) => s.floor);
  const dbg = typeof window !== 'undefined' ? window.location.search : '';
  const select = (id: string) => {
    if (pointerGuard.dragged) return;
    const it = interactablesOf(useClub.getState().floor).find((x) => x.id === id);
    if (it) walkTo(it.approach);
  };
  return (
    <DayNight hour={hour}>
      {/* 室內（1F 走進門、2F 整層）看不到外面：街口與街區整個藏起來 */}
      <Outdoors>
        {!dbg.includes('nostreet') && <Street />}
        {!dbg.includes('nodistrict') && <District />}
      </Outdoors>
      {!dbg.includes('nohall') && floor === 1 && <MahjongHall onSelect={select} inside={inside} />}
      {!dbg.includes('nohall') && floor === 2 && <CardHall onSelect={select} />}
      <ClickGround />
      <Player />
      <ClubPresence />
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
    // 量測用：E2E 可以比對進門前後新編譯了哪些 shader（gl.info.programs）
    (window as unknown as { __clubGl?: unknown }).__clubGl = gl;
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
