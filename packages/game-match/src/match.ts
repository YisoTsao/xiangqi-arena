import {
  createClock,
  flaggedSeat,
  otherSeat,
  pressClock,
  remainingAt,
  startClock,
  stopClock,
  type ClockState,
  type Outcome,
  type Seat,
  type Side,
  type TimeControl,
} from '@xiangqi-arena/game-core';
import {
  applyBanqiAction,
  createBanqiGame,
  endBanqiGame,
  legalBanqiActions,
  sideOfSeat,
  type BanqiRules,
  type BanqiState,
} from '@xiangqi-arena/game-banqi';
import {
  applyXiangqiMove,
  checkedKingSquare,
  createXiangqiGame,
  endXiangqiGame,
  getLegalMoves,
  type XiangqiRules,
  type XiangqiState,
} from '@xiangqi-arena/game-xiangqi';
import type {
  CellView,
  ClockView,
  ErrorCode,
  GameAction,
  GameMode,
  GameView,
  LastAction,
} from '@xiangqi-arena/game-protocol';
import { err, ok, type RandomInt, type Result } from '@xiangqi-arena/shared';

export interface MatchOptions {
  mode: GameMode;
  timeControl: TimeControl | null;
  random: RandomInt;
  /** 象棋：執紅的座位；暗棋：先手座位。省略則隨機 */
  firstSeat?: Seat;
  xiangqiRules?: Partial<XiangqiRules>;
  banqiRules?: Partial<BanqiRules>;
  /** 直接指定象棋開局 FEN（殘局 / 測試） */
  xiangqiFen?: string;
  now: number;
}

type ModeState =
  { mode: 'xiangqi'; state: XiangqiState; redSeat: Seat } | { mode: 'banqi'; state: BanqiState };

export interface ActionIntent {
  actionId: string;
  expectedVersion: number;
  action: GameAction;
}

export interface MatchLogEntry {
  ply: number;
  seat: Seat;
  action: GameAction;
  notation: string;
  at: number;
  thinkMs: number;
}

const DEDUP_WINDOW = 512;

/**
 * 一場對局的權威狀態機：座位、回合、計時、和棋提議、版本與重複封包。
 * 與 Colyseus、React 完全無關，伺服器與本機練習模式共用。
 */
export class Match {
  readonly mode: GameMode;
  readonly timeControl: TimeControl | null;
  readonly startedAt: number;
  endedAt: number | null = null;
  private game: ModeState;
  private clock: ClockState | null;
  private _version = 0;
  private _outcome: Outcome | null = null;
  private _drawOffer: Seat | null = null;
  private drawOfferPly: [number, number] = [-1, -1];
  private seenActionIds = new Set<string>();
  private seenOrder: string[] = [];
  private turnStartedAt: number;
  readonly log: MatchLogEntry[] = [];

  constructor(options: MatchOptions) {
    this.mode = options.mode;
    this.timeControl = options.timeControl;
    this.startedAt = options.now;
    this.turnStartedAt = options.now;
    const firstSeat = options.firstSeat ?? (options.random(2) as Seat);
    if (options.mode === 'xiangqi') {
      this.game = {
        mode: 'xiangqi',
        state: createXiangqiGame({ fen: options.xiangqiFen, rules: options.xiangqiRules }),
        redSeat: firstSeat,
      };
    } else {
      this.game = {
        mode: 'banqi',
        state: createBanqiGame({
          random: options.random,
          rules: options.banqiRules,
          firstSeat,
        }),
      };
    }
    this.clock = options.timeControl ? createClock(options.timeControl) : null;
    const turn = this.turnSeat;
    if (this.clock && turn !== null) this.clock = startClock(this.clock, turn, options.now);
  }

  get version(): number {
    return this._version;
  }
  get outcome(): Outcome | null {
    return this._outcome;
  }
  get drawOffer(): Seat | null {
    return this._drawOffer;
  }
  get isOver(): boolean {
    return this._outcome !== null;
  }
  get ply(): number {
    return this.game.state.ply;
  }

  get turnSeat(): Seat | null {
    if (this._outcome) return null;
    if (this.game.mode === 'xiangqi') {
      return this.game.state.turn === 'red' ? this.game.redSeat : otherSeat(this.game.redSeat);
    }
    return this.game.state.turn;
  }

  seatSide(seat: Seat): Side | null {
    if (this.game.mode === 'xiangqi') {
      return seat === this.game.redSeat ? 'red' : 'black';
    }
    return sideOfSeat(this.game.state, seat);
  }

  /** 記錄 actionId；重複則回傳 false */
  private remember(actionId: string): boolean {
    if (this.seenActionIds.has(actionId)) return false;
    this.seenActionIds.add(actionId);
    this.seenOrder.push(actionId);
    if (this.seenOrder.length > DEDUP_WINDOW) {
      const old = this.seenOrder.shift();
      if (old) this.seenActionIds.delete(old);
    }
    return true;
  }

  submitAction(seat: Seat, intent: ActionIntent, now: number): Result<void, ErrorCode> {
    if (this.seenActionIds.has(intent.actionId)) return err('DUPLICATE');
    if (this.tick(now)) return err('GAME_NOT_ACTIVE');
    if (this._outcome) return err('GAME_NOT_ACTIVE');
    if (seat !== this.turnSeat) return err('NOT_YOUR_TURN');
    if (intent.expectedVersion !== this._version) return err('STALE_VERSION');

    const { action } = intent;
    let notation: string;
    if (this.game.mode === 'xiangqi') {
      if (action.kind !== 'move') return err('ILLEGAL_ACTION');
      const side = this.seatSide(seat);
      if (!side) return err('NOT_YOUR_TURN');
      const r = applyXiangqiMove(this.game.state, side, action.from, action.to);
      if (!r.ok) {
        return err(r.error === 'NOT_YOUR_PIECE' ? 'NOT_YOUR_PIECE' : 'ILLEGAL_ACTION');
      }
      this.game = { ...this.game, state: r.value };
      notation = r.value.history.at(-1)?.notation ?? '';
    } else {
      const r = applyBanqiAction(
        this.game.state,
        seat,
        action.kind === 'flip'
          ? { type: 'flip', square: action.square }
          : { type: 'move', from: action.from, to: action.to },
      );
      if (!r.ok) {
        switch (r.error) {
          case 'NOT_YOUR_PIECE':
            return err('NOT_YOUR_PIECE');
          case 'NOT_YOUR_TURN':
            return err('NOT_YOUR_TURN');
          case 'ALREADY_FACE_UP':
          case 'NO_PIECE':
            return err(action.kind === 'flip' ? 'CANNOT_FLIP' : 'ILLEGAL_ACTION');
          default:
            return err('ILLEGAL_ACTION');
        }
      }
      this.game = { ...this.game, state: r.value };
      notation = r.value.history.at(-1)?.notation ?? '';
    }

    this.remember(intent.actionId);
    this.log.push({
      ply: this.game.state.ply,
      seat,
      action,
      notation,
      at: now,
      thinkMs: now - this.turnStartedAt,
    });
    this.turnStartedAt = now;
    // 對手走棋視同拒絕和棋提議
    if (this._drawOffer !== null && this._drawOffer !== seat) this._drawOffer = null;

    const engineOutcome = this.engineOutcome();
    if (engineOutcome) {
      this.finish(engineOutcome, now);
    } else if (this.clock && this.timeControl) {
      this.clock = pressClock(this.clock, seat, otherSeat(seat), now, this.timeControl.incrementMs);
    }
    this._version++;
    return ok(undefined);
  }

  resign(seat: Seat, actionId: string, now: number): Result<void, ErrorCode> {
    if (this.seenActionIds.has(actionId)) return err('DUPLICATE');
    if (this._outcome) return err('GAME_NOT_ACTIVE');
    this.remember(actionId);
    this.finish({ type: 'win', winner: otherSeat(seat), reason: 'resign' }, now);
    this._version++;
    return ok(undefined);
  }

  offerDraw(seat: Seat, actionId: string, now: number): Result<void, ErrorCode> {
    if (this.seenActionIds.has(actionId)) return err('DUPLICATE');
    if (this._outcome) return err('GAME_NOT_ACTIVE');
    if (this.drawOfferPly[seat] === this.ply) return err('DRAW_OFFER_LIMIT');
    this.remember(actionId);
    // 對方已提議和棋時再提議 = 接受
    if (this._drawOffer === otherSeat(seat)) {
      return this.respondDraw(seat, actionId, true, now, true);
    }
    this._drawOffer = seat;
    this.drawOfferPly[seat] = this.ply;
    this._version++;
    return ok(undefined);
  }

  respondDraw(
    seat: Seat,
    actionId: string,
    accept: boolean,
    now: number,
    alreadyRemembered = false,
  ): Result<void, ErrorCode> {
    if (!alreadyRemembered && this.seenActionIds.has(actionId)) return err('DUPLICATE');
    if (this._outcome) return err('GAME_NOT_ACTIVE');
    if (this._drawOffer === null || this._drawOffer === seat) return err('NO_DRAW_OFFER');
    if (!alreadyRemembered) this.remember(actionId);
    this._drawOffer = null;
    if (accept) this.finish({ type: 'draw', reason: 'agreement' }, now);
    this._version++;
    return ok(undefined);
  }

  /** 斷線過久等外部判負 */
  forfeit(seat: Seat, reason: 'abandon' | 'timeout', now: number): void {
    if (this._outcome) return;
    this.finish({ type: 'win', winner: otherSeat(seat), reason }, now);
    this._version++;
  }

  /** 檢查超時；狀態有變化時回傳 true */
  tick(now: number): boolean {
    if (this._outcome || !this.clock) return false;
    const flagged = flaggedSeat(this.clock, now);
    if (flagged === null) return false;
    this.finish({ type: 'win', winner: otherSeat(flagged), reason: 'timeout' }, now);
    this._version++;
    return true;
  }

  /** 距離下一次可能超時的毫秒數（供伺服器排程） */
  msUntilFlag(now: number): number | null {
    if (this._outcome || !this.clock || this.clock.running === null) return null;
    return remainingAt(this.clock, this.clock.running, now);
  }

  private engineOutcome(): Outcome | null {
    const o = this.game.state.outcome;
    if (!o) return null;
    if (o.type === 'draw') return o;
    if (this.game.mode === 'xiangqi') {
      const winnerSide = (o as { winner: Side }).winner;
      const winner = winnerSide === 'red' ? this.game.redSeat : otherSeat(this.game.redSeat);
      return { type: 'win', winner, reason: o.reason };
    }
    return o as Outcome;
  }

  private finish(outcome: Outcome, now: number): void {
    this._outcome = outcome;
    this._drawOffer = null;
    this.endedAt = now;
    if (this.clock) this.clock = stopClock(this.clock, now);
    if (this.game.mode === 'xiangqi') {
      const o =
        outcome.type === 'draw'
          ? outcome
          : {
              type: 'win' as const,
              winner: (outcome.winner === this.game.redSeat ? 'red' : 'black') as Side,
              reason: outcome.reason,
            };
      this.game = { ...this.game, state: endXiangqiGame(this.game.state, o) };
    } else {
      this.game = { ...this.game, state: endBanqiGame(this.game.state, outcome) };
    }
  }

  clockView(now: number): ClockView | null {
    if (!this.clock || !this.timeControl) return null;
    return {
      remainingMs: [remainingAt(this.clock, 0, now), remainingAt(this.clock, 1, now)],
      running: this.clock.running,
      incrementMs: this.timeControl.incrementMs,
    };
  }

  /**
   * 依觀看者產生遊戲畫面資料。暗棋未翻開的棋子只輸出 id，
   * 絕不包含身分；legalActions 只給輪到的觀看者。
   */
  view(viewer: Seat | null): GameView {
    const turnSeat = this.turnSeat;
    const seatSides: [Side | null, Side | null] = [this.seatSide(0), this.seatSide(1)];
    const showLegal = viewer !== null && viewer === turnSeat;

    if (this.game.mode === 'xiangqi') {
      const s = this.game.state;
      const redSeat = this.game.redSeat;
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
            captured: last.captured ? { side: last.captured.side, kind: last.captured.kind } : null,
            revealed: null,
          }
        : null;
      const captured = {
        red: [] as GameView['captured']['red'],
        black: [] as GameView['captured']['black'],
      };
      for (const m of s.history) if (m.captured) captured[m.captured.side].push(m.captured.kind);
      return {
        mode: 'xiangqi',
        version: this._version,
        turnSeat,
        seatSides,
        board: s.board.map((p): CellView =>
          p ? { id: p.id, faceUp: true, side: p.side, kind: p.kind } : null,
        ),
        legalActions: showLegal
          ? getLegalMoves(s).map((m) => ({ kind: 'move' as const, from: m.from, to: m.to }))
          : [],
        lastAction,
        checkSquare: this._outcome && this._outcome.type === 'draw' ? null : checkedKingSquare(s),
        moveList: s.history.map((m) => ({
          ply: m.ply,
          seat: seatOf(m.side),
          side: m.side,
          notation: m.notation,
        })),
        captured,
        outcome: this._outcome,
        progress: { plySinceProgress: s.plySinceCapture, limit: s.rules.moveLimitPlies },
      };
    }

    const s = this.game.state;
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
      version: this._version,
      turnSeat,
      seatSides,
      board: s.cells.map((c): CellView => {
        if (!c) return null;
        if (!c.faceUp) return { id: c.id, faceUp: false };
        return { id: c.id, faceUp: true, side: c.side, kind: c.kind };
      }),
      legalActions: showLegal
        ? legalBanqiActions(s, viewer).map((a) =>
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
      outcome: this._outcome,
      progress: { plySinceProgress: s.plySinceProgress, limit: s.rules.noProgressDrawPlies },
    };
  }

  /** 對局結束後寫入資料庫用的摘要 */
  summary(): {
    mode: GameMode;
    startedAt: number;
    endedAt: number | null;
    outcome: Outcome | null;
    seatSides: [Side | null, Side | null];
    moves: MatchLogEntry[];
  } {
    return {
      mode: this.mode,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      outcome: this._outcome,
      seatSides: [this.seatSide(0), this.seatSide(1)],
      moves: [...this.log],
    };
  }
}
