import type { SeatIndex } from './definition';

export interface TimeControl {
  /** 每方初始時間（毫秒） */
  initialMs: number;
  /** 每步加秒（Fischer increment，毫秒） */
  incrementMs: number;
}

export interface ClockState {
  /** 每個座位的剩餘時間，長度 = 座位數 */
  remainingMs: number[];
  /** 正在計時的座位；null 表示暫停 */
  running: SeatIndex | null;
  /** running 座位開始計時的時間戳 */
  startedAt: number;
}

export function createClock(tc: TimeControl, seats = 2): ClockState {
  return {
    remainingMs: Array.from({ length: seats }, () => tc.initialMs),
    running: null,
    startedAt: 0,
  };
}

export function remainingAt(clock: ClockState, seat: SeatIndex, now: number): number {
  const base = clock.remainingMs[seat] ?? 0;
  if (clock.running !== seat) return base;
  return Math.max(0, base - (now - clock.startedAt));
}

export function startClock(clock: ClockState, seat: SeatIndex, now: number): ClockState {
  return { ...clock, running: seat, startedAt: now };
}

/** 結束 `seat` 的回合：扣除用時、加秒，並切換給 `next`（null = 停止）。 */
export function pressClock(
  clock: ClockState,
  seat: SeatIndex,
  next: SeatIndex | null,
  now: number,
  incrementMs: number,
): ClockState {
  const remaining = [...clock.remainingMs];
  remaining[seat] = remainingAt(clock, seat, now) + incrementMs;
  return { remainingMs: remaining, running: next, startedAt: now };
}

export function stopClock(clock: ClockState, now: number): ClockState {
  if (clock.running === null) return clock;
  const remaining = [...clock.remainingMs];
  remaining[clock.running] = remainingAt(clock, clock.running, now);
  return { remainingMs: remaining, running: null, startedAt: now };
}

/** 回傳超時的座位（若有）。 */
export function flaggedSeat(clock: ClockState, now: number): SeatIndex | null {
  if (clock.running === null) return null;
  return remainingAt(clock, clock.running, now) <= 0 ? clock.running : null;
}
