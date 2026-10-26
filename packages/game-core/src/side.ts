export type Side = 'red' | 'black';
export const SIDES: readonly Side[] = ['red', 'black'];
export const opposite = (side: Side): Side => (side === 'red' ? 'black' : 'red');

/** 座位：0 = 房主/玩家 1，1 = 玩家 2。陣營（紅黑）與座位分離，以支援換邊與暗棋翻棋定色。 */
export type Seat = 0 | 1;
export const SEATS: readonly Seat[] = [0, 1];
export const otherSeat = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

export type PieceKind = 'king' | 'advisor' | 'elephant' | 'chariot' | 'horse' | 'cannon' | 'pawn';
export const PIECE_KINDS: readonly PieceKind[] = [
  'king',
  'advisor',
  'elephant',
  'chariot',
  'horse',
  'cannon',
  'pawn',
];

/** 傳統中文棋子名稱：紅方 / 黑方。 */
export const PIECE_LABELS: Record<Side, Record<PieceKind, string>> = {
  red: {
    king: '帥',
    advisor: '仕',
    elephant: '相',
    chariot: '俥',
    horse: '傌',
    cannon: '炮',
    pawn: '兵',
  },
  black: {
    king: '將',
    advisor: '士',
    elephant: '象',
    chariot: '車',
    horse: '馬',
    cannon: '砲',
    pawn: '卒',
  },
};

export const pieceLabel = (side: Side, kind: PieceKind): string => PIECE_LABELS[side][kind];
