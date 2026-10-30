'use client';

import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import type { Mesh, Object3D } from 'three';

/**
 * 美術資產插槽（docs/ASSET_MANIFEST.md、docs/ART_BIBLE_LOBBY.md §7）。
 *
 * 場景裡每件主要模型都包在一個 <AssetSlot id="…">：manifest 裡標成 ready 的資產載入 Blender 匯出的 GLB，
 * 其餘的顯示 fallback（目前程式拼出來的暫代模型）。美術交件時只要把 GLB 放到
 * public/club/assets/models/<分類>/<id>.glb、把下面那一列改成 ready，場景就換掉，
 * 碰撞、互動錨點、尋路都不用動（它們只認 layout.ts 的座標）。
 *
 * GLB 規格：1 單位 = 1 公尺、Y 向上、模型正面朝 +Z、原點放在 fallback 的原點
 * （建築：正面牆面中心的地面；道具：底面中心）。載入失敗時退回 fallback，不會讓場景整個消失。
 *
 * 網址加 ?assets=debug 時，仍在用暫代模型的插槽會加上洋紅色線框，方便一眼看出哪些還沒換。
 */

export type AssetStatus = 'todo' | 'ready';

interface SlotSpec {
  /** public/ 底下的路徑 */
  url: string;
  status: AssetStatus;
}

const slot = (
  category: 'architecture' | 'props' | 'characters',
  id: string,
  status: AssetStatus = 'todo',
): SlotSpec => ({
  url: `/club/assets/models/${category}/${id}.glb`,
  status,
});

/** 與 docs/ASSET_MANIFEST.md 同步；交件後把 status 改成 ready */
export const ASSET_SLOTS = {
  ARCH_club_facade: slot('architecture', 'ARCH_club_facade'),
  ARCH_shophouse_A: slot('architecture', 'ARCH_shophouse_A'),
  ARCH_shophouse_B: slot('architecture', 'ARCH_shophouse_B'),
  ARCH_shophouse_C: slot('architecture', 'ARCH_shophouse_C'),
  ARCH_shophouse_D: slot('architecture', 'ARCH_shophouse_D'),
  PROP_street_lamp: slot('props', 'PROP_street_lamp'),
  PROP_scooter: slot('props', 'PROP_scooter'),
  PROP_vending_machine: slot('props', 'PROP_vending_machine'),
  PROP_mailbox_pair: slot('props', 'PROP_mailbox_pair'),
} satisfies Record<string, SlotSpec>;

export type AssetId = keyof typeof ASSET_SLOTS;

const debug = typeof window !== 'undefined' && window.location.search.includes('assets=debug');

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  // 同一個 GLB 在場景裡放好幾份（路燈、機車）時各自複製；幾何與材質共用
  const copy = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o: Object3D) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);
  return <primitive object={copy} />;
}

class Fallback extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function AssetSlot({ id, children }: { id: AssetId; children: ReactNode }) {
  const spec: SlotSpec = ASSET_SLOTS[id];
  if (spec.status !== 'ready') {
    return debug ? (
      <group userData={{ placeholder: id }}>
        {children}
        <PlaceholderMark />
      </group>
    ) : (
      <>{children}</>
    );
  }
  return (
    <Fallback fallback={children}>
      <Suspense fallback={children}>
        <Model url={spec.url} />
      </Suspense>
    </Fallback>
  );
}

/** debug 模式：暫代模型旁邊插一根洋紅色標記 */
function PlaceholderMark() {
  return (
    <mesh position-y={3} userData={{ noBake: true }}>
      <octahedronGeometry args={[0.25]} />
      <meshBasicMaterial color="#ff2bd6" wireframe />
    </mesh>
  );
}
