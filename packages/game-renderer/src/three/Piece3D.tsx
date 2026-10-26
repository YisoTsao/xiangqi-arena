import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { RenderPiece, RenderQuality } from '../model';
import { PALETTE } from '../theme';
import { pieceBackTexture, pieceFaceTextures } from './textures';

const geometryCache = new Map<
  string,
  { side: THREE.LatheGeometry; cap: THREE.CircleGeometry; bevel: number }
>();

/** 帶倒角的厚圓盤側面（Lathe）＋上下蓋 */
export function pieceGeometry(radius: number, height: number) {
  const key = `${radius}:${height}`;
  const hit = geometryCache.get(key);
  if (hit) return hit;
  const b = height * 0.3;
  const pts = [
    [radius - b, 0],
    [radius - b * 0.4, b * 0.1],
    [radius - b * 0.1, b * 0.5],
    [radius, b],
    [radius, height - b],
    [radius - b * 0.1, height - b * 0.5],
    [radius - b * 0.4, height - b * 0.1],
    [radius - b, height],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const side = new THREE.LatheGeometry(pts, 56);
  const cap = new THREE.CircleGeometry(radius - b, 56);
  const value = { side, cap, bevel: b };
  geometryCache.set(key, value);
  return value;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const now = () => performance.now() / 1000;

export interface Piece3DProps {
  piece: RenderPiece;
  x: number;
  z: number;
  radius: number;
  height: number;
  hovered: boolean;
  selected: boolean;
  quality: RenderQuality;
  animationScale: number;
  /** 棋盤整體旋轉時，讓棋子文字保持正向 */
  yaw?: number;
  /** 被吃掉的殘影：播放消失動畫 */
  dying?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
}

export function Piece3D(props: Piece3DProps) {
  const { piece, x, z, radius, height, quality, animationScale } = props;
  const outer = useRef<THREE.Group>(null);
  const flipper = useRef<THREE.Group>(null);
  const { side: sideGeo, cap } = pieceGeometry(radius, height);
  const texSize = quality === 'high' ? 512 : 256;

  const sideMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: piece.faceUp || piece.side ? PALETTE.ivoryEdge : '#3f7d66',
        roughness: 0.42,
        clearcoat: quality === 'low' ? 0 : 0.6,
        clearcoatRoughness: 0.35,
      }),
    // 側面顏色：蓋牌時偏玉色
    [piece.faceUp, piece.side, quality],
  );
  const faceMaterial = useMemo(() => {
    if (piece.side && piece.kind) {
      const { map, bump } = pieceFaceTextures(piece.side, piece.kind, texSize);
      return new THREE.MeshStandardMaterial({
        map,
        bumpMap: quality === 'low' ? null : bump,
        bumpScale: 2.2,
        roughness: 0.48,
      });
    }
    return new THREE.MeshStandardMaterial({ color: PALETTE.ivory, roughness: 0.5 });
  }, [piece.side, piece.kind, texSize, quality]);
  const backMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: pieceBackTexture(texSize),
        roughness: 0.3,
        metalness: 0.05,
      }),
    [texSize],
  );

  useEffect(
    () => () => {
      sideMaterial.dispose();
      faceMaterial.dispose();
    },
    [sideMaterial, faceMaterial],
  );
  useEffect(() => () => backMaterial.dispose(), [backMaterial]);

  const anim = useRef({
    fromX: x,
    fromZ: z,
    toX: x,
    toZ: z,
    moveT0: 0,
    moveDur: 0,
    flipFrom: piece.faceUp ? 0 : Math.PI,
    flipTo: piece.faceUp ? 0 : Math.PI,
    flipT0: 0,
    flipDur: 0,
    lift: 0,
    dieT0: 0,
    initialised: false,
  });

  // 位置變化 → 啟動移動動畫
  useEffect(() => {
    const a = anim.current;
    const g = outer.current;
    if (!a.initialised) {
      a.initialised = true;
      return;
    }
    if (a.toX === x && a.toZ === z) return;
    a.fromX = g ? g.position.x : a.toX;
    a.fromZ = g ? g.position.z : a.toZ;
    a.toX = x;
    a.toZ = z;
    a.moveT0 = now();
    a.moveDur = 0.34 * animationScale;
  }, [x, z, animationScale]);

  // 翻面
  useEffect(() => {
    const a = anim.current;
    const target = piece.faceUp ? 0 : Math.PI;
    if (a.flipTo === target) return;
    a.flipFrom = flipper.current ? flipper.current.rotation.x : a.flipTo;
    a.flipTo = target;
    a.flipT0 = now();
    a.flipDur = 0.5 * animationScale;
  }, [piece.faceUp, animationScale]);

  useEffect(() => {
    if (props.dying) anim.current.dieT0 = now();
  }, [props.dying]);

  useFrame((_, delta) => {
    const g = outer.current;
    const f = flipper.current;
    if (!g || !f) return;
    const a = anim.current;
    const t = now();

    // 移動（拋物線弧度）
    let arcY = 0;
    if (a.moveDur > 0 && t - a.moveT0 < a.moveDur) {
      const p = easeInOut((t - a.moveT0) / a.moveDur);
      g.position.x = a.fromX + (a.toX - a.fromX) * p;
      g.position.z = a.fromZ + (a.toZ - a.fromZ) * p;
      arcY = Math.sin(Math.PI * p) * 0.45;
    } else {
      g.position.x = a.toX;
      g.position.z = a.toZ;
    }

    // 翻面（含抬起）
    let flipY = 0;
    if (a.flipDur > 0 && t - a.flipT0 < a.flipDur) {
      const p = easeInOut((t - a.flipT0) / a.flipDur);
      f.rotation.x = a.flipFrom + (a.flipTo - a.flipFrom) * p;
      flipY = Math.sin(Math.PI * p) * radius * 1.1;
    } else {
      f.rotation.x = a.flipTo;
    }

    // Hover / 選取浮起（平滑阻尼）
    const targetLift = props.selected ? 0.2 : props.hovered ? 0.08 : 0;
    a.lift = THREE.MathUtils.damp(a.lift, targetLift, 14, delta);
    g.position.y = height / 2 + a.lift + arcY + flipY;

    // 被吃：延遲後上升縮小
    if (props.dying) {
      const delay = 0.22 * animationScale;
      const dur = Math.max(0.001, 0.4 * animationScale);
      const p = Math.min(1, Math.max(0, (t - a.dieT0 - delay) / dur));
      const s = 1 - easeInOut(p);
      g.scale.setScalar(Math.max(0.001, s));
      g.position.y += p * 0.6;
      g.rotation.y = (props.yaw ?? 0) + p * 1.5;
    }
  });

  const shadows = quality === 'high';
  return (
    <group
      ref={outer}
      position={[x, height / 2, z]}
      rotation={[0, props.yaw ?? 0, 0]}
      onClick={props.onClick}
      onPointerOver={props.onPointerOver}
      onPointerOut={props.onPointerOut}
    >
      <group ref={flipper} rotation={[piece.faceUp ? 0 : Math.PI, 0, 0]}>
        <group position={[0, -height / 2, 0]}>
          <mesh
            geometry={sideGeo}
            material={sideMaterial}
            castShadow={shadows}
            receiveShadow={shadows}
          />
          <mesh
            geometry={cap}
            material={faceMaterial}
            position={[0, height + 0.0005, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            castShadow={shadows}
          />
          <mesh
            geometry={cap}
            material={backMaterial}
            position={[0, -0.0005, 0]}
            rotation={[Math.PI / 2, 0, Math.PI]}
          />
        </group>
      </group>
    </group>
  );
}
