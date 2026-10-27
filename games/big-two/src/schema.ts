import { z } from 'zod';
import { MatchViewBaseSchema } from '@xiangqi-arena/game-protocol';

/** 大老二專屬的動作與畫面資料格式。平台協定不認得這些欄位。 */

export const BigTwoModeSchema = z.enum(['standard']);
export type BigTwoMode = z.infer<typeof BigTwoModeSchema>;

export const CardSchema = z.number().int().min(0).max(51);
export const ComboKindSchema = z.enum([
  'single',
  'pair',
  'straight',
  'full-house',
  'four-of-a-kind',
  'straight-flush',
]);

export const BigTwoActionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('play'),
      cards: z
        .array(CardSchema)
        .min(1)
        .max(5)
        .refine((cards) => new Set(cards).size === cards.length, 'duplicate cards'),
    })
    .strict(),
  z.object({ kind: z.literal('pass') }).strict(),
]);
export type BigTwoActionInput = z.infer<typeof BigTwoActionSchema>;

const SeatSchema = z.number().int().min(0).max(3);
const PlayedSchema = z.object({ kind: ComboKindSchema, cards: z.array(CardSchema).max(5) });

export const RoundMarkViewSchema = z.union([
  z.null(),
  z.object({ type: z.literal('pass') }),
  PlayedSchema.extend({ type: z.literal('play') }),
]);
export type RoundMarkView = z.infer<typeof RoundMarkViewSchema>;

export const BigTwoHistoryViewSchema = z.object({
  seq: z.number().int(),
  seat: SeatSchema,
  /** null = 過牌 */
  kind: ComboKindSchema.nullable(),
  cards: z.array(CardSchema).max(5),
  notation: z.string().max(64),
});
export type BigTwoHistoryView = z.infer<typeof BigTwoHistoryViewSchema>;

/** 遊戲自己的畫面資料；平台會再合併 version、turnSeat、outcome 等欄位 */
export const BigTwoViewSchema = z.object({
  /** 觀看者自己的手牌；觀戰者為空陣列。其他人的手牌只給張數 */
  hand: z.array(CardSchema).max(13),
  handCounts: z.array(z.number().int().min(0).max(13)).length(4),
  /** 目前桌上要壓的牌；null = 自由出牌 */
  table: PlayedSchema.extend({ seat: SeatSchema }).nullable(),
  /** 本輪每個座位最後的動作 */
  round: z.array(RoundMarkViewSchema).length(4),
  /** 第一手必須包含梅花 3 */
  opening: z.boolean(),
  history: z.array(BigTwoHistoryViewSchema).max(1000),
  /** 結束後公開：名次（1 起算）、各家剩下的牌、參考罰分 */
  result: z
    .object({
      placements: z.array(z.number().int().min(1).max(4)).length(4),
      hands: z.array(z.array(CardSchema).max(13)).length(4),
      penalties: z.array(z.number().int().min(0)).length(4),
    })
    .nullable(),
});
export type BigTwoView = z.infer<typeof BigTwoViewSchema>;

export const BIG_TWO_MODE_LABELS: Record<BigTwoMode, string> = {
  standard: '台灣規則',
};

export const BIG_TWO_REASON_LABELS: Record<string, string> = {
  'empty-hand': '率先出完手牌',
};

export const BIG_TWO_ERROR_MESSAGES: Record<string, string> = {
  NOT_IN_HAND: '你沒有這些牌',
  INVALID_COMBO: '不是合法的牌型',
  MUST_INCLUDE_3C: '第一手必須包含梅花 3',
  MUST_MATCH_SIZE: '張數要和桌上的牌相同',
  TOO_WEAK: '壓不過桌上的牌',
  CANNOT_PASS: '自由出牌時不能過',
};

/** 前端收到的完整對局畫面：平台欄位 + 大老二欄位 */
export const BigTwoMatchViewSchema = MatchViewBaseSchema.extend(BigTwoViewSchema.shape);
export type BigTwoMatchView = z.infer<typeof BigTwoMatchViewSchema>;
