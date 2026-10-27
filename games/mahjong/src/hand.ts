import { KIND_COUNT, type TileKind } from './tiles';

/** 手牌拆解出來的一組：順子（kind = 最小那張）或刻子 */
export interface HandSet {
  type: 'chow' | 'pung';
  kind: TileKind;
}

/** 一種拆法：sets 個面子 + 一對眼 */
export interface Decomposition {
  pair: TileKind;
  sets: HandSet[];
}

const canStartChow = (kind: TileKind): boolean => kind < 27 && kind % 9 <= 6;

function* setsOf(counts: number[], need: number, from = 0): Generator<HandSet[]> {
  if (need === 0) {
    if (counts.every((c) => c === 0)) yield [];
    return;
  }
  let k = from;
  while (k < KIND_COUNT && counts[k] === 0) k++;
  if (k >= KIND_COUNT) return;
  // 最小的那張一定屬於某個刻子或以它開頭的順子
  if (counts[k]! >= 3) {
    counts[k]! -= 3;
    for (const rest of setsOf(counts, need - 1, k)) yield [{ type: 'pung', kind: k }, ...rest];
    counts[k]! += 3;
  }
  if (canStartChow(k) && counts[k + 1]! > 0 && counts[k + 2]! > 0) {
    counts[k]!--;
    counts[k + 1]!--;
    counts[k + 2]!--;
    for (const rest of setsOf(counts, need - 1, k)) yield [{ type: 'chow', kind: k }, ...rest];
    counts[k]!++;
    counts[k + 1]!++;
    counts[k + 2]!++;
  }
}

/**
 * 暗手（不含已亮出的面子）所有能湊成「setsNeeded 個面子 + 一對眼」的拆法。
 * counts 是 34 格的牌種張數。
 */
export function decompositions(counts: readonly number[], setsNeeded: number): Decomposition[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total !== setsNeeded * 3 + 2) return [];
  const work = counts.slice();
  const out: Decomposition[] = [];
  for (let pair = 0; pair < KIND_COUNT; pair++) {
    if (work[pair]! < 2) continue;
    work[pair]! -= 2;
    for (const sets of setsOf(work, setsNeeded)) out.push({ pair, sets });
    work[pair]! += 2;
  }
  return out;
}

export const isComplete = (counts: readonly number[], setsNeeded: number): boolean =>
  decompositions(counts, setsNeeded).length > 0;

/** 聽哪些牌：counts 為摸牌前的暗手（3n+1 張） */
export function waitingKinds(counts: readonly number[], setsNeeded: number): TileKind[] {
  const out: TileKind[] = [];
  const work = counts.slice();
  for (let k = 0; k < KIND_COUNT; k++) {
    if (work[k]! >= 4) continue;
    work[k]!++;
    if (isComplete(work, setsNeeded)) out.push(k);
    work[k]!--;
  }
  return out;
}
