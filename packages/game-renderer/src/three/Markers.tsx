import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LAYOUTS, squareToWorld } from '../layout';
import type { BoardModel } from '../model';
import { PALETTE } from '../theme';

const Y = 0.006;

function Pulse({
  children,
  speed = 3,
  amount = 0.08,
}: {
  children: React.ReactNode;
  speed?: number;
  amount?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * speed) * amount);
  });
  return <group ref={ref}>{children}</group>;
}

/** 選取光圈、合法落點、最後一步、將軍提示 */
export function Markers({ model }: { model: BoardModel }) {
  const spec = LAYOUTS[model.layout];
  const R = spec.pieceRadius;
  const pos = (sq: number): [number, number, number] => {
    const [x, z] = squareToWorld(model.layout, sq, model.flipped);
    return [x, Y, z];
  };

  return (
    <group>
      {model.lastMove && (
        <>
          {model.lastMove.from !== null && (
            <mesh position={pos(model.lastMove.from)} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[R * 0.55, R * 0.68, 40]} />
              <meshBasicMaterial
                color={PALETTE.gold}
                transparent
                opacity={0.45}
                depthWrite={false}
              />
            </mesh>
          )}
          <mesh position={pos(model.lastMove.to)} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[R * 1.22, 48]} />
            <meshBasicMaterial color={PALETTE.gold} transparent opacity={0.28} depthWrite={false} />
          </mesh>
        </>
      )}

      {model.selected !== null && (
        <group position={pos(model.selected)}>
          <Pulse>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[R * 1.08, R * 1.3, 56]} />
              <meshBasicMaterial
                color={PALETTE.goldGlow}
                transparent
                opacity={0.85}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </Pulse>
          <pointLight
            color={PALETTE.goldGlow}
            intensity={1.6}
            distance={2.2}
            position={[0, 0.8, 0]}
          />
        </group>
      )}

      {model.targets.map((t) =>
        t.capture ? (
          <group key={`t${t.square}`} position={pos(t.square)}>
            <Pulse speed={5} amount={0.05}>
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[R * 1.06, R * 1.24, 48]} />
                <meshBasicMaterial
                  color={PALETTE.danger}
                  transparent
                  opacity={0.85}
                  depthWrite={false}
                  toneMapped={false}
                />
              </mesh>
            </Pulse>
          </group>
        ) : (
          <mesh key={`t${t.square}`} position={pos(t.square)} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[R * 0.26, 32]} />
            <meshBasicMaterial
              color={PALETTE.goldGlow}
              transparent
              opacity={0.8}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ),
      )}

      {model.checkSquare !== null && (
        <group position={pos(model.checkSquare)}>
          <Pulse speed={7} amount={0.12}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[R * 1.1, R * 1.45, 48]} />
              <meshBasicMaterial
                color={PALETTE.danger}
                transparent
                opacity={0.9}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </Pulse>
          <pointLight color={PALETTE.danger} intensity={3} distance={2.5} position={[0, 0.9, 0]} />
        </group>
      )}
    </group>
  );
}
