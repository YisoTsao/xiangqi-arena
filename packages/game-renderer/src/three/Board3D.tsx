import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import { LAYOUTS, squareToWorld, worldToSquare } from '../layout';
import type { BoardViewProps, RenderPiece } from '../model';
import { PALETTE } from '../theme';
import { BoardMesh } from './BoardMesh';
import { CameraRig } from './CameraRig';
import { Markers } from './Markers';
import { Piece3D } from './Piece3D';

interface Ghost {
  key: string;
  piece: RenderPiece;
}

const DPR: Record<BoardViewProps['quality'], [number, number]> = {
  low: [1, 1],
  medium: [1, 1.5],
  high: [1, 2],
};

/** 2.5D 棋盤（React Three Fiber）。只負責呈現與回報點擊，不含任何規則判斷。 */
export function Board3D(props: BoardViewProps) {
  const [cursor, setCursor] = useState(false);
  return (
    <Canvas
      dpr={DPR[props.quality]}
      shadows={props.quality === 'high'}
      gl={{ antialias: props.quality !== 'low', powerPreference: 'high-performance' }}
      camera={{ fov: 34, position: [0, 14, 9] }}
      style={{ cursor: cursor ? 'pointer' : 'default', touchAction: 'manipulation' }}
      aria-label="棋盤"
    >
      <Scene {...props} setCursor={setCursor} />
    </Canvas>
  );
}

function Scene({
  model,
  onSquareClick,
  quality,
  animationScale,
  setCursor,
}: BoardViewProps & { setCursor: (v: boolean) => void }) {
  const spec = LAYOUTS[model.layout];
  const size = useThree((s) => s.size);
  // 手機直向時把 8×4 的暗棋盤轉 90°，讓棋盤佔滿畫面
  const rotated = model.layout === 'banqi' && size.width / Math.max(1, size.height) < 0.85;
  const yaw = rotated ? Math.PI / 2 : 0;
  const [hovered, setHovered] = useState<number | null>(null);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const prevPieces = useRef<RenderPiece[]>(model.pieces);

  // 被吃掉的棋子留下殘影播放動畫
  useEffect(() => {
    const current = new Set(model.pieces.map((p) => p.id));
    const removed = prevPieces.current.filter((p) => !current.has(p.id));
    prevPieces.current = model.pieces;
    if (removed.length === 0 || animationScale === 0) return;
    const stamp = Date.now();
    const added = removed.map((piece) => ({ key: `${piece.id}:${stamp}`, piece }));
    setGhosts((g) => [...g, ...added]);
    const timer = setTimeout(
      () => setGhosts((g) => g.filter((x) => !added.includes(x))),
      800 * animationScale + 100,
    );
    return () => clearTimeout(timer);
  }, [model.pieces, animationScale]);

  const interactiveSquares = useMemo(() => {
    const set = new Set<number>(model.flippable);
    for (const t of model.targets) set.add(t.square);
    return set;
  }, [model.flippable, model.targets]);

  const click = (square: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (model.interactive) onSquareClick(square);
  };
  const over = (square: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(square);
  };

  // 世界座標 → 棋盤本地座標（扣除整體旋轉）
  const pointToSquare = (px: number, pz: number) => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return worldToSquare(model.layout, px * c - pz * s, px * s + pz * c, model.flipped);
  };
  const onPlaneClick = (e: ThreeEvent<MouseEvent>) => {
    if (!model.interactive) return;
    const sq = pointToSquare(e.point.x, e.point.z);
    if (sq !== null) onSquareClick(sq);
  };
  const onPlaneMove = (e: ThreeEvent<PointerEvent>) =>
    setHovered(pointToSquare(e.point.x, e.point.z));

  const cursor =
    model.interactive &&
    hovered !== null &&
    (interactiveSquares.has(hovered) || model.pieces.some((p) => p.square === hovered));
  useEffect(() => setCursor(cursor), [cursor, setCursor]);

  return (
    <>
      <color attach="background" args={[PALETTE.background]} />
      <fog attach="fog" args={[PALETTE.background, 22, 45]} />
      <CameraRig layout={model.layout} rotated={rotated} />

      <hemisphereLight args={['#ffe9c7', '#2a1d12', 0.55]} />
      <directionalLight
        position={[-6, 13, 7]}
        intensity={2.1}
        color="#ffe2b0"
        castShadow={quality === 'high'}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[8, 6, -6]} intensity={0.45} color="#9fb7ff" />
      {quality !== 'low' && (
        <Environment resolution={128} frames={1}>
          <Lightformer intensity={1.6} color="#ffd9a0" position={[0, 6, 4]} scale={[10, 3, 1]} />
          <Lightformer intensity={0.6} color="#9fb7ff" position={[-6, 3, -4]} scale={[6, 2, 1]} />
          <Lightformer
            intensity={0.8}
            color="#ffffff"
            position={[6, 4, 0]}
            rotation-y={-Math.PI / 2}
            scale={[6, 2, 1]}
          />
        </Environment>
      )}

      <group rotation={[0, yaw, 0]}>
        <BoardMesh layout={model.layout} quality={quality} />
        {quality !== 'low' && (
          <ContactShadows
            position={[0, 0.002, 0]}
            scale={[spec.boardWidth, spec.boardDepth]}
            resolution={quality === 'high' ? 1024 : 512}
            blur={2.2}
            opacity={0.55}
            far={1.2}
            color="#2b1608"
          />
        )}
        <Markers model={model} />

        {/* 點擊平面：用來點空的交點 */}
        <mesh
          position={[0, 0.003, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={onPlaneClick}
          onPointerMove={onPlaneMove}
          onPointerOut={() => setHovered(null)}
        >
          <planeGeometry args={[spec.boardWidth, spec.boardDepth]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        {model.pieces.map((p) => {
          const [x, z] = squareToWorld(model.layout, p.square, model.flipped);
          return (
            <Piece3D
              key={p.id}
              piece={p}
              x={x}
              z={z}
              radius={spec.pieceRadius}
              height={spec.pieceHeight}
              hovered={model.interactive && hovered === p.square}
              selected={model.selected === p.square}
              quality={quality}
              animationScale={animationScale}
              yaw={-yaw}
              onClick={click(p.square)}
              onPointerOver={over(p.square)}
            />
          );
        })}
        {ghosts.map((g) => {
          const [x, z] = squareToWorld(model.layout, g.piece.square, model.flipped);
          return (
            <Piece3D
              key={g.key}
              piece={g.piece}
              x={x}
              z={z}
              radius={spec.pieceRadius}
              height={spec.pieceHeight}
              hovered={false}
              selected={false}
              quality={quality}
              animationScale={animationScale}
              yaw={-yaw}
              dying
            />
          );
        })}
      </group>
    </>
  );
}
