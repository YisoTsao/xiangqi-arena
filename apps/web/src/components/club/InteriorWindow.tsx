'use client';

import { useEffect } from 'react';
import { Color, PlaneGeometry, ShaderMaterial } from 'three';
import { useNeon } from './props';

/**
 * 室內映射窗（interior mapping，ART_BIBLE_LOBBY §4.4）：窗玻璃後面用 shader 算出一個有深度的房間
 * （後牆、側牆、地板、天花板吸頂燈、半拉的窗簾），視角移動時房間有正確的透視，
 * 比貼一片發光方塊更像「樓上有人住」，而且只需要一個平面、不用建模室內。
 *
 * 只用在朝 +z（面向街道）的窗戶：房間座標直接由世界座標與 uv 推出，
 * 所以 Bake 可以把同一種窗的平面合併成一個 draw call。
 * 每扇窗的燈開不開、窗簾拉多少由一個種子決定：種子是整數，加在 uv.x 上（shader 取 floor 當種子、
 * fract 當窗內座標），這樣合併後每扇窗仍然各自不同，整排窗不會一模一樣。
 */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uLight;
  uniform vec3 uWall;
  uniform vec3 uSky;
  uniform vec3 uRoom;
  uniform float uOn;
  uniform float uOffChance;
  varying vec2 vUv;
  varying vec3 vWorld;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec2 uv = vec2(fract(vUv.x), vUv.y);
    float seed = floor(vUv.x);
    float h1 = hash(vec2(seed, 3.1));
    float h2 = hash(vec2(seed, 17.3));

    // 視線轉到房間座標：x 右、y 上、z 往屋內，單位是房間尺寸（0～1）
    vec3 V = normalize(vWorld - cameraPosition);
    vec3 dir = vec3(V.x / uRoom.x, V.y / uRoom.y, -V.z / uRoom.z);
    vec3 p = vec3(uv, 0.0);
    vec3 t = (step(0.0, dir) - p) / dir;
    float tm = min(min(t.x, t.y), t.z);
    vec3 hit = p + dir * tm;

    vec3 col;
    float shade;
    if (tm == t.z) {
      // 後牆：牆紙直紋 + 下半部一個深色櫃子
      col = uWall * (0.92 + 0.08 * step(0.5, fract(hit.x * 9.0)));
      if (hit.y < 0.38 && abs(hit.x - (0.3 + h2 * 0.4)) < 0.22) col = vec3(0.32, 0.2, 0.13);
      shade = 1.0;
    } else if (tm == t.y) {
      // 地板（木）或天花板
      col = dir.y < 0.0 ? vec3(0.36, 0.22, 0.14) : uWall * 1.05;
      shade = dir.y < 0.0 ? 0.75 : 0.9;
    } else {
      col = uWall * 0.85;
      shade = 0.8;
    }

    // 吸頂燈：房間中央上方，越近越亮
    vec3 lamp = vec3(0.5, 0.97, 0.55);
    float d = length((hit - lamp) * vec3(1.0, 1.4, 1.0));
    float lit = 0.35 + 1.1 / (1.0 + d * d * 6.0);
    // 有些房間沒開燈
    float on = uOn * (h1 > uOffChance ? 1.0 : 0.08);
    vec3 room = col * shade * uLight * lit * on;
    // 白天室內比外面暗很多
    room += col * shade * 0.04;

    // 窗簾：貼在玻璃後面，左右各拉出一段，燈開著時透出暖光
    float cl = 0.08 + h2 * 0.3;
    float cr = 0.92 - fract(h2 * 7.1) * 0.3;
    float fold = 0.85 + 0.15 * sin(uv.x * 60.0);
    if (uv.x < cl || uv.x > cr) {
      vec3 cloth = mix(vec3(0.85, 0.75, 0.6), vec3(0.62, 0.32, 0.28), step(0.6, h1));
      room = cloth * fold * (0.06 + uLight * on * 0.75);
    }

    // 玻璃反射：斜看時多一點天色
    float fres = pow(1.0 - abs(V.z), 3.0) * 0.6 + 0.06;
    vec3 color = mix(room, uSky, fres);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const materials = new Map<string, ShaderMaterial>();

/** 同一種窗（燈色 + 房間尺寸）共用一個材質，Bake 才能合併 */
function interiorMaterial(
  light: string,
  room: [number, number, number],
  offChance: number,
): ShaderMaterial {
  const key = `${light}:${room.join(',')}:${offChance}`;
  let m = materials.get(key);
  if (!m) {
    m = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uLight: { value: new Color(light).multiplyScalar(1.6) },
        uWall: { value: new Color('#e9d8bd') },
        uSky: { value: new Color('#7a8aa8') },
        uRoom: { value: room },
        uOn: { value: 1 },
        uOffChance: { value: offChance },
      },
    });
    m.userData.bakeable = true;
    materials.set(key, m);
  }
  return m;
}

/** 讓所有室內映射窗跟著日夜時鐘調亮度與天色反射 */
export function useInteriorWindowClock(sky: Color) {
  const neon = useNeon();
  useEffect(() => {
    for (const m of materials.values()) {
      m.uniforms.uOn!.value = 0.08 + neon * 0.92;
      m.uniforms.uSky!.value.copy(sky).multiplyScalar(0.55);
    }
  }, [neon, sky]);
}

const geometries = new Map<string, PlaneGeometry>();

/** 平面幾何，uv.x 加上整數種子 */
function seededPlane(size: [number, number], seed: number): PlaneGeometry {
  const key = `${size.join(',')}:${seed}`;
  let g = geometries.get(key);
  if (!g) {
    g = new PlaneGeometry(size[0], size[1]);
    const uv = g.attributes.uv!;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) + seed);
    geometries.set(key, g);
  }
  return g;
}

export function InteriorWindow({
  size,
  position,
  light,
  seed: rawSeed,
  depth = 3,
  offChance = 0.22,
}: {
  size: [number, number];
  position: [number, number, number];
  light: string;
  /** 任意整數，同一扇窗每次都一樣即可 */
  seed: number;
  depth?: number;
  /** 晚上這扇窗沒開燈的機率（營業中的店面設 0） */
  offChance?: number;
}) {
  const material = interiorMaterial(light, [size[0], size[1], depth], offChance);
  // 取 1～97 的正整數，避免 floor 在 0 附近跳號
  const seed = 1 + (Math.abs(Math.round(rawSeed)) % 97);
  return (
    <mesh
      position={position}
      material={material}
      geometry={seededPlane(size, seed)}
      dispose={null}
    />
  );
}
