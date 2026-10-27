'use client';

import { create } from 'zustand';
import { Match } from '@xiangqi-arena/game-match';
import {
  MahjongMatchViewSchema,
  botActionForView,
  mahjongGame,
  type MahjongActionInput,
  type MahjongMatchView,
  type MahjongMode,
  type MahjongState,
  type MahjongView,
} from '@xiangqi-arena/games-mahjong';
import { errorMessage } from '../games';
import { cryptoRandomInt, randomId } from '../utils';
import { toast } from '../toast';

/**
 * 麻將練習模式：你坐座位 0，其他三家由瀏覽器裡的電腦玩家打牌。
 * 直接執行同一套 Match 狀態機，不需要伺服器。
 */
export const MAHJONG_YOU = 0;
export const MAHJONG_PRACTICE_NAMES = ['你', '電腦 阿樂', '電腦 秀琴姨', '電腦 老周'];

/** 電腦打牌前的停頓；反應（吃碰胡）比打牌快 */
const BOT_DISCARD_MS = 650;
const BOT_CLAIM_MS = 250;
/**
 * 你沒得吃碰胡時自動「過」。延遲固定，不論能不能吃碰，避免從等待時間推出手牌（M-33 的精神）。
 */
const AUTO_PASS_MS = 450;
/** 電腦在一把結束後等你看完結算再按「下一把」 */
const BOT_READY_MS = 300;

interface PracticeState {
  view: MahjongMatchView | null;
  /** 一將結束後再開新的一將時遞增 */
  matchNumber: number;
  start: (mode?: MahjongMode) => void;
  send: (action: MahjongActionInput) => void;
  stop: () => void;
}

let match: Match<MahjongState, MahjongActionInput, MahjongView, MahjongMode> | null = null;
let currentMode: MahjongMode = 'east';
const timers = new Set<ReturnType<typeof setTimeout>>();

function clearTimers(): void {
  for (const t of timers) clearTimeout(t);
  timers.clear();
}

function later(ms: number, fn: () => void): void {
  const t = setTimeout(() => {
    timers.delete(t);
    fn();
  }, ms);
  timers.add(t);
}

const viewOf = (seat: number): MahjongMatchView => MahjongMatchViewSchema.parse(match!.view(seat));

export const useMahjongPractice = create<PracticeState>((set, get) => {
  const submit = (seat: number, action: MahjongActionInput): boolean => {
    if (!match) return false;
    const r = match.submitAction(
      seat,
      { actionId: randomId(16), expectedVersion: match.version, action },
      Date.now(),
    );
    if (!r.ok && seat === MAHJONG_YOU) toast(errorMessage(r.error), 'error');
    return r.ok;
  };

  const refresh = () => {
    clearTimers();
    if (!match) return;
    const view = viewOf(MAHJONG_YOU);
    set({ view });
    if (match.isOver) return;
    const m = match;
    const phase = view.phase;

    // 電腦：每個輪到的座位各自排一次
    for (const seat of m.activeSeats) {
      if (seat === MAHJONG_YOU) continue;
      const delay =
        phase.type === 'claim'
          ? BOT_CLAIM_MS
          : phase.type === 'hand-end'
            ? BOT_READY_MS
            : BOT_DISCARD_MS;
      later(delay, () => {
        if (match !== m || !m.activeSeats.includes(seat)) return;
        if (submit(seat, botActionForView(viewOf(seat)))) refresh();
      });
    }

    // 你：沒得吃碰胡就自動過
    const o = view.options;
    if (
      phase.type === 'claim' &&
      m.activeSeats.includes(MAHJONG_YOU) &&
      !o.win &&
      !o.pung &&
      !o.kong &&
      o.chow.length === 0
    ) {
      later(AUTO_PASS_MS, () => {
        if (match !== m || !m.activeSeats.includes(MAHJONG_YOU)) return;
        if (submit(MAHJONG_YOU, { kind: 'pass' })) refresh();
      });
    }
  };

  return {
    view: null,
    matchNumber: 0,
    start(mode = 'east') {
      clearTimers();
      currentMode = mode;
      match = new Match(mahjongGame, {
        mode,
        seats: 4,
        timeControl: null,
        random: cryptoRandomInt,
        now: Date.now(),
      });
      set({ matchNumber: get().matchNumber + 1 });
      refresh();
    },
    send(action) {
      if (!match) return;
      if (match.isOver) {
        get().start(currentMode);
        return;
      }
      if (submit(MAHJONG_YOU, action)) refresh();
    },
    stop() {
      clearTimers();
      match = null;
      set({ view: null });
    },
  };
});
