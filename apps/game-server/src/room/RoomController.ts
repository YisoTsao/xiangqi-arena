import type { AnyGameDefinition, SeatIndex } from '@xiangqi-arena/game-core';
import { Match, type AnyMatch } from '@xiangqi-arena/game-match';
import { DEFAULT_GAME_ID, getGame, hasMode } from '@xiangqi-arena/games';
import {
  ClientIntentSchema,
  DEFAULT_TIME_CONTROL,
  MSG,
  TIME_CONTROLS,
  type Ack,
  type ClientIntent,
  type ErrorCode,
  type JoinOptions,
  type Notice,
  type RoomSnapshot,
  type TimeControlId,
} from '@xiangqi-arena/game-protocol';
import type { RandomInt } from '@xiangqi-arena/shared';
import { TokenBucket } from './rateLimit';

export interface SeatRecord {
  token: string;
  name: string;
  clientId: string | null;
  ready: boolean;
  disconnectedAt: number | null;
}

export interface RoomTimings {
  /** 對局中斷線多久判負 */
  abandonMs: number;
  /** 大廳中斷線多久釋放座位 */
  lobbySeatReleaseMs: number;
}

export const DEFAULT_TIMINGS: RoomTimings = {
  abandonMs: 90_000,
  lobbySeatReleaseMs: 5 * 60_000,
};

export interface FinishedMatchInfo {
  roomCode: string;
  matchNumber: number;
  timeControl: TimeControlId;
  players: { token: string; name: string }[];
  match: AnyMatch;
}

export interface RoomControllerDeps {
  roomCode: string;
  /** 房間綁定的遊戲；建立後不可更換。省略則用預設遊戲 */
  gameId?: string;
  now: () => number;
  random: RandomInt;
  send: (clientId: string, channel: string, payload: unknown) => void;
  onMatchFinished?: (info: FinishedMatchInfo) => void;
  timings?: Partial<RoomTimings>;
}

export type JoinResult =
  | { ok: true; seat: SeatIndex; replacedClientId: string | null }
  | { ok: false; error: 'ROOM_FULL' };

export class UnknownGameError extends Error {
  constructor(readonly gameId: string) {
    super(`unknown game ${gameId}`);
  }
}

/**
 * 房間的權威邏輯：座位、準備、模式設定、開始、對局、再來一局、斷線處理。
 * 不依賴 Colyseus，便於單元測試；ArenaRoom 只負責轉接網路事件。
 * 遊戲規則全部來自註冊表中的 GameDefinition，房間本身不認得任何遊戲。
 */
export class RoomController {
  readonly roomCode: string;
  readonly game: AnyGameDefinition;
  /** 座位數 = 遊戲的 players.max；目前要坐滿才能開始 */
  private seats: (SeatRecord | null)[];
  private hostSeat: SeatIndex = 0;
  private phase: RoomSnapshot['phase'] = 'lobby';
  private mode: string;
  private timeControl: TimeControlId = DEFAULT_TIME_CONTROL;
  private match: AnyMatch | null = null;
  private matchNumber = 0;
  private nextFirstSeat: SeatIndex | null = null;
  private rematchVotes: boolean[];
  private roomVersion = 0;
  private reportedMatch: AnyMatch | null = null;
  private limiters = new Map<string, TokenBucket>();
  private readonly timings: RoomTimings;

  constructor(private readonly deps: RoomControllerDeps) {
    this.roomCode = deps.roomCode;
    this.timings = { ...DEFAULT_TIMINGS, ...deps.timings };
    const gameId = deps.gameId ?? DEFAULT_GAME_ID;
    const game = getGame(gameId);
    if (!game) throw new UnknownGameError(gameId);
    this.game = game;
    this.mode = game.defaultMode;
    this.seats = Array.from({ length: game.players.max }, () => null);
    this.rematchVotes = this.seats.map(() => false);
  }

  /** 建立房間時的初始設定；不合法的值直接忽略 */
  configureInitial(mode?: string, timeControl?: TimeControlId): void {
    if (mode && hasMode(this.game, mode)) this.mode = mode;
    if (timeControl) this.timeControl = timeControl;
  }

  get seatCount(): number {
    return this.seats.length;
  }

  seatOfClient(clientId: string): SeatIndex | null {
    const i = this.seats.findIndex((s) => s?.clientId === clientId);
    return i < 0 ? null : i;
  }

  /** onAuth 階段的預先檢查（不改變狀態） */
  canJoin(token: string): boolean {
    if (this.seats.some((s) => s?.token === token)) return true;
    return this.phase === 'lobby' && this.seats.some((s) => s === null);
  }

  join(clientId: string, options: JoinOptions): JoinResult {
    const now = this.deps.now();
    const existing = this.seats.findIndex((s) => s?.token === options.playerToken);
    if (existing >= 0) {
      const seat = existing;
      const record = this.seats[seat]!;
      const replaced = record.clientId;
      record.clientId = clientId;
      record.disconnectedAt = null;
      record.name = options.name;
      this.bump();
      this.notifyOthers(seat, { kind: 'playerReconnected', seat });
      this.broadcast();
      if (replaced && replaced !== clientId) {
        this.deps.send(replaced, MSG.notice, {
          kind: 'replacedByNewConnection',
          seat,
        } satisfies Notice);
      }
      return {
        ok: true,
        seat,
        replacedClientId: replaced && replaced !== clientId ? replaced : null,
      };
    }
    if (this.phase !== 'lobby') return { ok: false, error: 'ROOM_FULL' };
    const free = this.seats.findIndex((s) => s === null);
    if (free < 0) return { ok: false, error: 'ROOM_FULL' };
    const seat = free;
    this.seats[seat] = {
      token: options.playerToken,
      name: options.name,
      clientId,
      ready: false,
      disconnectedAt: null,
    };
    if (this.seats.every((s, i) => i === seat || s === null)) this.hostSeat = seat;
    void now;
    this.bump();
    this.notifyOthers(seat, { kind: 'playerJoined', seat });
    this.broadcast();
    return { ok: true, seat, replacedClientId: null };
  }

  /** 非預期斷線：保留座位，等待重連 */
  drop(clientId: string): void {
    const seat = this.seatOfClient(clientId);
    if (seat === null) return;
    const record = this.seats[seat]!;
    if (record.disconnectedAt === null) record.disconnectedAt = this.deps.now();
    this.bump();
    this.notifyOthers(seat, { kind: 'playerDisconnected', seat });
    this.broadcast();
  }

  reconnect(clientId: string): void {
    const seat = this.seatOfClient(clientId);
    if (seat === null) return;
    this.seats[seat]!.disconnectedAt = null;
    this.bump();
    this.notifyOthers(seat, { kind: 'playerReconnected', seat });
    this.broadcast();
  }

  /** 連線真正結束。consented = 玩家主動離開 */
  leave(clientId: string, consented: boolean): void {
    this.limiters.delete(clientId);
    const seat = this.seatOfClient(clientId);
    if (seat === null) return; // 已被新連線取代
    const record = this.seats[seat]!;
    record.clientId = null;
    if (record.disconnectedAt === null) record.disconnectedAt = this.deps.now();
    if (consented && this.phase !== 'playing') {
      this.releaseSeat(seat);
    } else if (consented && this.phase === 'playing' && this.match) {
      // 對局中主動離開視同認輸
      this.match.forfeit(seat, 'abandon', this.deps.now());
      this.afterMatchChange();
    }
    this.bump();
    this.notifyOthers(seat, { kind: consented ? 'playerLeft' : 'playerDisconnected', seat });
    this.broadcast();
  }

  private releaseSeat(seat: SeatIndex): void {
    this.seats[seat] = null;
    if (seat === this.hostSeat) {
      const next = this.seats.findIndex((s) => s !== null);
      if (next >= 0) this.hostSeat = next;
    }
    for (const s of this.seats) if (s) s.ready = false;
    this.clearRematchVotes();
    if (this.phase === 'ended') {
      this.phase = 'lobby';
      this.match = null;
    }
  }

  /** 所有座位皆無連線（供房間自動回收） */
  get hasConnectedPlayers(): boolean {
    return this.seats.some((s) => s !== null && s.clientId !== null && s.disconnectedAt === null);
  }

  get currentPhase(): RoomSnapshot['phase'] {
    return this.phase;
  }

  get currentMatch(): AnyMatch | null {
    return this.match;
  }

  handleMessage(clientId: string, raw: unknown): void {
    let limiter = this.limiters.get(clientId);
    if (!limiter) {
      limiter = new TokenBucket(20, 10);
      this.limiters.set(clientId, limiter);
    }
    if (!limiter.take(this.deps.now())) {
      this.ack(clientId, null, 'unknown', 'RATE_LIMITED');
      return;
    }
    const parsed = ClientIntentSchema.safeParse(raw);
    if (!parsed.success) {
      this.ack(clientId, null, 'unknown', 'INVALID_MESSAGE');
      return;
    }
    const seat = this.seatOfClient(clientId);
    if (seat === null) {
      this.ack(clientId, actionIdOf(parsed.data), parsed.data.type, 'NOT_SEATED');
      return;
    }
    const error = this.dispatch(seat, clientId, parsed.data);
    if (parsed.data.type === 'sync') return;
    this.ack(clientId, actionIdOf(parsed.data), parsed.data.type, error ?? undefined);
    if (!error) {
      this.bump();
      this.broadcast();
    }
  }

  private dispatch(seat: SeatIndex, clientId: string, intent: ClientIntent): ErrorCode | null {
    const now = this.deps.now();
    switch (intent.type) {
      case 'sync':
        this.sendSnapshot(clientId, seat);
        return null;
      case 'setReady': {
        if (this.phase !== 'lobby') return 'NOT_IN_LOBBY';
        this.seats[seat]!.ready = intent.ready;
        return null;
      }
      case 'configure': {
        if (seat !== this.hostSeat) return 'NOT_HOST';
        if (this.phase === 'playing') return 'NOT_IN_LOBBY';
        if (!hasMode(this.game, intent.mode)) return 'INVALID_CONFIG';
        this.mode = intent.mode;
        this.timeControl = intent.timeControl;
        if (this.phase === 'ended') {
          this.phase = 'lobby';
          this.match = null;
        }
        this.clearRematchVotes();
        for (const s of this.seats) if (s) s.ready = false;
        return null;
      }
      case 'start': {
        if (seat !== this.hostSeat) return 'NOT_HOST';
        if (this.phase !== 'lobby') return 'NOT_IN_LOBBY';
        if (!this.seats.every((s) => s?.ready)) return 'PLAYERS_NOT_READY';
        this.startMatch(now);
        return null;
      }
      case 'action': {
        if (!this.match || this.phase !== 'playing') return 'GAME_NOT_ACTIVE';
        const r = this.match.submitAction(seat, intent, now);
        this.afterMatchChange();
        return r.ok ? null : r.error;
      }
      case 'resign': {
        if (!this.match || this.phase !== 'playing') return 'GAME_NOT_ACTIVE';
        const r = this.match.resign(seat, intent.actionId, now);
        this.afterMatchChange();
        return r.ok ? null : r.error;
      }
      case 'offerDraw': {
        if (!this.match || this.phase !== 'playing') return 'GAME_NOT_ACTIVE';
        const r = this.match.offerDraw(seat, intent.actionId, now);
        if (r.ok && this.match.drawOffer === seat) {
          this.notifyOthers(seat, { kind: 'drawOffered', seat });
        }
        this.afterMatchChange();
        return r.ok ? null : r.error;
      }
      case 'respondDraw': {
        if (!this.match || this.phase !== 'playing') return 'GAME_NOT_ACTIVE';
        const r = this.match.respondDraw(seat, intent.actionId, intent.accept, now);
        if (r.ok && !intent.accept) this.notifyOthers(seat, { kind: 'drawDeclined', seat });
        this.afterMatchChange();
        return r.ok ? null : r.error;
      }
      case 'rematch': {
        if (this.phase !== 'ended') return 'GAME_NOT_ACTIVE';
        if (!this.seats.every((s) => s !== null)) return 'PLAYERS_NOT_READY';
        this.rematchVotes[seat] = true;
        if (this.rematchVotes.every(Boolean)) {
          this.startMatch(now);
        } else {
          this.notifyOthers(seat, { kind: 'rematchRequested', seat });
        }
        return null;
      }
    }
  }

  private clearRematchVotes(): void {
    this.rematchVotes = this.seats.map(() => false);
  }

  private startMatch(now: number): void {
    const seats = this.seats.length;
    const firstSeat = this.nextFirstSeat ?? this.deps.random(seats);
    // 再來一局時輪替先手（兩人遊戲即交換先後手 / 紅黑）
    this.nextFirstSeat = (firstSeat + 1) % seats;
    const tc = TIME_CONTROLS[this.timeControl];
    this.match = new Match(this.game, {
      mode: this.mode,
      seats,
      timeControl: tc ? { initialMs: tc.initialMs, incrementMs: tc.incrementMs } : null,
      random: this.deps.random,
      firstSeat,
      now,
    });
    this.matchNumber++;
    this.phase = 'playing';
    this.clearRematchVotes();
  }

  private afterMatchChange(): void {
    if (this.match?.isOver && this.phase === 'playing') {
      this.phase = 'ended';
      this.reportFinished();
    }
  }

  private reportFinished(): void {
    const match = this.match;
    if (!match || this.reportedMatch === match) return;
    this.reportedMatch = match;
    const seated = this.seats.filter((s): s is SeatRecord => s !== null);
    if (seated.length !== this.seats.length || !this.deps.onMatchFinished) return;
    this.deps.onMatchFinished({
      roomCode: this.roomCode,
      matchNumber: this.matchNumber,
      timeControl: this.timeControl,
      players: seated.map((s) => ({ token: s.token, name: s.name })),
      match,
    });
  }

  /** 定期呼叫：超時、斷線判負、大廳座位釋放。回傳狀態是否改變 */
  tick(): boolean {
    const now = this.deps.now();
    let changed = false;
    if (this.match && this.phase === 'playing') {
      if (this.match.tick(now)) changed = true;
      for (const [seat, s] of this.seats.entries()) {
        if (s?.disconnectedAt != null && now - s.disconnectedAt >= this.timings.abandonMs) {
          this.match.forfeit(seat, 'abandon', now);
          changed = true;
        }
      }
      this.afterMatchChange();
    } else {
      for (const [seat, s] of this.seats.entries()) {
        if (
          s &&
          s.clientId === null &&
          s.disconnectedAt !== null &&
          now - s.disconnectedAt >= this.timings.lobbySeatReleaseMs
        ) {
          this.releaseSeat(seat);
          changed = true;
        }
      }
    }
    if (changed) {
      this.bump();
      this.broadcast();
    }
    return changed;
  }

  snapshotFor(viewer: SeatIndex | null): RoomSnapshot {
    const now = this.deps.now();
    const seatView = (s: SeatRecord | null) =>
      s
        ? {
            name: s.name,
            connected: s.clientId !== null && s.disconnectedAt === null,
            ready: s.ready,
          }
        : null;
    const deadline = (s: SeatRecord | null): number | null =>
      this.phase === 'playing' && s?.disconnectedAt != null
        ? Math.max(0, s.disconnectedAt + this.timings.abandonMs - now)
        : null;
    return {
      roomCode: this.roomCode,
      roomVersion: this.roomVersion,
      phase: this.phase,
      hostSeat: this.hostSeat,
      yourSeat: viewer,
      seats: this.seats.map(seatView),
      config: { gameId: this.game.id, mode: this.mode, timeControl: this.timeControl },
      matchNumber: this.matchNumber,
      clock: this.match ? this.match.clockView(now) : null,
      drawOfferSeat: this.match?.drawOffer ?? null,
      rematchVotes: [...this.rematchVotes],
      game: this.match ? this.match.view(viewer) : null,
      abandonDeadlineMs: this.seats.map(deadline),
    };
  }

  /** 下一個需要 tick 的時間（毫秒），用於精準超時判定 */
  msUntilNextDeadline(): number | null {
    return this.match?.msUntilFlag(this.deps.now()) ?? null;
  }

  sendSnapshot(clientId: string, seat: SeatIndex | null): void {
    this.deps.send(clientId, MSG.snapshot, this.snapshotFor(seat));
  }

  broadcast(): void {
    for (const [seat, s] of this.seats.entries()) {
      if (s?.clientId && s.disconnectedAt === null) this.sendSnapshot(s.clientId, seat);
    }
  }

  private notifyOthers(seat: SeatIndex, notice: Notice): void {
    for (const [i, other] of this.seats.entries()) {
      if (i !== seat && other?.clientId) this.deps.send(other.clientId, MSG.notice, notice);
    }
  }

  private ack(clientId: string, actionId: string | null, intent: string, error?: ErrorCode): void {
    const payload: Ack = error
      ? { actionId, intent, ok: false, error }
      : { actionId, intent, ok: true };
    this.deps.send(clientId, MSG.ack, payload);
  }

  private bump(): void {
    this.roomVersion++;
  }
}

function actionIdOf(intent: ClientIntent): string | null {
  return 'actionId' in intent ? intent.actionId : null;
}
