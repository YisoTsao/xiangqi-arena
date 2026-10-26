'use client';

import { create } from 'zustand';
import { otherSeat, type Seat } from '@xiangqi-arena/game-core';
import { Match } from '@xiangqi-arena/game-match';
import {
  TIME_CONTROLS,
  type GameMode,
  type RoomSnapshot,
  type TimeControlId,
} from '@xiangqi-arena/game-protocol';
import type { IntentInput } from '../controller';
import { cryptoRandomInt, randomId } from '../utils';
import { toast } from '../toast';

/**
 * 本機同裝置雙人（Hot-seat）：直接在瀏覽器執行同一套 Match 狀態機，
 * 不需要伺服器，適合練習與離線展示。不用於線上對戰。
 */
interface LocalState {
  snapshot: RoomSnapshot | null;
  snapshotAt: number;
  start: (mode: GameMode, timeControl: TimeControlId) => void;
  send: (intent: IntentInput) => void;
  stop: () => void;
}

let match: Match | null = null;
let config: { mode: GameMode; timeControl: TimeControlId } = {
  mode: 'xiangqi',
  timeControl: 'unlimited',
};
let matchNumber = 0;
let firstSeat: Seat = 0;
let ticker: ReturnType<typeof setInterval> | null = null;
let rematchVotes: [boolean, boolean] = [false, false];

function snapshot(): RoomSnapshot | null {
  if (!match) return null;
  const turn = match.turnSeat;
  // 輪到誰就以誰的視角呈現；結束後保留最後走棋方
  const viewer: Seat = turn ?? match.view(null).lastAction?.seat ?? 0;
  return {
    roomCode: 'LOCAL',
    roomVersion: match.version,
    phase: match.isOver ? 'ended' : 'playing',
    hostSeat: 0,
    yourSeat: viewer,
    seats: [
      { name: '玩家一', connected: true, ready: true },
      { name: '玩家二', connected: true, ready: true },
    ],
    config,
    matchNumber,
    clock: match.clockView(Date.now()),
    drawOfferSeat: match.drawOffer,
    rematchVotes,
    game: match.view(viewer),
    abandonDeadlineMs: [null, null],
  };
}

export const useLocalGame = create<LocalState>((set, get) => {
  const refresh = () => set({ snapshot: snapshot(), snapshotAt: performance.now() });
  const newMatch = () => {
    const tc = TIME_CONTROLS[config.timeControl];
    match = new Match({
      mode: config.mode,
      timeControl: tc ? { initialMs: tc.initialMs, incrementMs: tc.incrementMs } : null,
      random: cryptoRandomInt,
      firstSeat,
      now: Date.now(),
    });
    matchNumber++;
    rematchVotes = [false, false];
    firstSeat = otherSeat(firstSeat);
  };

  return {
    snapshot: null,
    snapshotAt: 0,
    start(mode, timeControl) {
      config = { mode, timeControl };
      firstSeat = 0;
      matchNumber = 0;
      newMatch();
      if (ticker) clearInterval(ticker);
      ticker = setInterval(() => {
        if (match?.tick(Date.now())) refresh();
      }, 250);
      refresh();
    },
    send(intent) {
      if (!match) return;
      const now = Date.now();
      const seat = match.turnSeat ?? 0;
      switch (intent.type) {
        case 'action': {
          const r = match.submitAction(
            seat,
            { actionId: randomId(16), expectedVersion: match.version, action: intent.action },
            now,
          );
          if (!r.ok) toast('不合法的走法', 'error');
          break;
        }
        case 'resign':
          match.resign(seat, randomId(16), now);
          break;
        case 'offerDraw':
          // 同一台裝置：提議即視為雙方同意
          match.offerDraw(seat, randomId(16), now);
          match.respondDraw(otherSeat(seat), randomId(16), true, now);
          break;
        case 'rematch':
          newMatch();
          break;
        default:
          break;
      }
      refresh();
      void get;
    },
    stop() {
      if (ticker) clearInterval(ticker);
      ticker = null;
      match = null;
      set({ snapshot: null });
    },
  };
});
