import { Color, type Material, type MeshStandardMaterial } from 'three';

/**
 * 免費 GLB 模型的材質調整（Kenney 的模型都是一張 colormap 調色盤貼圖）。
 * 用 onBeforeCompile 在 shader 裡改顏色，不用另外做貼圖，模型換了也照樣有效。
 */

const HSV = /* glsl */ `
vec3 club_rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 club_hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
`;

/**
 * 玩家換色：把衣服、帽子這些「有彩度、又不是膚色」的地方轉到 tint 的色相；
 * 膚色、黑白灰（頭髮、鞋子、眼睛）保持原樣，所以每個人只是「衣服顏色不一樣」。
 */
export function tintClothes(material: MeshStandardMaterial, tint: string, amount = 0.85): Material {
  const m = material.clone();
  const hsl = { h: 0, s: 0, l: 0 };
  new Color(tint).getHSL(hsl);
  const uHue = { value: hsl.h };
  const uAmount = { value: amount };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTintHue = uHue;
    shader.uniforms.uTintAmount = uAmount;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uTintHue;\nuniform float uTintAmount;\n${HSV}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec3 hsv = club_rgb2hsv(diffuseColor.rgb);
          // 膚色：橘黃色相、中低彩度、夠亮（線性色彩空間量測）
          float skin = step(0.015, hsv.x) * step(hsv.x, 0.11) * step(hsv.y, 0.78) * step(0.18, hsv.z);
          float cloth = smoothstep(0.22, 0.4, hsv.y) * (1.0 - skin);
          vec3 shifted = club_hsv2rgb(vec3(uTintHue, max(hsv.y, 0.5), hsv.z));
          diffuseColor.rgb = mix(diffuseColor.rgb, shifted, cloth * uTintAmount);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'club-tint';
  return m;
}

/** 大樓窗戶夜燈：所有 Kenney 大樓共用一個亮度，DayNight 改它就全部跟著變 */
export const windowGlow = { value: 0 };

/**
 * Kenney 商業大樓的窗戶在調色盤上是藍色：偏藍的地方加上暖色自發光，
 * 夜晚整條街的窗戶就亮起來（白天 windowGlow = 0，看起來和原本一樣）。
 */
export function glowingWindows(material: MeshStandardMaterial): Material {
  const m = material.clone();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWindowGlow = windowGlow;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWindowGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 c = diffuseColor.rgb;
          float blue = smoothstep(0.04, 0.14, c.b - max(c.r, c.g));
          totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * blue * uWindowGlow;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'club-window-glow';
  return m;
}
