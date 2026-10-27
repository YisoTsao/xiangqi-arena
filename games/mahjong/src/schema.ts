import { z } from 'zod';
import { MatchViewBaseSchema } from '@xiangqi-arena/game-protocol';

/** 麻將專屬的動作與畫面資料格式。平台協定不認得這些欄位。 */

export const MahjongModeSchema = z.enum(['east', 'full']);
export type MahjongMode = z.infer<typeof MahjongModeSchema>;

export const TileSchema = z.number().int().min(0).max(143);
export const TileKindSchema = z.number().int().min(0).max(41);
const SeatSchema = z.number().int().min(0).max(3);

export const MahjongActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('discard'), tile: TileSchema }).strict(),
  z.object({ kind: z.literal('win') }).strict(),
  z.object({ kind: z.literal('self-kong'), tileKind: TileKindSchema.max(33) }).strict(),
  z.object({ kind: z.literal('pass') }).strict(),
  z.object({ kind: z.literal('chow'), tiles: z.tuple([TileSchema, TileSchema]) }).strict(),
  z.object({ kind: z.literal('pung') }).strict(),
  z.object({ kind: z.literal('kong') }).strict(),
  z.object({ kind: z.literal('next') }).strict(),
]);
export type MahjongActionInput = z.infer<typeof MahjongActionSchema>;

export const MeldViewSchema = z.object({
  type: z.enum(['chow', 'pung', 'kong']),
  /** 別人的暗槓不公開牌種 */
  kind: TileKindSchema.nullable(),
  tiles: z.array(TileSchema).max(4),
  concealed: z.boolean(),
  from: SeatSchema.nullable(),
});

export const PlayerViewSchema = z.object({
  handCount: z.number().int().min(0).max(17),
  melds: z.array(MeldViewSchema).max(5),
  flowers: z.array(TileSchema).max(8),
  discards: z.array(TileSchema).max(64),
});

export const PhaseViewSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('discard'),
    seat: SeatSchema,
    /** 剛摸進的牌，只給摸牌的人 */
    drawn: TileSchema.nullable(),
  }),
  z.object({
    type: z.literal('claim'),
    from: SeatSchema,
    tile: TileSchema,
    robKong: z.boolean(),
    /** 觀看者自己是否已回應；別人的回應在結算前不公開 */
    responded: z.boolean(),
  }),
  z.object({ type: z.literal('hand-end'), ready: z.array(z.boolean()).length(4) }),
  z.object({ type: z.literal('over') }),
]);

export const OptionsViewSchema = z.object({
  win: z.boolean(),
  selfKong: z.array(TileKindSchema).max(4),
  chow: z.array(z.tuple([TileSchema, TileSchema])).max(3),
  pung: z.boolean(),
  kong: z.boolean(),
});

export const TaiItemSchema = z.object({
  key: z.string().max(32),
  label: z.string().max(16),
  tai: z.number().int().min(0),
});

export const HandResultViewSchema = z.object({
  hand: z.number().int().min(1),
  kind: z.enum(['win', 'draw']),
  winner: SeatSchema.nullable(),
  from: SeatSchema.nullable(),
  winningTile: TileSchema.nullable(),
  tai: z.array(TaiItemSchema).max(32),
  dealerTai: z.number().int().min(0),
  dealer: SeatSchema,
  deltas: z.array(z.number().int()).length(4),
  hands: z.array(z.array(TileSchema).max(17)).length(4),
});
export type HandResultView = z.infer<typeof HandResultViewSchema>;

/** 遊戲自己的畫面資料；平台會再合併 version、activeSeats、outcome 等欄位 */
export const MahjongViewSchema = z.object({
  handNumber: z.number().int().min(1),
  rounds: z.number().int().min(1).max(4),
  roundWind: z.number().int().min(0).max(3),
  dealer: SeatSchema,
  streak: z.number().int().min(0),
  seatWinds: z.array(z.number().int().min(0).max(3)).length(4),
  wallCount: z.number().int().min(0).max(144),
  points: z.array(z.number().int()).length(4),
  players: z.array(PlayerViewSchema).length(4),
  /** 觀看者自己的暗手；觀戰者為空陣列 */
  hand: z.array(TileSchema).max(17),
  phase: PhaseViewSchema,
  /** 觀看者此刻可以做的事 */
  options: OptionsViewSchema,
  /** 聽牌提示：觀看者聽哪些牌種 */
  waits: z.array(TileKindSchema).max(34),
  history: z
    .array(z.object({ seq: z.number().int(), seat: SeatSchema, notation: z.string().max(32) }))
    .max(400),
  lastHand: HandResultViewSchema.nullable(),
  /** 整將結束後的名次（1 起算） */
  placements: z.array(z.number().int().min(1).max(4)).length(4).nullable(),
});
export type MahjongView = z.infer<typeof MahjongViewSchema>;

export const MAHJONG_MODE_LABELS: Record<MahjongMode, string> = {
  east: '東風圈',
  full: '四圈',
};

export const MAHJONG_REASON_LABELS: Record<string, string> = {
  points: '整將點數最高',
};

export const MAHJONG_ERROR_MESSAGES: Record<string, string> = {
  WRONG_PHASE: '現在不能這樣做',
  NOT_IN_HAND: '你沒有這張牌',
  CANNOT_DISCARD_FLOWER: '花牌不能打出',
  CANNOT_WIN: '還不能胡',
  FURITEN: '過水：自己摸牌前不能胡這張',
  CANNOT_CHOW: '不能吃',
  CANNOT_PUNG: '不能碰',
  CANNOT_KONG: '不能槓',
};

/** 前端收到的完整對局畫面：平台欄位 + 麻將欄位 */
export const MahjongMatchViewSchema = MatchViewBaseSchema.extend(MahjongViewSchema.shape);
export type MahjongMatchView = z.infer<typeof MahjongMatchViewSchema>;
