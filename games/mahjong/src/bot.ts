import {
  canSelfDraw,
  claimOptions,
  selfKongKinds,
  type MahjongAction,
  type MahjongState,
} from './engine';
import { isHonor, kindCounts, kindOf, type Tile } from './tiles';
import type { MahjongActionInput, MahjongView } from './schema';

/**
 * 一張牌對手牌的「黏性」：同種越多、旁邊的牌越多越有用。電腦先打最沒用的牌。
 * 只求合理，不求強。
 */
function usefulness(counts: readonly number[], tile: Tile): number {
  const k = kindOf(tile);
  let score = (counts[k]! - 1) * 4;
  if (!isHonor(k)) {
    const r = k % 9;
    for (const d of [-2, -1, 1, 2]) {
      const n = k + d;
      if (r + d < 0 || r + d > 8) continue;
      score += counts[n]! * (Math.abs(d) === 1 ? 2 : 1);
    }
    if (r === 0 || r === 8) score -= 1;
  } else {
    score -= 1;
  }
  return score;
}

export function chooseDiscard(state: MahjongState, seat: number): Tile {
  const hand = state.players[seat]!.hand;
  const counts = kindCounts(hand);
  let best = hand[0]!;
  let bestScore = Infinity;
  for (const t of hand) {
    const s = usefulness(counts, t);
    if (s < bestScore) {
      best = t;
      bestScore = s;
    }
  }
  return best;
}

/** 電腦玩家（也用於逾時託管）在目前狀態下的動作 */
export function botAction(state: MahjongState, seat: number): MahjongAction {
  const phase = state.phase;
  switch (phase.type) {
    case 'discard': {
      if (canSelfDraw(state, seat)) return { type: 'win' };
      const kong = selfKongKinds(state, seat)[0];
      if (kong !== undefined) return { type: 'self-kong', kind: kong };
      return { type: 'discard', tile: chooseDiscard(state, seat) };
    }
    case 'claim': {
      const opts = claimOptions(state, seat);
      if (opts.win) return { type: 'win' };
      // 字牌對子才碰（湊台數）；其他一律不吃不碰，保持門清
      if (opts.pung && isHonor(kindOf(phase.tile))) return { type: 'pung' };
      return { type: 'pass' };
    }
    case 'hand-end':
    case 'over':
      return { type: 'next' };
  }
}

/**
 * 只用觀看者自己看得到的資料（MahjongView）決定動作：前端練習模式與伺服器託管都可以用，
 * 不需要讀取完整的伺服器狀態。
 */
export function botActionForView(view: MahjongView): MahjongActionInput {
  const phase = view.phase;
  switch (phase.type) {
    case 'discard': {
      if (view.options.win) return { kind: 'win' };
      const kong = view.options.selfKong[0];
      if (kong !== undefined) return { kind: 'self-kong', tileKind: kong };
      const counts = kindCounts(view.hand);
      let best = view.hand[0]!;
      let bestScore = Infinity;
      for (const t of view.hand) {
        const s = usefulness(counts, t);
        if (s < bestScore) {
          best = t;
          bestScore = s;
        }
      }
      return { kind: 'discard', tile: best };
    }
    case 'claim':
      if (view.options.win) return { kind: 'win' };
      if (view.options.pung && isHonor(kindOf(phase.tile))) return { kind: 'pung' };
      return { kind: 'pass' };
    case 'hand-end':
    case 'over':
      return { kind: 'next' };
  }
}

/** 引擎動作 → 協定上的動作格式 */
export function toActionInput(a: MahjongAction): MahjongActionInput {
  switch (a.type) {
    case 'discard':
      return { kind: 'discard', tile: a.tile };
    case 'self-kong':
      return { kind: 'self-kong', tileKind: a.kind };
    case 'chow':
      return { kind: 'chow', tiles: a.tiles };
    default:
      return { kind: a.type };
  }
}
