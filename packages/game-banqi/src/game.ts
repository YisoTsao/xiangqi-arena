import {
  opposite,
  otherSeat,
  pieceLabel,
  type DrawReason,
  type PieceKind,
  type Seat,
  type Side,
  type WinReason,
} from '@xiangqi-arena/game-core';
import { err, ok, shuffle, type RandomInt, type Result } from '@xiangqi-arena/shared';
import { CELLS, ORTHO, cell, cellName, colOf, isCell, neighbors, onBoard, rowOf } from './board';
import { BANQI_SET, DEFAULT_BANQI_RULES, type BanqiRules } from './rules';

export interface BanqiPiece {
  /** 依發牌位置編號，不透露棋子身分 */
  readonly id: string;
  readonly side: Side;
  readonly kind: PieceKind;
  readonly faceUp: boolean;
}

export type BanqiAction =
  { type: 'flip'; square: number } | { type: 'move'; from: number; to: number };

export type BanqiOutcome =
  { type: 'win'; winner: Seat; reason: WinReason } | { type: 'draw'; reason: DrawReason };

export interface BanqiActionRecord {
  ply: number;
  seat: Seat;
  action: BanqiAction;
  pieceId: string;
  /** 翻棋時揭露的棋子（公開資訊） */
  revealed: { side: Side; kind: PieceKind } | null;
  captured: { side: Side; kind: PieceKind } | null;
  notation: string;
}

export interface BanqiState {
  readonly cells: readonly (BanqiPiece | null)[];
  readonly turn: Seat;
  /** 座位對應陣營；第一次翻棋後才決定 */
  readonly seatSides: readonly [Side, Side] | null;
  readonly ply: number;
  readonly plySinceProgress: number;
  readonly history: readonly BanqiActionRecord[];
  /** 含未翻開棋子身分的局面鍵，只存在伺服器端 */
  readonly positionKeys: readonly string[];
  readonly captured: { readonly red: readonly PieceKind[]; readonly black: readonly PieceKind[] };
  readonly outcome: BanqiOutcome | null;
  readonly rules: BanqiRules;
}

export type BanqiActionError =
  | 'GAME_OVER'
  | 'NOT_YOUR_TURN'
  | 'INVALID_SQUARE'
  | 'NO_PIECE'
  | 'ALREADY_FACE_UP'
  | 'PIECE_HIDDEN'
  | 'NOT_YOUR_PIECE'
  | 'ILLEGAL_MOVE';

export interface CreateBanqiOptions {
  random: RandomInt;
  rules?: Partial<BanqiRules>;
  firstSeat?: Seat;
}

/** 洗牌並蓋上 32 顆棋子 */
export function createBanqiGame(options: CreateBanqiOptions): BanqiState {
  const pieces: { side: Side; kind: PieceKind }[] = [];
  for (const side of ['red', 'black'] as const) {
    for (const kind of BANQI_SET) pieces.push({ side, kind });
  }
  const dealt = shuffle(pieces, options.random);
  const cells = dealt.map((p, i) => ({ id: `p${i}`, side: p.side, kind: p.kind, faceUp: false }));
  return createBanqiGameFromCells(cells, options);
}

/** 以指定局面建立對局（測試與殘局用） */
export function createBanqiGameFromCells(
  cells: readonly (BanqiPiece | null)[],
  options: { rules?: Partial<BanqiRules>; firstSeat?: Seat; seatSides?: [Side, Side] } = {},
): BanqiState {
  if (cells.length !== CELLS) throw new Error(`Banqi board must have ${CELLS} cells`);
  const turn = options.firstSeat ?? 0;
  const base = {
    cells,
    turn,
    seatSides: options.seatSides ?? null,
    ply: 0,
    plySinceProgress: 0,
    history: [],
    captured: { red: [], black: [] },
    outcome: null,
    rules: { ...DEFAULT_BANQI_RULES, ...options.rules },
  };
  return { ...base, positionKeys: [banqiPositionKey(cells, turn)] };
}

export function banqiPositionKey(cells: readonly (BanqiPiece | null)[], turn: Seat): string {
  return (
    cells
      .map((c) => (c ? `${c.faceUp ? '+' : '-'}${c.side[0]}${c.kind.slice(0, 2)}` : '..'))
      .join('') + `/${turn}`
  );
}

export function sideOfSeat(state: BanqiState, seat: Seat): Side | null {
  return state.seatSides ? state.seatSides[seat] : null;
}

export function canCapture(rules: BanqiRules, attacker: PieceKind, target: PieceKind): boolean {
  if (attacker === 'king' && target === 'pawn') return rules.kingCanCapturePawn;
  if (attacker === 'pawn' && target === 'king') return rules.pawnCanCaptureKing;
  const a = rules.ranks[attacker];
  const t = rules.ranks[target];
  return a > t || (a === t && rules.equalRankCapture);
}

/** 炮的跳吃落點 */
function cannonTargets(state: BanqiState, from: number, side: Side): number[] {
  const out: number[] = [];
  const attacker = state.cells[from];
  if (!attacker) return out;
  for (const [dc, dr] of ORTHO) {
    let c = colOf(from) + dc;
    let r = rowOf(from) + dr;
    let screened = false;
    while (onBoard(c, r)) {
      const occ = state.cells[cell(c, r)];
      if (occ) {
        if (!screened) screened = true;
        else {
          if (
            occ.faceUp &&
            occ.side !== side &&
            (state.rules.cannonCapturesAnyRank || canCapture(state.rules, 'cannon', occ.kind))
          ) {
            out.push(cell(c, r));
          }
          break;
        }
      }
      c += dc;
      r += dr;
    }
  }
  return out;
}

/** 某顆己方明子的合法落點（走到空位或吃子） */
export function banqiTargets(state: BanqiState, from: number): number[] {
  const piece = state.cells[from];
  if (!piece || !piece.faceUp) return [];
  const side = piece.side;
  const out: number[] = [];
  for (const n of neighbors(from)) {
    const occ = state.cells[n];
    if (!occ) {
      out.push(n);
      continue;
    }
    if (!occ.faceUp || occ.side === side) continue;
    if (piece.kind === 'cannon' && !state.rules.cannonCanCaptureAdjacent) continue;
    if (canCapture(state.rules, piece.kind, occ.kind)) out.push(n);
  }
  if (piece.kind === 'cannon' && state.rules.cannonJumpCapture) {
    for (const t of cannonTargets(state, from, side)) if (!out.includes(t)) out.push(t);
  }
  return out;
}

export function legalBanqiActions(state: BanqiState, seat: Seat): BanqiAction[] {
  if (state.outcome || seat !== state.turn) return [];
  const out: BanqiAction[] = [];
  const mySide = sideOfSeat(state, seat);
  state.cells.forEach((c, i) => {
    if (!c) return;
    if (!c.faceUp) {
      out.push({ type: 'flip', square: i });
      return;
    }
    if (mySide && c.side === mySide) {
      for (const to of banqiTargets(state, i)) out.push({ type: 'move', from: i, to });
    }
  });
  return out;
}

export function applyBanqiAction(
  state: BanqiState,
  seat: Seat,
  action: BanqiAction,
): Result<BanqiState, BanqiActionError> {
  if (state.outcome) return err('GAME_OVER');
  if (seat !== state.turn) return err('NOT_YOUR_TURN');

  const cells = state.cells.slice();
  let seatSides = state.seatSides;
  let record: BanqiActionRecord;
  const captured = { red: [...state.captured.red], black: [...state.captured.black] };
  let progress = false;

  if (action.type === 'flip') {
    if (!isCell(action.square)) return err('INVALID_SQUARE');
    const piece = cells[action.square];
    if (!piece) return err('NO_PIECE');
    if (piece.faceUp) return err('ALREADY_FACE_UP');
    cells[action.square] = { ...piece, faceUp: true };
    // 台灣規則：第一顆翻出的棋子顏色即為翻棋者的陣營
    if (!seatSides) {
      seatSides =
        seat === 0 ? [piece.side, opposite(piece.side)] : [opposite(piece.side), piece.side];
    }
    progress = true;
    record = {
      ply: state.ply + 1,
      seat,
      action,
      pieceId: piece.id,
      revealed: { side: piece.side, kind: piece.kind },
      captured: null,
      notation: `翻 ${cellName(action.square)} ${pieceLabel(piece.side, piece.kind)}`,
    };
  } else {
    if (!isCell(action.from) || !isCell(action.to)) return err('INVALID_SQUARE');
    const piece = cells[action.from];
    if (!piece) return err('NO_PIECE');
    if (!piece.faceUp) return err('PIECE_HIDDEN');
    const mySide = sideOfSeat(state, seat);
    if (!mySide || piece.side !== mySide) return err('NOT_YOUR_PIECE');
    if (!banqiTargets(state, action.from).includes(action.to)) return err('ILLEGAL_MOVE');
    const target = cells[action.to] ?? null;
    cells[action.to] = piece;
    cells[action.from] = null;
    if (target) {
      captured[target.side].push(target.kind);
      progress = true;
    }
    const label = pieceLabel(piece.side, piece.kind);
    record = {
      ply: state.ply + 1,
      seat,
      action,
      pieceId: piece.id,
      revealed: null,
      captured: target ? { side: target.side, kind: target.kind } : null,
      notation: target
        ? `${label} ${cellName(action.from)}×${cellName(action.to)} ${pieceLabel(target.side, target.kind)}`
        : `${label} ${cellName(action.from)}-${cellName(action.to)}`,
    };
  }

  const turn = otherSeat(seat);
  const next: BanqiState = {
    ...state,
    cells,
    seatSides,
    turn,
    ply: state.ply + 1,
    plySinceProgress: progress ? 0 : state.plySinceProgress + 1,
    history: [...state.history, record],
    positionKeys: [...state.positionKeys, banqiPositionKey(cells, turn)],
    captured,
    outcome: null,
  };
  return ok({ ...next, outcome: evaluateBanqiOutcome(next, seat) });
}

export function endBanqiGame(state: BanqiState, outcome: BanqiOutcome): BanqiState {
  if (state.outcome) return state;
  return { ...state, outcome };
}

function evaluateBanqiOutcome(state: BanqiState, mover: Seat): BanqiOutcome | null {
  const next = state.turn;
  if (state.seatSides) {
    const nextSide = state.seatSides[next];
    const remaining = state.cells.filter((c) => c && c.side === nextSide).length;
    if (remaining === 0) return { type: 'win', winner: mover, reason: 'no-pieces' };
  }
  if (legalBanqiActions(state, next).length === 0) {
    return { type: 'win', winner: mover, reason: 'no-moves' };
  }
  const { repetitionDrawCount, noProgressDrawPlies } = state.rules;
  if (repetitionDrawCount > 0) {
    const key = state.positionKeys[state.positionKeys.length - 1];
    const count = state.positionKeys.filter((k) => k === key).length;
    if (count >= repetitionDrawCount) return { type: 'draw', reason: 'repetition' };
  }
  if (noProgressDrawPlies > 0 && state.plySinceProgress >= noProgressDrawPlies) {
    return { type: 'draw', reason: 'move-limit' };
  }
  return null;
}
