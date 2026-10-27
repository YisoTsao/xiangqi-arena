import {
  otherSeat,
  type GameDefinition,
  type MatchOutcome,
  type Seat,
  type SeatIndex,
  type Side,
} from '@xiangqi-arena/game-core';
import {
  applyBanqiAction,
  createBanqiGame,
  endBanqiGame,
  legalBanqiActions,
  sideOfSeat,
  type BanqiOutcome,
  type BanqiRules,
  type BanqiState,
} from '@xiangqi-arena/game-banqi';
import {
  applyXiangqiMove,
  checkedKingSquare,
  createXiangqiGame,
  endXiangqiGame,
  getLegalMoves,
  type XiangqiOutcome,
  type XiangqiRules,
  type XiangqiState,
} from '@xiangqi-arena/game-xiangqi';
import { err, ok } from '@xiangqi-arena/shared';
import {
  XiangqiActionSchema,
  XIANGQI_MODE_LABELS,
  type CellView,
  type LastAction,
  type XiangqiAction,
  type XiangqiMode,
  type XiangqiView,
} from './schema';

export type XiangqiGameState =
  { mode: 'classic'; state: XiangqiState; redSeat: Seat } | { mode: 'banqi'; state: BanqiState };

export interface XiangqiDefinitionOptions {
  xiangqiRules?: Partial<XiangqiRules>;
  banqiRules?: Partial<BanqiRules>;
  /** 直接指定大盤象棋開局 FEN（殘局 / 測試） */
  fen?: string;
}

export type XiangqiGameDefinition = GameDefinition<
  XiangqiGameState,
  XiangqiAction,
  XiangqiView,
  XiangqiMode
>;

const asSeat = (seat: SeatIndex): Seat => (seat === 1 ? 1 : 0);

function seatSide(g: XiangqiGameState, seat: Seat): Side | null {
  if (g.mode === 'classic') return seat === g.redSeat ? 'red' : 'black';
  return sideOfSeat(g.state, seat);
}

function turnSeat(g: XiangqiGameState): Seat | null {
  if (g.state.outcome) return null;
  if (g.mode === 'classic') return g.state.turn === 'red' ? g.redSeat : otherSeat(g.redSeat);
  return g.state.turn;
}

/**
 * 象棋遊戲：大盤象棋（classic）與暗棋（banqi）兩種模式。
 * 規則引擎在 game-xiangqi / game-banqi，這裡只負責接上平台介面。
 */
export function createXiangqiDefinition(
  options: XiangqiDefinitionOptions = {},
): XiangqiGameDefinition {
  return {
    id: 'xiangqi',
    name: '象棋',
    players: { min: 2, max: 2 },
    modes: [
      { id: 'classic', label: XIANGQI_MODE_LABELS.classic },
      { id: 'banqi', label: XIANGQI_MODE_LABELS.banqi },
    ],
    defaultMode: 'classic',
    features: { drawOffers: true, clock: true, resign: true },

    parseAction(raw) {
      const r = XiangqiActionSchema.safeParse(raw);
      return r.success ? r.data : null;
    },

    setup({ mode, random, firstSeat }) {
      const first = asSeat(firstSeat);
      if (mode === 'classic') {
        return {
          mode: 'classic',
          state: createXiangqiGame({ fen: options.fen, rules: options.xiangqiRules }),
          redSeat: first,
        };
      }
      return {
        mode: 'banqi',
        state: createBanqiGame({ random, rules: options.banqiRules, firstSeat: first }),
      };
    },

    activeSeats(g) {
      const t = turnSeat(g);
      return t === null ? [] : [t];
    },

    apply(g, seatIndex, action) {
      const seat = asSeat(seatIndex);
      if (g.mode === 'classic') {
        if (action.kind !== 'move') return err('ILLEGAL_ACTION');
        const r = applyXiangqiMove(g.state, seatSide(g, seat)!, action.from, action.to);
        if (!r.ok) return err(r.error === 'NOT_YOUR_PIECE' ? 'NOT_YOUR_PIECE' : 'ILLEGAL_ACTION');
        return ok({
          state: { ...g, state: r.value },
          notation: r.value.history.at(-1)?.notation ?? '',
        });
      }
      const r = applyBanqiAction(
        g.state,
        seat,
        action.kind === 'flip'
          ? { type: 'flip', square: action.square }
          : { type: 'move', from: action.from, to: action.to },
      );
      if (!r.ok) {
        switch (r.error) {
          case 'NOT_YOUR_PIECE':
          case 'NOT_YOUR_TURN':
            return err(r.error);
          case 'ALREADY_FACE_UP':
          case 'NO_PIECE':
            return err(action.kind === 'flip' ? 'CANNOT_FLIP' : 'ILLEGAL_ACTION');
          default:
            return err('ILLEGAL_ACTION');
        }
      }
      return ok({
        state: { ...g, state: r.value },
        notation: r.value.history.at(-1)?.notation ?? '',
      });
    },

    outcome(g) {
      const o = g.state.outcome;
      if (!o) return null;
      if (o.type === 'draw') return o;
      if (g.mode === 'classic') {
        const winnerSide = (o as XiangqiOutcome & { type: 'win' }).winner;
        return {
          type: 'win',
          winner: winnerSide === 'red' ? g.redSeat : otherSeat(g.redSeat),
          reason: o.reason,
        };
      }
      return o as MatchOutcome;
    },

    end(g, outcome) {
      // 平台判定的原因（認輸、超時、斷線、議和）都在引擎的 WinReason / DrawReason 之內
      if (g.mode === 'classic') {
        const o =
          outcome.type === 'draw'
            ? outcome
            : {
                type: 'win' as const,
                winner: (outcome.winner === g.redSeat ? 'red' : 'black') as Side,
                reason: outcome.reason,
              };
        return { ...g, state: endXiangqiGame(g.state, o as XiangqiOutcome) };
      }
      return { ...g, state: endBanqiGame(g.state, outcome as BanqiOutcome) };
    },

    seatLabel(g, seat) {
      return seatSide(g, asSeat(seat));
    },

    /**
     * 暗棋未翻開的棋子只輸出 id，絕不包含身分；legalActions 只給輪到的觀看者。
     */
    view(g, viewer) {
      const turn = turnSeat(g);
      const seatSides: [Side | null, Side | null] = [seatSide(g, 0), seatSide(g, 1)];
      const showLegal = viewer !== null && viewer === turn;

      if (g.mode === 'classic') {
        const s = g.state;
        const redSeat = g.redSeat;
        const seatOf = (side: Side): Seat => (side === 'red' ? redSeat : otherSeat(redSeat));
        const last = s.history.at(-1);
        const lastAction: LastAction | null = last
          ? {
              ply: last.ply,
              seat: seatOf(last.side),
              kind: 'move',
              from: last.from,
              to: last.to,
              pieceId: last.pieceId,
              captured: last.captured
                ? { side: last.captured.side, kind: last.captured.kind }
                : null,
              revealed: null,
            }
          : null;
        const captured: XiangqiView['captured'] = { red: [], black: [] };
        for (const m of s.history) if (m.captured) captured[m.captured.side].push(m.captured.kind);
        return {
          mode: 'classic',
          seatSides,
          board: s.board.map((p): CellView =>
            p ? { id: p.id, faceUp: true, side: p.side, kind: p.kind } : null,
          ),
          legalActions: showLegal
            ? getLegalMoves(s).map((m) => ({ kind: 'move' as const, from: m.from, to: m.to }))
            : [],
          lastAction,
          checkSquare: s.outcome?.type === 'draw' ? null : checkedKingSquare(s),
          moveList: s.history.map((m) => ({
            ply: m.ply,
            seat: seatOf(m.side),
            side: m.side,
            notation: m.notation,
          })),
          captured,
          progress: { plySinceProgress: s.plySinceCapture, limit: s.rules.moveLimitPlies },
        };
      }

      const s = g.state;
      const last = s.history.at(-1);
      const lastAction: LastAction | null = last
        ? {
            ply: last.ply,
            seat: last.seat,
            kind: last.action.type,
            from: last.action.type === 'move' ? last.action.from : null,
            to: last.action.type === 'move' ? last.action.to : last.action.square,
            pieceId: last.pieceId,
            captured: last.captured,
            revealed: last.revealed,
          }
        : null;
      return {
        mode: 'banqi',
        seatSides,
        board: s.cells.map((c): CellView => {
          if (!c) return null;
          if (!c.faceUp) return { id: c.id, faceUp: false };
          return { id: c.id, faceUp: true, side: c.side, kind: c.kind };
        }),
        legalActions: showLegal
          ? legalBanqiActions(s, asSeat(viewer)).map((a) =>
              a.type === 'flip'
                ? { kind: 'flip' as const, square: a.square }
                : { kind: 'move' as const, from: a.from, to: a.to },
            )
          : [],
        lastAction,
        checkSquare: null,
        moveList: s.history.map((h) => ({
          ply: h.ply,
          seat: h.seat,
          side: s.seatSides ? s.seatSides[h.seat] : null,
          notation: h.notation,
        })),
        captured: { red: [...s.captured.red], black: [...s.captured.black] },
        progress: { plySinceProgress: s.plySinceProgress, limit: s.rules.noProgressDrawPlies },
      };
    },
  };
}

export const xiangqiGame = createXiangqiDefinition();
