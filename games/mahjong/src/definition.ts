import type { GameDefinition, MatchOutcome } from '@xiangqi-arena/game-core';
import { err, ok } from '@xiangqi-arena/shared';
import { waitingKinds } from './hand';
import {
  MAHJONG_SEATS,
  activeSeats,
  applyMahjongAction,
  canSelfDraw,
  claimOptions,
  createMahjongGame,
  isOver,
  placements,
  seatWind,
  roundWind,
  selfKongKinds,
  type MahjongAction,
  type MahjongState,
} from './engine';
import { kindCounts } from './tiles';
import {
  MAHJONG_MODE_LABELS,
  MahjongActionSchema,
  type MahjongActionInput,
  type MahjongMode,
  type MahjongView,
} from './schema';

export type MahjongGameDefinition = GameDefinition<
  MahjongState,
  MahjongActionInput,
  MahjongView,
  MahjongMode
>;

const toAction = (a: MahjongActionInput): MahjongAction => {
  switch (a.kind) {
    case 'discard':
      return { type: 'discard', tile: a.tile };
    case 'self-kong':
      return { type: 'self-kong', kind: a.tileKind };
    case 'chow':
      return { type: 'chow', tiles: a.tiles };
    default:
      return { type: a.kind };
  }
};

function viewFor(s: MahjongState, viewer: number | null): MahjongView {
  const me = viewer !== null && viewer >= 0 && viewer < s.seats ? viewer : null;
  const phase = s.phase;
  const claim = me !== null ? claimOptions(s, me) : null;
  const myHand = me !== null ? s.players[me]!.hand : [];
  const myMelds = me !== null ? s.players[me]!.melds.length : 0;
  return {
    handNumber: s.handNumber,
    rounds: s.rounds,
    roundWind: roundWind(s),
    dealer: s.dealer,
    streak: s.streak,
    seatWinds: Array.from({ length: s.seats }, (_, i) => seatWind(s, i)),
    wallCount: s.wall.length,
    points: [...s.points],
    players: s.players.map((p, i) => ({
      handCount: p.hand.length,
      melds: p.melds.map((m) => {
        const hidden = m.concealed && i !== me;
        return {
          type: m.type,
          kind: hidden ? null : m.kind,
          tiles: hidden ? [] : [...m.tiles],
          concealed: m.concealed,
          from: m.from,
        };
      }),
      flowers: [...p.flowers],
      discards: [...p.discards],
    })),
    hand: [...myHand],
    phase:
      phase.type === 'discard'
        ? { type: 'discard', seat: phase.seat, drawn: phase.seat === me ? phase.drawn : null }
        : phase.type === 'claim'
          ? {
              type: 'claim',
              from: phase.from,
              tile: phase.tile,
              robKong: phase.robKong !== null,
              responded: me !== null && phase.responses[me] !== null,
            }
          : phase.type === 'hand-end'
            ? { type: 'hand-end', ready: [...phase.ready] }
            : { type: 'over' },
    options: {
      win: me !== null && (canSelfDraw(s, me) || (claim?.win ?? false)),
      selfKong: me !== null ? selfKongKinds(s, me) : [],
      chow: claim?.chow ?? [],
      pung: claim?.pung ?? false,
      kong: claim?.kong ?? false,
    },
    waits:
      me !== null && myHand.length % 3 === 1 ? waitingKinds(kindCounts(myHand), 5 - myMelds) : [],
    history: s.history.map((h) => ({ ...h })),
    lastHand: s.lastHand
      ? {
          ...s.lastHand,
          tai: s.lastHand.tai.map((t) => ({ ...t })),
          deltas: [...s.lastHand.deltas],
          hands: s.lastHand.hands.map((h) => [...h]),
        }
      : null,
    placements: isOver(s) ? placements(s) : null,
  };
}

/**
 * 台灣 16 張麻將（四人）。規則引擎在 engine.ts / scoring.ts，這裡只負責接上平台介面。
 * 一場對局 = 一將（東風圈或四圈），點數最高者獲勝。
 *
 * 平台的棋鐘是「總時間」制，不適合麻將的每手限時與逾時託管，所以這裡關閉棋鐘，
 * 每手 15 秒、反應 5 秒與託管由房間層處理（尚未實作）。
 */
export function createMahjongDefinition(): MahjongGameDefinition {
  return {
    id: 'mahjong',
    name: '麻將',
    players: { min: MAHJONG_SEATS, max: MAHJONG_SEATS },
    modes: [
      { id: 'east', label: MAHJONG_MODE_LABELS.east },
      { id: 'full', label: MAHJONG_MODE_LABELS.full },
    ],
    defaultMode: 'east',
    features: { drawOffers: false, clock: false, resign: false },

    parseAction(raw) {
      const r = MahjongActionSchema.safeParse(raw);
      return r.success ? r.data : null;
    },

    setup({ mode, random, seats }) {
      if (seats !== MAHJONG_SEATS) throw new Error('Mahjong needs exactly 4 seats');
      // 首局莊家由伺服器亂數決定；之後每把的洗牌由這個種子推出
      return createMahjongGame({
        seed: random(2 ** 31),
        dealer: random(MAHJONG_SEATS),
        rounds: mode === 'full' ? 4 : 1,
      });
    },

    activeSeats,

    apply(s, seat, action) {
      const r = applyMahjongAction(s, seat, toAction(action));
      return r.ok ? ok(r.value) : err(r.error);
    },

    outcome(s): MatchOutcome | null {
      if (!isOver(s)) return null;
      const winner = placements(s).indexOf(1);
      return { type: 'win', winner, reason: 'points' };
    },

    placements(s) {
      return isOver(s) ? placements(s) : null;
    },

    seatLabel(s, seat) {
      return ['東', '南', '西', '北'][(seat - s.initialDealer + s.seats) % s.seats] ?? null;
    },

    view: viewFor,
  };
}

export const mahjongGame = createMahjongDefinition();
