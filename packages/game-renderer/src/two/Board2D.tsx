import { pieceLabel } from '@xiangqi-arena/game-core';
import { LAYOUTS, squareToWorld } from '../layout';
import type { BoardViewProps } from '../model';
import { PALETTE, PIECE_FONT } from '../theme';

const UNIT = 60;

/**
 * 2D 備援棋盤（SVG）：WebGL 不可用或使用者選擇省電模式時使用。
 * 與 Board3D 使用同一份 BoardModel 與點擊介面。
 */
export function Board2D({ model, onSquareClick, animationScale }: BoardViewProps) {
  const spec = LAYOUTS[model.layout];
  const W = spec.boardWidth * UNIT;
  const H = spec.boardDepth * UNIT;
  const total = spec.cols * spec.rows;
  const R = spec.pieceRadius * UNIT;
  const toXY = (sq: number): [number, number] => {
    const [x, z] = squareToWorld(model.layout, sq, model.flipped);
    return [W / 2 + x * UNIT, H / 2 - z * UNIT];
  };
  const dur = `${Math.round(260 * animationScale)}ms`;
  const S = spec.spacing * UNIT;
  const lines: React.ReactNode[] = [];

  if (model.layout === 'xiangqi') {
    const x0 = W / 2 - 4 * S;
    const y0 = H / 2 - 4.5 * S;
    for (let r = 0; r < 10; r++) {
      lines.push(<line key={`h${r}`} x1={x0} x2={x0 + 8 * S} y1={y0 + r * S} y2={y0 + r * S} />);
    }
    for (let f = 0; f < 9; f++) {
      const x = x0 + f * S;
      if (f === 0 || f === 8)
        lines.push(<line key={`v${f}`} x1={x} x2={x} y1={y0} y2={y0 + 9 * S} />);
      else {
        lines.push(<line key={`v${f}a`} x1={x} x2={x} y1={y0} y2={y0 + 4 * S} />);
        lines.push(<line key={`v${f}b`} x1={x} x2={x} y1={y0 + 5 * S} y2={y0 + 9 * S} />);
      }
    }
    for (const top of [0, 7]) {
      const y = y0 + top * S;
      lines.push(<line key={`p${top}a`} x1={x0 + 3 * S} y1={y} x2={x0 + 5 * S} y2={y + 2 * S} />);
      lines.push(<line key={`p${top}b`} x1={x0 + 5 * S} y1={y} x2={x0 + 3 * S} y2={y + 2 * S} />);
    }
  } else {
    const x0 = W / 2 - (spec.cols * S) / 2;
    const y0 = H / 2 - (spec.rows * S) / 2;
    for (let c = 0; c <= spec.cols; c++) {
      lines.push(
        <line key={`c${c}`} x1={x0 + c * S} x2={x0 + c * S} y1={y0} y2={y0 + spec.rows * S} />,
      );
    }
    for (let r = 0; r <= spec.rows; r++) {
      lines.push(
        <line key={`r${r}`} x1={x0} x2={x0 + spec.cols * S} y1={y0 + r * S} y2={y0 + r * S} />,
      );
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'manipulation' }}
      role="grid"
      aria-label="棋盤（2D）"
    >
      <defs>
        <linearGradient id="xa-wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={PALETTE.woodLight} />
          <stop offset="1" stopColor={PALETTE.woodMid} />
        </linearGradient>
        <radialGradient id="xa-ivory" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fbf1da" />
          <stop offset="1" stopColor={PALETTE.ivoryEdge} />
        </radialGradient>
        <radialGradient id="xa-jade" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#4f9a7d" />
          <stop offset="1" stopColor={PALETTE.jadeDark} />
        </radialGradient>
        <filter id="xa-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000" floodOpacity="0.45" />
        </filter>
        <style>{`
          .xa-piece { transition: transform ${dur} ease-in-out; }
          @keyframes xa-flip { 0% { transform: scaleX(0.05); } 100% { transform: scaleX(1); } }
          .xa-flipped { animation: xa-flip ${dur} ease-out; transform-box: fill-box; transform-origin: center; }
          @keyframes xa-pulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
          .xa-pulse { animation: xa-pulse 1.2s ease-in-out infinite; }
        `}</style>
      </defs>
      <rect
        x={0}
        y={0}
        width={W}
        height={H}
        rx={14}
        fill="url(#xa-wood)"
        stroke={PALETTE.frame}
        strokeWidth={10}
      />
      <g stroke={PALETTE.ink} strokeWidth={2} strokeLinecap="round">
        {lines}
      </g>
      {model.layout === 'xiangqi' && (
        <g
          fill={PALETTE.ink}
          fontFamily={PIECE_FONT}
          fontSize={S * 0.55}
          textAnchor="middle"
          dominantBaseline="central"
          opacity={0.85}
        >
          <text x={W / 2 - 2 * S} y={H / 2}>
            楚　河
          </text>
          <text x={W / 2 + 2 * S} y={H / 2}>
            漢　界
          </text>
        </g>
      )}

      {model.lastMove && (
        <g fill={PALETTE.gold} opacity={0.35}>
          {model.lastMove.from !== null && (
            <circle
              cx={toXY(model.lastMove.from)[0]}
              cy={toXY(model.lastMove.from)[1]}
              r={R * 0.5}
            />
          )}
          <circle cx={toXY(model.lastMove.to)[0]} cy={toXY(model.lastMove.to)[1]} r={R * 1.2} />
        </g>
      )}

      {model.pieces.map((p) => {
        const [x, y] = toXY(p.square);
        const selected = model.selected === p.square;
        return (
          <g
            key={p.id}
            className="xa-piece"
            style={{ transform: `translate(${x}px, ${y}px)` }}
            filter="url(#xa-shadow)"
          >
            <g className={p.faceUp ? 'xa-flipped' : undefined} key={p.faceUp ? 'up' : 'down'}>
              <circle
                r={R}
                fill={p.faceUp ? 'url(#xa-ivory)' : 'url(#xa-jade)'}
                stroke={selected ? PALETTE.goldGlow : '#8a6a3c'}
                strokeWidth={selected ? 5 : 2}
              />
              {p.faceUp && p.side && p.kind ? (
                <>
                  <circle
                    r={R * 0.8}
                    fill="none"
                    stroke={p.side === 'red' ? PALETTE.red : PALETTE.black}
                    strokeWidth={2}
                  />
                  <text
                    fill={p.side === 'red' ? PALETTE.red : PALETTE.black}
                    fontFamily={PIECE_FONT}
                    fontWeight={700}
                    fontSize={R * 1.05}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {pieceLabel(p.side, p.kind)}
                  </text>
                </>
              ) : (
                <circle
                  r={R * 0.62}
                  fill="none"
                  stroke={PALETTE.gold}
                  strokeWidth={2}
                  opacity={0.8}
                />
              )}
            </g>
          </g>
        );
      })}

      {model.targets.map((t) => {
        const [x, y] = toXY(t.square);
        return t.capture ? (
          <circle
            key={`t${t.square}`}
            className="xa-pulse"
            cx={x}
            cy={y}
            r={R * 1.12}
            fill="none"
            stroke={PALETTE.danger}
            strokeWidth={4}
          />
        ) : (
          <circle
            key={`t${t.square}`}
            cx={x}
            cy={y}
            r={R * 0.28}
            fill={PALETTE.goldGlow}
            opacity={0.9}
          />
        );
      })}
      {model.checkSquare !== null && (
        <circle
          className="xa-pulse"
          cx={toXY(model.checkSquare)[0]}
          cy={toXY(model.checkSquare)[1]}
          r={R * 1.25}
          fill="none"
          stroke={PALETTE.danger}
          strokeWidth={6}
        />
      )}

      {/* 透明點擊層 */}
      <g>
        {Array.from({ length: total }, (_, sq) => {
          const [x, y] = toXY(sq);
          return (
            <circle
              key={`hit${sq}`}
              data-square={sq}
              cx={x}
              cy={y}
              r={S * 0.48}
              fill="transparent"
              style={{ cursor: model.interactive ? 'pointer' : 'default' }}
              onClick={() => model.interactive && onSquareClick(sq)}
            />
          );
        })}
      </g>
    </svg>
  );
}
