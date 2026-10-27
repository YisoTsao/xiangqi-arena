'use client';

import { create } from 'zustand';
import { Match } from '@xiangqi-arena/game-match';
import {
  BigTwoMatchViewSchema,
  bigTwoGame,
  hintsForView,
  type BigTwoActionInput,
  type BigTwoMode,
  type BigTwoState,
  type BigTwoView,
} from '@xiangqi-arena/games-big-two';
import type { IntentInput } from '../controller';
import { BIG_TWO_ID, type BigTwoSnapshot } from '../bigTwo';
import { errorMessage } from '../games';
import { cryptoRandomInt, randomId } from '../utils';
import { toast } from '../toast';

/**
 * 大老二練習模式：你坐座位 0，其他三家由瀏覽器裡的電腦玩家出牌。
 * 直接執行同一套 Match 狀態機，不需要伺服器。
 */
const YOU = 0;
const BOT_DELAY_MS = 750;
const NAMES = ['你', '電腦 小東', '電腦 小南', '電腦 小西'];

interface PracticeState {
  snapshot: BigTwoSnapshot | null;
  snapshotAt: number;
  start: () => void;
  send: (intent: IntentInput<BigTwoActionInput>) => void;
  stop: () => void;
}

let match: Match<BigTwoState, BigTwoActionInput, BigTwoView, BigTwoMode> | null = null;
let matchNumber = 0;
let botTimer: ReturnType<typeof setTimeout> | null = null;

function snapshot(): BigTwoSnapshot | null {
  if (!match) return null;
  return {
    roomCode: 'PRACTICE',
    roomVersion: match.version,
    phase: match.isOver ? 'ended' : 'playing',
    hostSeat: YOU,
    yourSeat: YOU,
    seats: NAMES.map((name) => ({ name, connected: true, ready: true })),
    config: { gameId: BIG_TWO_ID, mode: 'standard', timeControl: 'unlimited' },
    matchNumber,
    clock: null,
    drawOfferSeat: null,
    rematchVotes: [false, false, false, false],
    game: match.view(YOU),
    abandonDeadlineMs: [null, null, null, null],
  };
}

export const useBigTwoPractice = create<PracticeState>((set, get) => {
  const refresh = () => {
    set({ snapshot: snapshot(), snapshotAt: performance.now() });
    scheduleBot();
  };

  /** 輪到電腦時，稍等一下再出牌，讓玩家看得清楚 */
  const scheduleBot = () => {
    if (botTimer) clearTimeout(botTimer);
    botTimer = null;
    const m = match;
    if (!m || m.isOver || m.turnSeat === null || m.turnSeat === YOU) return;
    const seat = m.turnSeat;
    botTimer = setTimeout(() => {
      if (match !== m || m.turnSeat !== seat) return;
      const view = BigTwoMatchViewSchema.parse(m.view(seat));
      const best = hintsForView(view, seat)[0];
      m.submitAction(
        seat,
        {
          actionId: randomId(16),
          expectedVersion: m.version,
          action: best ? { kind: 'play', cards: best.cards } : { kind: 'pass' },
        },
        Date.now(),
      );
      refresh();
    }, BOT_DELAY_MS);
  };

  const newMatch = () => {
    match = new Match(bigTwoGame, {
      mode: 'standard',
      seats: 4,
      timeControl: null,
      random: cryptoRandomInt,
      now: Date.now(),
    });
    matchNumber++;
  };

  return {
    snapshot: null,
    snapshotAt: 0,
    start() {
      matchNumber = 0;
      newMatch();
      refresh();
    },
    send(intent) {
      if (!match) return;
      const now = Date.now();
      switch (intent.type) {
        case 'action': {
          const r = match.submitAction(
            YOU,
            { actionId: randomId(16), expectedVersion: match.version, action: intent.action },
            now,
          );
          if (!r.ok) toast(errorMessage(r.error), 'error');
          break;
        }
        case 'resign':
          match.resign(YOU, randomId(16), now);
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
      if (botTimer) clearTimeout(botTimer);
      botTimer = null;
      match = null;
      set({ snapshot: null });
    },
  };
});
