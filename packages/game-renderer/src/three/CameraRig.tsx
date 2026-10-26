import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LAYOUTS } from '../layout';
import type { BoardLayout } from '../model';

/** 仰角（相對水平面）；固定斜俯視，不提供自由鏡頭 */
const ELEVATION = THREE.MathUtils.degToRad(60);

/** 依畫面比例計算距離，讓整個棋盤完整入鏡 */
export function CameraRig({ layout, rotated = false }: { layout: BoardLayout; rotated?: boolean }) {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const spec = LAYOUTS[layout];
    const boardWidth = rotated ? spec.boardDepth : spec.boardWidth;
    const boardDepth = rotated ? spec.boardWidth : spec.boardDepth;
    const aspect = size.width / Math.max(1, size.height);
    const vfov = THREE.MathUtils.degToRad(cam.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const margin = 1.06;
    const halfW = (boardWidth / 2 + 0.3) * margin;
    const halfD = ((boardDepth / 2 + 0.3) * Math.sin(ELEVATION) + 0.4) * margin;
    const distW = halfW / Math.tan(hfov / 2) + (boardDepth / 2) * Math.cos(ELEVATION);
    const distD = halfD / Math.tan(vfov / 2) + 0.6;
    const dist = Math.max(distW, distD);
    cam.position.set(0, Math.sin(ELEVATION) * dist, Math.cos(ELEVATION) * dist);
    cam.near = 0.1;
    cam.far = dist * 4;
    cam.lookAt(0, 0, 0.15);
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height, layout, rotated]);
  return null;
}
