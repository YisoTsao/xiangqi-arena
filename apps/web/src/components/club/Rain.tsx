'use client';

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearMipmapLinearFilter,
  Matrix4,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Camera,
  type Mesh,
  type Object3D,
} from 'three';
import { STREET_LAMPS } from './layout';
import { useNeon, useQuality } from './props';
import { CLUB } from './signs';
import { useClub } from './store';
import { STREET_U, STREET_V, streetSurface } from './textures';

/**
 * 雨夜街景：
 * - 濕街面：一張平面反射（鏡像相機畫到半解析度的 HDR 貼圖），依積水程度混合清楚的倒影
 *   與被柏油打散、沿垂直方向拉長的倒影；水窪裡有雨滴漣漪擾動法線
 * - 雨絲：GPU 上算位置的細長面片，被路燈與招牌照到的雨絲會亮起來
 * - 濺起的水花、路燈光錐
 *
 * 天氣切換時 wet 會慢慢變乾或變濕，不會瞬間跳。
 */

/** 所有雨天材質共用的 uniform（時間、濕度、雨量） */
const shared = {
  uTime: { value: 0 },
  /** 地面濕度 0～1（停雨後慢慢變乾） */
  uWet: { value: 1 },
  /** 正在下的雨量 0～1 */
  uRain: { value: 1 },
  /** 夜晚燈光強度 0～1 */
  uNeon: { value: 1 },
};

/** 反射相機畫面時要藏起來的東西（地面本身、雨絲、水花） */
const hiddenInReflection = new Set<Object3D>();

/** 照亮雨絲與水花的光源（世界座標 + 半徑、顏色） */
const RAIN_LIGHTS: { p: [number, number, number]; r: number; c: string; k: number }[] = [
  ...STREET_LAMPS.map(([x, z]) => ({
    p: [x, 3.85, z - 0.62] as [number, number, number],
    r: 4.5,
    c: '#ffd890',
    k: 1.4,
  })),
  { p: [0, 4.55, 1.2], r: 5, c: '#ffd6c4', k: 1 },
  { p: [8.1, 8, 1.4], r: 4.5, c: CLUB.neonRed, k: 1 },
  { p: [0, 2.6, 1.6], r: 4.5, c: '#ffb870', k: 0.9 },
  { p: [-13, 2.6, 1.4], r: 4, c: '#ffb466', k: 0.8 },
  { p: [13, 2.6, 1.4], r: 4, c: '#ffb466', k: 0.8 },
  { p: [0, 2.2, -2], r: 4, c: '#ffc27a', k: 0.6 },
];
const LIGHT_COUNT = RAIN_LIGHTS.length;

function lightUniforms() {
  return {
    uLights: { value: RAIN_LIGHTS.map((l) => new Vector4(...l.p, l.r)) },
    uLightCol: {
      value: RAIN_LIGHTS.map((l) => new Color(l.c).multiplyScalar(l.k)),
    },
  };
}

const LIGHT_GLSL = /* glsl */ `
  uniform vec4 uLights[${LIGHT_COUNT}];
  uniform vec3 uLightCol[${LIGHT_COUNT}];
  uniform float uNeon;
  vec3 rainLight(vec3 p, vec3 ambient) {
    vec3 col = ambient;
    for (int i = 0; i < ${LIGHT_COUNT}; i++) {
      float f = max(0.0, 1.0 - length(uLights[i].xyz - p) / uLights[i].w);
      col += uLightCol[i] * f * f * uNeon * 2.5;
    }
    return col;
  }
`;

// ── 濕街面 + 平面反射 ─────────────────────────────────────

/** 街面平面：x 方向 [-60, 60]，z 方向 [0, STREET_V]；uv 直接用世界座標換算 */
function streetGeometry(): BufferGeometry {
  const g = new PlaneGeometry(120, STREET_V, 1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, STREET_V / 2);
  const pos = g.attributes.position as BufferAttribute;
  const uv = g.attributes.uv as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / STREET_U, pos.getZ(i) / STREET_V);
  }
  return g;
}

const RIPPLE_GLSL = /* glsl */ `
  vec2 hash22(vec2 p) {
    vec3 a = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    a += dot(a, a.yzx + 33.33);
    return fract((a.xx + a.yz) * a.zy);
  }
  // 雨滴漣漪：每格一個隨機時間落下的水滴，圓環往外擴散後消失；兩層不同大小疊加
  vec2 ripples(vec2 p, float t) {
    vec2 n = vec2(0.0);
    for (int l = 0; l < 2; l++) {
      float scale = l == 0 ? 2.6 : 4.1;
      vec2 q = p * scale + float(l) * 17.3;
      vec2 cell = floor(q);
      vec2 f = fract(q);
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 o = vec2(float(i), float(j));
          vec2 h = hash22(cell + o);
          float phase = fract(t * (0.8 + h.y * 0.5) + h.x);
          vec2 d = f - (o + 0.2 + h * 0.6);
          float r = length(d);
          float front = phase * 0.9;
          float ring = sin((r - front) * 42.0) * smoothstep(0.12, 0.0, abs(r - front));
          n += (d / max(r, 1e-3)) * ring * (1.0 - phase) * (1.0 - phase);
        }
      }
    }
    return n * 0.5;
  }
`;

function useWetMaterial(reflection: { texture: WebGLRenderTarget['texture'] }) {
  const quality = useQuality();
  const extra = useMemo(
    () => ({
      uReflMap: { value: reflection.texture },
      uReflMatrix: { value: new Matrix4() },
      uReflOn: { value: 0 },
      uWetMap: { value: null as unknown },
    }),
    [reflection],
  );
  const material = useMemo(() => {
    const s = streetSurface();
    const m = new MeshStandardMaterial({
      map: s?.map ?? null,
      normalMap: s?.normal ?? null,
      roughness: 1,
      metalness: 0,
    });
    m.normalScale.set(0.8, 0.8);
    extra.uWetMap.value = s?.wet ?? null;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, shared, extra);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
        .replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vWorldPos;
          uniform sampler2D uWetMap;
          uniform sampler2D uReflMap;
          uniform mat4 uReflMatrix;
          uniform float uReflOn;
          uniform float uTime;
          uniform float uWet;
          uniform float uRain;
          ${RIPPLE_GLSL}`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          vec4 wetS = texture2D(uWetMap, vMapUv);
          // 積水：雨停後水窪最慢乾（先退淺水、低窪處留到最後）
          float puddle = smoothstep(0.0, 1.0, wetS.r * (0.35 + uWet * 0.9) - (1.0 - uWet) * 0.45);
          puddle = clamp(puddle, 0.0, 1.0) * step(0.001, uWet);
          // 濕的磚與柏油顏色變深；水窪更深
          diffuseColor.rgb *= mix(1.0, 0.42, uWet) * mix(1.0, 0.55, puddle);
          roughnessFactor = mix(wetS.g, mix(wetS.g * 0.38, 0.04, puddle), uWet);
          vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          normal = normalize(mix(normal, upV, puddle * 0.9));
          vec2 rip = ripples(vWorldPos.xz, uTime) * uRain;
          vec3 ripV = normalize((viewMatrix * vec4(rip.x * 0.35, 1.0, rip.y * 0.35, 0.0)).xyz);
          normal = normalize(normal + (ripV - upV) * (0.25 + puddle * 0.75));`,
        )
        .replace(
          '#include <opaque_fragment>',
          `{
            vec3 V = normalize(vViewPosition);
            float NdV = clamp(dot(normal, V), 0.0, 1.0);
            float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
            vec4 rc = uReflMatrix * vec4(vWorldPos, 1.0);
            vec2 ruv = rc.xy / rc.w + (normal.xy - upV.xy) * (0.05 + puddle * 0.04);
            // 柏油上的倒影：沿垂直方向拉長、打散；水窪裡幾乎是鏡面
            float spread = (1.0 - puddle) * clamp(roughnessFactor * 2.4, 0.0, 1.0);
            vec3 refl = vec3(0.0);
            float wsum = 0.0;
            for (int k = -3; k <= 3; k++) {
              float o = float(k) / 3.0;
              float w = 1.0 - abs(o) * 0.7;
              refl += textureLod(uReflMap, ruv + vec2(o * 0.004, o * spread * 0.07), spread * 3.5).rgb * w;
              wsum += w;
            }
            refl /= wsum;
            float edge = smoothstep(0.0, 0.04, ruv.x) * smoothstep(1.0, 0.96, ruv.x)
              * smoothstep(0.0, 0.04, ruv.y) * smoothstep(1.0, 0.96, ruv.y);
            float strength = uWet * uReflOn * edge * mix(F * 0.8 + 0.06, F * 0.5 + 0.42, puddle);
            outgoingLight += refl * strength;
          }
          #include <opaque_fragment>`,
        );
    };
    m.customProgramCacheKey = () => `wet-street-${quality}`;
    return m;
  }, [extra, quality]);
  useEffect(() => () => material.dispose(), [material]);
  return { material, extra };
}

const REFLECTION_SCALE = { low: 0.25, medium: 0.35, high: 0.5 } as const;
/** 倒影每幾格重畫一次（低畫質隔一格，省一半成本；倒影晚一格肉眼看不出來） */
const REFLECTION_EVERY = { low: 2, medium: 1, high: 1 } as const;

/** 濕街面：雨天時倒映招牌、路燈與角色 */
export function WetStreet({ inside }: { inside: boolean }) {
  const quality = useQuality();
  const scale = REFLECTION_SCALE[quality];
  const every = REFLECTION_EVERY[quality];
  const frame = useRef(0);
  const mesh = useRef<Mesh>(null);
  const geometry = useMemo(streetGeometry, []);
  const target = useMemo(() => {
    const rt = new WebGLRenderTarget(4, 4, { type: HalfFloatType, depthBuffer: true });
    rt.texture.generateMipmaps = true;
    rt.texture.minFilter = LinearMipmapLinearFilter;
    return rt;
  }, []);
  const { material, extra } = useWetMaterial(target);
  const tmp = useMemo(
    () => ({
      cam: new PerspectiveCamera(),
      view: new Vector3(),
      look: new Vector3(),
      camPos: new Vector3(),
      normal: new Vector3(0, 1, 0),
      planePoint: new Vector3(0, 0.002, 0),
      rot: new Matrix4(),
      plane: new Plane(),
      clip: new Vector4(),
      q: new Vector4(),
      bias: new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1),
    }),
    [],
  );

  useEffect(
    () => () => {
      target.dispose();
      geometry.dispose();
    },
    [target, geometry],
  );

  // 預設優先序 0：比後處理（優先序 1）早畫，主畫面就能用這一格的倒影
  useFrame((state) => {
    const m = mesh.current;
    const { gl, scene, camera, size } = state;
    const on = scale > 0 && !inside && shared.uWet.value > 0.01;
    extra.uReflOn.value = on ? 1 : 0;
    if (!m || !on) return;
    if (++frame.current % every !== 0) return;

    const w = Math.max(4, Math.round(size.width * state.viewport.dpr * scale));
    const h = Math.max(4, Math.round(size.height * state.viewport.dpr * scale));
    if (target.width !== w || target.height !== h) target.setSize(w, h);

    // 鏡像相機（three.js Reflector 的做法）：位置、視線目標對水平面鏡射，上方向也鏡射
    const t = tmp;
    const cam = camera as PerspectiveCamera;
    t.camPos.setFromMatrixPosition(cam.matrixWorld);
    if (t.camPos.y <= t.planePoint.y) return;
    t.rot.extractRotation(cam.matrixWorld);
    t.look.set(0, 0, -1).applyMatrix4(t.rot).add(t.camPos);
    const vcam = t.cam;
    vcam.position.copy(mirror(t.view.copy(t.camPos), t.planePoint.y));
    vcam.up.set(0, 1, 0).applyMatrix4(t.rot).reflect(t.normal);
    vcam.lookAt(mirror(t.look, t.planePoint.y));
    vcam.far = cam.far;
    vcam.near = cam.near;
    vcam.updateMatrixWorld();
    vcam.projectionMatrix.copy(cam.projectionMatrix);

    extra.uReflMatrix.value
      .copy(t.bias)
      .multiply(vcam.projectionMatrix)
      .multiply(vcam.matrixWorldInverse);

    // 斜裁切面：只畫水面以上的東西
    t.plane.setFromNormalAndCoplanarPoint(t.normal, t.planePoint);
    t.plane.applyMatrix4(vcam.matrixWorldInverse);
    t.clip.set(t.plane.normal.x, t.plane.normal.y, t.plane.normal.z, t.plane.constant);
    const p = vcam.projectionMatrix.elements;
    t.q.x = (Math.sign(t.clip.x) + p[8]!) / p[0]!;
    t.q.y = (Math.sign(t.clip.y) + p[9]!) / p[5]!;
    t.q.z = -1;
    t.q.w = (1 + p[10]!) / p[14]!;
    t.clip.multiplyScalar(2 / t.clip.dot(t.q));
    p[2] = t.clip.x;
    p[6] = t.clip.y;
    p[10] = t.clip.z + 1;
    p[14] = t.clip.w;
    vcam.projectionMatrixInverse.copy(vcam.projectionMatrix).invert();

    m.visible = false;
    for (const o of hiddenInReflection) o.visible = false;
    const prevTarget = gl.getRenderTarget();
    const prevAutoClear = gl.autoClear;
    const prevShadow = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    gl.autoClear = true;
    gl.setRenderTarget(target);
    gl.clear();
    gl.render(scene, vcam);
    gl.setRenderTarget(prevTarget);
    gl.autoClear = prevAutoClear;
    gl.shadowMap.autoUpdate = prevShadow;
    for (const o of hiddenInReflection) o.visible = true;
    m.visible = true;
  });

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      position-y={0.002}
      receiveShadow
      userData={{ noBake: true }}
    />
  );
}

function mirror(v: Vector3, y: number): Vector3 {
  v.y = 2 * y - v.y;
  return v;
}

// ── 雨絲 ───────────────────────────────────────────────

const RAIN_COUNT = { low: 1800, medium: 5000, high: 9000 } as const;
/** 雨絲分布的範圍（跟著鏡頭前方移動，超出範圍就從另一側繞回來） */
const RAIN_BOX = new Vector3(34, 13, 28);

function useHidden(ref: RefObject<Object3D | null>) {
  useEffect(() => {
    const o = ref.current;
    if (!o) return;
    hiddenInReflection.add(o);
    return () => {
      hiddenInReflection.delete(o);
    };
  }, [ref]);
}

/** 鏡頭前方的雨區中心（雨只需要下在看得到的地方） */
function rainCenter(camera: Camera, out: Vector3): Vector3 {
  const dir = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  dir.y = 0;
  dir.normalize();
  return out.copy(camera.position).addScaledVector(dir, RAIN_BOX.z * 0.42);
}

export function RainFall() {
  const quality = useQuality();
  const count = RAIN_COUNT[quality];
  const ref = useRef<Mesh>(null);
  useHidden(ref);
  const geometry = useMemo(() => {
    const base = new PlaneGeometry(1, 1, 1, 1);
    base.translate(0, 0.5, 0);
    const g = new InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position!);
    g.setAttribute('uv', base.attributes.uv!);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    g.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
    g.instanceCount = count;
    return g;
  }, [count]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        // 面片的正反面隨鏡頭方向而變，兩面都畫
        side: DoubleSide,
        uniforms: {
          ...shared,
          ...lightUniforms(),
          uCenter: { value: new Vector3() },
          uBox: { value: RAIN_BOX },
          uWind: { value: [1.2, 0.5] },
          uSpeed: { value: 11 },
          uAmbient: { value: new Color() },
        },
        vertexShader: /* glsl */ `
          ${LIGHT_GLSL}
          uniform float uTime;
          uniform float uRain;
          uniform vec3 uCenter;
          uniform vec3 uBox;
          uniform vec2 uWind;
          uniform float uSpeed;
          uniform vec3 uAmbient;
          attribute vec4 aSeed;
          varying vec2 vUv;
          varying vec3 vCol;
          varying float vAlpha;
          void main() {
            float speed = uSpeed * (0.8 + aSeed.w * 0.4);
            vec2 lo = uCenter.xz - uBox.xz * 0.5;
            vec2 xz = lo + mod(aSeed.xz * uBox.xz + uWind * uTime - lo, uBox.xz);
            vec3 p = vec3(xz.x, uBox.y - mod(aSeed.y * uBox.y + uTime * speed, uBox.y), xz.y);
            vec3 dir = normalize(vec3(uWind.x, -speed, uWind.y));
            vec3 toCam = cameraPosition - p;
            float dist = length(toCam);
            vec3 side = normalize(cross(dir, toCam / dist));
            // 遠處雨絲別細到小於一個像素（變寬但變淡），近處拉長一點
            float width = max(0.008, dist * 0.0022);
            float len = (0.35 + aSeed.w * 0.35) * (0.8 + uSpeed / 30.0);
            vec3 wp = p - dir * len * position.y + side * position.x * width;
            float shown = step(aSeed.z * 0.999, uRain) * step(0.35, p.z);
            float fade = smoothstep(0.6, 2.0, dist) * smoothstep(30.0, 14.0, dist)
              * smoothstep(0.0, 0.6, p.y) * smoothstep(uBox.y, uBox.y - 2.0, p.y);
            vAlpha = shown * fade * (0.009 / width + 0.25);
            vCol = rainLight(p, uAmbient);
            vUv = vec2(position.x + 0.5, position.y);
            gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 vCol;
          varying float vAlpha;
          void main() {
            float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
            float along = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.4, vUv.y);
            float a = across * along * vAlpha;
            if (a < 0.002) discard;
            gl_FragColor = vec4(vCol * a, a);
          }`,
      }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ camera }) => {
    rainCenter(camera, material.uniforms.uCenter!.value as Vector3);
    // 底色：白天是灰白雨絲，夜晚靠燈光照亮
    const neon = shared.uNeon.value;
    (material.uniforms.uAmbient!.value as Color)
      .setRGB(0.32, 0.34, 0.38)
      .lerp(new Color(0.11, 0.12, 0.16), neon);
  });

  return (
    <mesh ref={ref} geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />
  );
}

// ── 地上濺起的水花 ─────────────────────────────────────

const SPLASH_COUNT = { low: 300, medium: 700, high: 1200 } as const;

export function Splashes() {
  const quality = useQuality();
  const count = SPLASH_COUNT[quality];
  const ref = useRef<Mesh>(null);
  useHidden(ref);
  const geometry = useMemo(() => {
    const base = new PlaneGeometry(1, 1);
    base.rotateX(-Math.PI / 2);
    const g = new InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position!);
    g.setAttribute('uv', base.attributes.uv!);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    g.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
    g.instanceCount = count;
    return g;
  }, [count]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          ...shared,
          ...lightUniforms(),
          uCenter: { value: new Vector3() },
          uBox: { value: RAIN_BOX },
        },
        vertexShader: /* glsl */ `
          ${LIGHT_GLSL}
          uniform float uTime;
          uniform float uRain;
          uniform vec3 uCenter;
          uniform vec3 uBox;
          attribute vec4 aSeed;
          varying vec2 vUv;
          varying vec3 vCol;
          varying float vPhase;
          varying float vAlpha;
          float hash(float n) { return fract(sin(n) * 43758.5453); }
          void main() {
            float life = 0.35 + aSeed.w * 0.25;
            float t = uTime / life + aSeed.z * 10.0;
            float cycle = floor(t);
            vPhase = fract(t);
            vec2 r = vec2(hash(cycle * 12.9898 + aSeed.x * 78.233), hash(cycle * 39.346 + aSeed.y * 11.135));
            vec2 lo = uCenter.xz - uBox.xz * 0.5;
            vec3 p = vec3(lo.x + r.x * uBox.x, 0.012, lo.y + r.y * uBox.z);
            float size = 0.06 + vPhase * 0.22;
            vec3 wp = p + position * size;
            float shown = step(aSeed.w, uRain) * step(0.4, p.z) * step(p.z, 15.8);
            vAlpha = shown * smoothstep(26.0, 10.0, length(cameraPosition - p));
            vCol = rainLight(p + vec3(0.0, 0.3, 0.0), vec3(0.05, 0.055, 0.07));
            vUv = uv;
            gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 vCol;
          varying float vPhase;
          varying float vAlpha;
          void main() {
            float r = length(vUv - 0.5) * 2.0;
            float ring = smoothstep(0.75, 0.9, r) * smoothstep(1.0, 0.9, r);
            float dot0 = smoothstep(0.35, 0.0, r) * smoothstep(0.25, 0.0, vPhase);
            float a = (ring * (1.0 - vPhase) * (1.0 - vPhase) + dot0) * vAlpha;
            if (a < 0.003) discard;
            gl_FragColor = vec4(vCol * a * 1.6, a);
          }`,
      }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ camera }) => {
    rainCenter(camera, material.uniforms.uCenter!.value as Vector3);
  });
  return (
    <mesh ref={ref} geometry={geometry} material={material} frustumCulled={false} renderOrder={4} />
  );
}

// ── 路燈光錐 ───────────────────────────────────────────

/** 路燈下被雨霧照出來的光錐（加色混合的圓錐，邊緣與底部漸淡） */
export function LampCone({
  position,
  color = '#ffd890',
}: {
  position: [number, number, number];
  color?: string;
}) {
  const neon = useNeon();
  const height = position[1] - 0.05;
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        uniforms: { ...shared, uColor: { value: new Color(color) }, uStrength: { value: 1 } },
        vertexShader: /* glsl */ `
          varying float vH;
          varying float vFacing;
          void main() {
            vH = uv.y;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vec3 n = normalize(mat3(modelMatrix) * normal);
            vFacing = abs(dot(n, normalize(cameraPosition - wp.xyz)));
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uStrength;
          uniform float uWet;
          uniform float uRain;
          varying float vH;
          varying float vFacing;
          void main() {
            float a = pow(vFacing, 1.3) * pow(vH, 1.2) * uStrength * (0.2 + uRain * 0.4);
            gl_FragColor = vec4(uColor * a, a);
          }`,
      }),
    [color],
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    material.uniforms.uStrength!.value = neon;
  }, [material, neon]);
  if (neon < 0.05) return null;
  return (
    <mesh
      position={[position[0], position[1] - height / 2, position[2]]}
      material={material}
      renderOrder={3}
      userData={{ noBake: true }}
    >
      <cylinderGeometry args={[0.14, 1.9, height, 28, 1, true]} />
    </mesh>
  );
}

// ── 天氣狀態 ───────────────────────────────────────────

/** 每格更新共用 uniform：時間、濕度慢慢跟上天氣、雨量淡入淡出 */
export function WeatherDriver() {
  const neon = useNeon();
  useEffect(() => {
    shared.uNeon.value = neon;
  }, [neon]);
  // 一進場就是當下的天氣，不從另一種天氣慢慢轉過來
  useEffect(() => {
    const v = useClub.getState().weather === 'rain' ? 1 : 0;
    shared.uRain.value = v;
    shared.uWet.value = v;
  }, []);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const raining = useClub.getState().weather === 'rain';
    shared.uTime.value += dt;
    shared.uRain.value += ((raining ? 1 : 0) - shared.uRain.value) * Math.min(1, dt * 1.5);
    // 下雨很快就濕；停雨後大約半分鐘才乾
    const target = raining ? 1 : 0;
    const rate = raining ? 0.5 : 0.04;
    shared.uWet.value +=
      Math.sign(target - shared.uWet.value) *
      Math.min(Math.abs(target - shared.uWet.value), dt * rate);
  });
  return null;
}

/** 下雨時整個街口的東西：濕街面、雨絲、水花 */
export function RainyStreet({ inside }: { inside: boolean }) {
  const quality = useQuality();
  return (
    <>
      <WeatherDriver />
      <WetStreet inside={inside} />
      <RainFall />
      {quality !== 'low' && <Splashes />}
    </>
  );
}
