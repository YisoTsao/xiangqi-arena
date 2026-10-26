import { useMemo } from 'react';
import * as THREE from 'three';
import { LAYOUTS } from '../layout';
import type { BoardLayout, RenderQuality } from '../model';
import { PALETTE } from '../theme';
import { boardTexture, frameTexture } from './textures';

export const BOARD_THICKNESS = 0.32;

/** 木質棋盤：上面為繪製好的棋盤貼圖，外圍深色木框與底座 */
export function BoardMesh({ layout, quality }: { layout: BoardLayout; quality: RenderQuality }) {
  const spec = LAYOUTS[layout];
  const resolution = quality === 'high' ? 2048 : quality === 'medium' ? 1536 : 1024;
  const materials = useMemo(() => {
    const top = new THREE.MeshStandardMaterial({
      map: boardTexture(layout, resolution),
      roughness: 0.62,
      metalness: 0,
    });
    const frame = frameTexture();
    const side = new THREE.MeshStandardMaterial({ map: frame, color: '#7a4a26', roughness: 0.5 });
    // BoxGeometry 材質順序：+x, -x, +y, -y, +z, -z
    return [side, side, top, side, side, side];
  }, [layout, resolution]);

  const baseMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        map: frameTexture(),
        color: '#6b3d1c',
        roughness: 0.35,
        clearcoat: quality === 'low' ? 0 : 0.8,
        clearcoatRoughness: 0.25,
      }),
    [quality],
  );
  const shadows = quality === 'high';

  return (
    <group>
      <mesh position={[0, -BOARD_THICKNESS / 2, 0]} material={materials} receiveShadow={shadows}>
        <boxGeometry args={[spec.boardWidth, BOARD_THICKNESS, spec.boardDepth]} />
      </mesh>
      {/* 底座框 */}
      <mesh
        position={[0, -BOARD_THICKNESS - 0.12, 0]}
        material={baseMaterial}
        receiveShadow={shadows}
      >
        <boxGeometry args={[spec.boardWidth + 0.5, 0.24, spec.boardDepth + 0.5]} />
      </mesh>
      {/* 地面：承接陰影的暗色桌面 */}
      <mesh position={[0, -BOARD_THICKNESS - 0.245, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#1a1410" roughness={0.95} />
      </mesh>
    </group>
  );
}
