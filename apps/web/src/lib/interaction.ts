import type { XiangqiAction, XiangqiMatchView } from '@xiangqi-arena/games-xiangqi';
import type { BoardModel, BoardTarget, RenderPiece } from '@xiangqi-arena/game-renderer';

export interface ClickResult {
  selected: number | null;
  action: XiangqiAction | null;
}

type GameView = XiangqiMatchView;

const movesFrom = (view: GameView, from: number) =>
  view.legalActions.filter(
    (a): a is Extract<XiangqiAction, { kind: 'move' }> => a.kind === 'move' && a.from === from,
  );

/**
 * 點擊棋盤的互動邏輯（純函式）。只使用伺服器提供的 legalActions 作為提示，
 * 真正的合法性仍由伺服器判定。
 */
export function handleSquareClick(
  view: GameView,
  yourSeat: number | null,
  selected: number | null,
  square: number,
): ClickResult {
  if (yourSeat === null || view.turnSeat !== yourSeat || view.outcome) {
    return { selected: null, action: null };
  }
  if (selected !== null) {
    const move = movesFrom(view, selected).find((m) => m.to === square);
    if (move) return { selected: null, action: move };
    if (selected === square) return { selected: null, action: null };
  }
  const flip = view.legalActions.find((a) => a.kind === 'flip' && a.square === square);
  if (flip) return { selected: null, action: flip };
  if (movesFrom(view, square).length > 0) return { selected: square, action: null };
  return { selected: null, action: null };
}

export function toBoardModel(
  view: GameView,
  options: { selected: number | null; flipped: boolean; interactive: boolean },
): BoardModel {
  const pieces: RenderPiece[] = [];
  view.board.forEach((cell, square) => {
    if (!cell) return;
    pieces.push(
      cell.faceUp
        ? { id: cell.id, square, faceUp: true, side: cell.side, kind: cell.kind }
        : { id: cell.id, square, faceUp: false, side: null, kind: null },
    );
  });
  const targets: BoardTarget[] =
    options.selected === null
      ? []
      : movesFrom(view, options.selected).map((m) => ({
          square: m.to,
          capture: view.board[m.to] != null,
        }));
  return {
    layout: view.mode === 'classic' ? 'xiangqi' : 'banqi',
    pieces,
    selected: options.selected,
    targets,
    flippable: view.legalActions.flatMap((a) => (a.kind === 'flip' ? [a.square] : [])),
    lastMove: view.lastAction ? { from: view.lastAction.from, to: view.lastAction.to } : null,
    checkSquare: view.checkSquare,
    flipped: options.flipped,
    interactive: options.interactive,
  };
}
