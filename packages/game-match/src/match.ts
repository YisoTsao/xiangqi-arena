import {
  createClock,
  flaggedSeat,
  pressClock,
  remainingAt,
  startClock,
  stopClock,
  type ClockState,
  type GameDefinition,
  type MatchOutcome,
  type PlatformWinReason,
  type SeatIndex,
  type TimeControl,
} from '@xiangqi-arena/game-core';
import type { ClockView, MatchViewBase } from '@xiangqi-arena/game-protocol';
import { err, ok, type RandomInt, type Result } from '@xiangqi-arena/shared';

/** 平台層的錯誤碼；遊戲自己的錯誤碼（例如 NOT_YOUR_PIECE）會原樣傳出 */
export type MatchErrorCode =
  | 'DUPLICATE'
  | 'GAME_NOT_ACTIVE'
  | 'NOT_YOUR_TURN'
  | 'STALE_VERSION'
  | 'ILLEGAL_ACTION'
  | 'NO_DRAW_OFFER'
  | 'DRAW_OFFER_LIMIT'
  | 'NOT_SUPPORTED'
  | (string & {});

export interface MatchOptions<Mode extends string> {
  mode: Mode;
  /** 本局座位數，需在遊戲的 players.min ~ players.max 之間 */
  seats?: number;
  timeControl: TimeControl | null;
  random: RandomInt;
  /** 先手 / 執紅的座位；省略則隨機 */
  firstSeat?: SeatIndex;
  now: number;
}

export interface ActionIntent {
  actionId: string;
  expectedVersion: number;
  /** 尚未驗證的原始動作，交給遊戲的 parseAction 驗證 */
  action: unknown;
}

export interface MatchLogEntry<Action = unknown> {
  ply: number;
  seat: SeatIndex;
  action: Action;
  notation: string;
  at: number;
  thinkMs: number;
}

const DEDUP_WINDOW = 512;

/** 合併了平台欄位的畫面資料 */
export type MatchView<View> = MatchViewBase & View;

/**
 * 一場對局的權威狀態機：回合、計時、和棋提議、認輸、版本與重複封包。
 * 規則全部委派給 GameDefinition；與 Colyseus、React 完全無關，伺服器與本機模式共用。
 */
export class Match<State, Action, View, Mode extends string = string> {
  readonly mode: Mode;
  readonly seats: number;
  readonly timeControl: TimeControl | null;
  readonly startedAt: number;
  endedAt: number | null = null;
  private state: State;
  private clock: ClockState | null;
  private _version = 0;
  private _outcome: MatchOutcome | null = null;
  private _drawOffer: SeatIndex | null = null;
  private drawOfferPly: number[];
  private ply = 0;
  private seenActionIds = new Set<string>();
  private seenOrder: string[] = [];
  private turnStartedAt: number;
  readonly log: MatchLogEntry<Action>[] = [];

  constructor(
    readonly definition: GameDefinition<State, Action, View, Mode>,
    options: MatchOptions<Mode>,
  ) {
    const { players } = definition;
    this.seats = options.seats ?? players.min;
    if (this.seats < players.min || this.seats > players.max) {
      throw new Error(
        `${definition.id} needs ${players.min}-${players.max} seats, got ${this.seats}`,
      );
    }
    if (!definition.modes.some((m) => m.id === options.mode)) {
      throw new Error(`${definition.id} has no mode ${options.mode}`);
    }
    this.mode = options.mode;
    this.timeControl = definition.features.clock ? options.timeControl : null;
    this.startedAt = options.now;
    this.turnStartedAt = options.now;
    this.drawOfferPly = Array.from({ length: this.seats }, () => -1);
    this.state = definition.setup({
      mode: options.mode,
      seats: this.seats,
      random: options.random,
      firstSeat: options.firstSeat ?? options.random(this.seats),
    });
    this.clock = this.timeControl ? createClock(this.timeControl, this.seats) : null;
    this.restartClock(options.now);
  }

  get version(): number {
    return this._version;
  }
  get outcome(): MatchOutcome | null {
    return this._outcome;
  }
  get drawOffer(): SeatIndex | null {
    return this._drawOffer;
  }
  get isOver(): boolean {
    return this._outcome !== null;
  }
  get plyCount(): number {
    return this.ply;
  }

  get activeSeats(): SeatIndex[] {
    if (this._outcome) return [];
    return this.definition.activeSeats(this.state);
  }

  /** 只有一個座位可以行動時的那個座位；否則 null */
  get turnSeat(): SeatIndex | null {
    const active = this.activeSeats;
    return active.length === 1 ? active[0]! : null;
  }

  seatLabel(seat: SeatIndex): string | null {
    return this.definition.seatLabel?.(this.state, seat) ?? null;
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

  /** 計時器跟著「唯一可行動的座位」走；多人同時可行動時暫停 */
  private restartClock(now: number, pressedBy: SeatIndex | null = null): void {
    if (!this.clock || !this.timeControl) return;
    const next = this.turnSeat;
    if (pressedBy !== null) {
      this.clock = pressClock(this.clock, pressedBy, next, now, this.timeControl.incrementMs);
    } else if (next !== null) {
      this.clock = startClock(this.clock, next, now);
    } else {
      this.clock = stopClock(this.clock, now);
    }
  }

  submitAction(seat: SeatIndex, intent: ActionIntent, now: number): Result<void, MatchErrorCode> {
    if (this.seenActionIds.has(intent.actionId)) return err('DUPLICATE');
    if (this.tick(now)) return err('GAME_NOT_ACTIVE');
    if (this._outcome) return err('GAME_NOT_ACTIVE');
    if (!this.activeSeats.includes(seat)) return err('NOT_YOUR_TURN');
    if (intent.expectedVersion !== this._version) return err('STALE_VERSION');
    const action = this.definition.parseAction(intent.action);
    if (action === null) return err('ILLEGAL_ACTION');

    const r = this.definition.apply(this.state, seat, action);
    if (!r.ok) return err(r.error);
    this.state = r.value.state;
    this.ply++;

    this.remember(intent.actionId);
    this.log.push({
      ply: this.ply,
      seat,
      action,
      notation: r.value.notation,
      at: now,
      thinkMs: now - this.turnStartedAt,
    });
    this.turnStartedAt = now;
    // 對手行動視同拒絕和棋提議
    if (this._drawOffer !== null && this._drawOffer !== seat) this._drawOffer = null;

    const ruleOutcome = this.definition.outcome(this.state);
    if (ruleOutcome) {
      this.finish(ruleOutcome, now);
    } else {
      this.restartClock(now, this.clock?.running === seat ? seat : null);
    }
    this._version++;
    return ok(undefined);
  }

  private forfeitOutcome(seat: SeatIndex, reason: PlatformWinReason): MatchOutcome {
    if (this.definition.forfeit) return this.definition.forfeit(this.state, seat, reason);
    // 兩人遊戲的預設：對手獲勝
    return { type: 'win', winner: seat === 0 ? 1 : 0, reason };
  }

  private canForfeitByDefault(): boolean {
    return this.definition.forfeit !== undefined || this.seats === 2;
  }

  resign(seat: SeatIndex, actionId: string, now: number): Result<void, MatchErrorCode> {
    if (this.seenActionIds.has(actionId)) return err('DUPLICATE');
    if (this._outcome) return err('GAME_NOT_ACTIVE');
    if (!this.definition.features.resign || !this.canForfeitByDefault()) {
      return err('NOT_SUPPORTED');
    }
    this.remember(actionId);
    this.finish(this.forfeitOutcome(seat, 'resign'), now, seat);
    this._version++;
    return ok(undefined);
  }

  private drawOffersEnabled(): boolean {
    return this.definition.features.drawOffers && this.seats === 2;
  }

  offerDraw(seat: SeatIndex, actionId: string, now: number): Result<void, MatchErrorCode> {
    if (this.seenActionIds.has(actionId)) return err('DUPLICATE');
    if (this._outcome) return err('GAME_NOT_ACTIVE');
    if (!this.drawOffersEnabled()) return err('NOT_SUPPORTED');
    if (this.drawOfferPly[seat] === this.ply) return err('DRAW_OFFER_LIMIT');
    this.remember(actionId);
    // 對方已提議和棋時再提議 = 接受
    if (this._drawOffer !== null && this._drawOffer !== seat) {
      return this.respondDraw(seat, actionId, true, now, true);
    }
    this._drawOffer = seat;
    this.drawOfferPly[seat] = this.ply;
    this._version++;
    return ok(undefined);
  }

  respondDraw(
    seat: SeatIndex,
    actionId: string,
    accept: boolean,
    now: number,
    alreadyRemembered = false,
  ): Result<void, MatchErrorCode> {
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
  forfeit(seat: SeatIndex, reason: 'abandon' | 'timeout', now: number): void {
    if (this._outcome || !this.canForfeitByDefault()) return;
    this.finish(this.forfeitOutcome(seat, reason), now, seat);
    this._version++;
  }

  /** 檢查超時；狀態有變化時回傳 true */
  tick(now: number): boolean {
    if (this._outcome || !this.clock) return false;
    const flagged = flaggedSeat(this.clock, now);
    if (flagged === null || !this.canForfeitByDefault()) return false;
    this.finish(this.forfeitOutcome(flagged, 'timeout'), now, flagged);
    this._version++;
    return true;
  }

  /** 距離下一次可能超時的毫秒數（供伺服器排程） */
  msUntilFlag(now: number): number | null {
    if (this._outcome || !this.clock || this.clock.running === null) return null;
    return remainingAt(this.clock, this.clock.running, now);
  }

  private finish(outcome: MatchOutcome, now: number, forfeitSeat: SeatIndex | null = null): void {
    this._outcome = outcome;
    this._drawOffer = null;
    this.endedAt = now;
    if (this.clock) this.clock = stopClock(this.clock, now);
    if (this.definition.end) this.state = this.definition.end(this.state, outcome, forfeitSeat);
  }

  clockView(now: number): ClockView | null {
    if (!this.clock || !this.timeControl) return null;
    return {
      remainingMs: Array.from({ length: this.seats }, (_, s) => remainingAt(this.clock!, s, now)),
      running: this.clock.running,
      incrementMs: this.timeControl.incrementMs,
    };
  }

  /** 依觀看者產生畫面資料：遊戲負責過濾隱藏資訊，平台補上回合與結果 */
  view(viewer: SeatIndex | null): MatchView<View> {
    const active = this.activeSeats;
    return {
      ...this.definition.view(this.state, viewer),
      gameId: this.definition.id,
      mode: this.mode,
      version: this._version,
      activeSeats: active,
      turnSeat: active.length === 1 ? active[0]! : null,
      outcome: this._outcome,
    };
  }

  /** 對局結束後寫入資料庫用的摘要 */
  summary(): {
    gameId: string;
    mode: Mode;
    startedAt: number;
    endedAt: number | null;
    outcome: MatchOutcome | null;
    seatLabels: (string | null)[];
    /** 名次（1 起算）；遊戲沒有提供時為 null */
    placements: number[] | null;
    moves: MatchLogEntry<Action>[];
  } {
    return {
      gameId: this.definition.id,
      mode: this.mode,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      outcome: this._outcome,
      seatLabels: Array.from({ length: this.seats }, (_, s) => this.seatLabel(s)),
      placements:
        this._outcome && this.definition.placements
          ? this.definition.placements(this.state, this._outcome)
          : null,
      moves: [...this.log],
    };
  }
}

/** 註冊表中型別各異的對局 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyMatch = Match<any, any, any, string>;
