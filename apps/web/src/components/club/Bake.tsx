'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import {
  Matrix4,
  Mesh,
  type BufferGeometry,
  type Group,
  type InstancedMesh,
  type Material,
  type MeshStandardMaterial,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 靜態場景合併（r3f-game-dev-spec §8：先量測、再減 draw call）。
 *
 * 場景用很多小零件拼出來（倒角木條、燈泡、窗框），一個零件一個 draw call 會拖垮手機與內顯。
 * Bake 在掛載後把子樹裡「材質相同」的 mesh 合併成一個 mesh，原本的 mesh 只是隱藏起來，
 * 仍然留著接收點擊（three.js 的 raycast 不看 visible）。
 *
 * 合併後的 mesh 直接沿用其中一個原始材質物件，所以 React 之後改材質屬性（例如霓虹亮度）
 * 仍然會反映出來；只有子樹結構改變時才需要重新合併（用 deps 告訴它）。
 * 角色、InstancedMesh、ShaderMaterial 不合併。
 */
export function Bake({ children, deps = [] }: { children: ReactNode; deps?: unknown[] }) {
  const ref = useRef<Group>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.updateWorldMatrix(true, true);
    const toRoot = new Matrix4().copy(root.matrixWorld).invert();
    const groups = new Map<
      string,
      { material: Material; geos: BufferGeometry[]; cast: boolean; receive: boolean; order: number }
    >();
    const hidden: Mesh[] = [];

    root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || (m as InstancedMesh).isInstancedMesh || m.userData.baked) return;
      if (Array.isArray(m.material) || m.userData.noBake) return;
      if (!isVisible(m, root)) return;
      const key = materialKey(m.material);
      if (!key) return;
      const geo = prepare(m.geometry, new Matrix4().multiplyMatrices(toRoot, m.matrixWorld));
      if (!geo) return;
      const k = `${key}|${m.renderOrder}`;
      let g = groups.get(k);
      if (!g) {
        g = { material: m.material, geos: [], cast: false, receive: false, order: m.renderOrder };
        groups.set(k, g);
      }
      g.geos.push(geo);
      g.cast ||= m.castShadow;
      g.receive ||= m.receiveShadow;
      hidden.push(m);
    });

    const merged: Mesh[] = [];
    for (const g of groups.values()) {
      const geo = g.geos.length === 1 ? g.geos[0]! : mergeGeometries(g.geos, false);
      if (g.geos.length > 1) for (const x of g.geos) x.dispose();
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new Mesh(geo, g.material);
      mesh.castShadow = g.cast;
      mesh.receiveShadow = g.receive;
      mesh.renderOrder = g.order;
      mesh.userData.baked = true;
      // 合併後的 mesh 不接點擊，點擊交給隱藏的原始 mesh
      mesh.raycast = () => {};
      root.add(mesh);
      merged.push(mesh);
    }
    for (const m of hidden) m.visible = false;

    return () => {
      for (const m of merged) {
        root.remove(m);
        m.geometry.dispose();
      }
      for (const m of hidden) m.visible = true;
    };
    // deps 由呼叫端決定何時重新合併
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return <group ref={ref}>{children}</group>;
}

function isVisible(o: Mesh, root: Group): boolean {
  for (let p: typeof o.parent = o; p && p !== root; p = p.parent) if (!p.visible) return false;
  return true;
}

/** 只保留 position / normal / uv，套上轉換，統一成非索引幾何，才能互相合併 */
function prepare(src: BufferGeometry, matrix: Matrix4): BufferGeometry | null {
  if (!src.attributes.position || !src.attributes.normal) return null;
  const g = src.index ? src.toNonIndexed() : src.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  if (!g.attributes.uv) return null;
  g.morphAttributes = {};
  g.clearGroups();
  g.applyMatrix4(matrix);
  return g;
}

/** 決定兩個材質能不能共用：型別、顏色、貼圖與會影響外觀的旗標都相同 */
function materialKey(mat: Material): string | null {
  if (mat.type === 'ShaderMaterial' || mat.type === 'RawShaderMaterial') {
    // 只用世界座標與 uv 的 shader（例如室內映射窗）可以合併，同一個材質物件才算同一組
    return mat.userData.bakeable ? `shader|${mat.uuid}` : null;
  }
  const m = mat as MeshStandardMaterial & {
    gradientMap?: { uuid: string } | null;
    color?: { getHexString(): string };
  };
  return [
    m.type,
    m.color?.getHexString(),
    m.emissive?.getHexString(),
    m.emissiveIntensity,
    m.roughness,
    m.metalness,
    m.map?.uuid,
    m.normalMap?.uuid,
    m.roughnessMap?.uuid,
    m.aoMap?.uuid,
    m.envMapIntensity,
    m.emissiveMap?.uuid,
    m.gradientMap?.uuid,
    m.transparent,
    m.opacity,
    m.side,
    m.blending,
    m.toneMapped,
    m.flatShading,
    m.depthWrite,
  ].join('|');
}
