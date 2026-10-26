import type { Seat } from './side';

export interface TimeControl {
  /** 每方初始時間（毫秒） */
  initialMs: number;
  /** 每步加秒（Fischer increment，毫秒） */
  incrementMs: number;
}

export interface ClockState {
  remainingMs: [number, number];
  /** 正在計時的座位；null 表示暫停 */
  running: Seat | null;
  /** running 座位開始計時的時間戳 */
  startedAt: number;
}

export function createClock(tc: TimeControl): ClockState {
  return { remainingMs: [tc.initialMs, tc.initialMs], running: null, startedAt: 0 };
}

export function remainingAt(clock: ClockState, seat: Seat, now: number): number {
  const base = clock.remainingMs[seat];
  if (clock.running !== seat) return base;
  return Math.max(0, base - (now - clock.startedAt));
}

export function startClock(clock: ClockState, seat: Seat, now: number): ClockState {
  return { ...clock, running: seat, startedAt: now };
}

/** 結束 `seat` 的回合：扣除用時、加秒，並切換給 `next`（null = 停止）。 */
export function pressClock(
  clock: ClockState,
  seat: Seat,
  next: Seat | null,
  now: number,
  incrementMs: number,
): ClockState {
  const remaining: [number, number] = [clock.remainingMs[0], clock.remainingMs[1]];
  remaining[seat] = remainingAt(clock, seat, now) + incrementMs;
  return { remainingMs: remaining, running: next, startedAt: now };
}

export function stopClock(clock: ClockState, now: number): ClockState {
  if (clock.running === null) return clock;
  const remaining: [number, number] = [clock.remainingMs[0], clock.remainingMs[1]];
  remaining[clock.running] = remainingAt(clock, clock.running, now);
  return { remainingMs: remaining, running: null, startedAt: now };
}

/** 回傳超時的座位（若有）。 */
export function flaggedSeat(clock: ClockState, now: number): Seat | null {
  if (clock.running === null) return null;
  return remainingAt(clock, clock.running, now) <= 0 ? clock.running : null;
}
