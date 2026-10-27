import { z } from 'zod';
import { MatchViewBaseSchema } from '@xiangqi-arena/game-protocol';

/** 象棋（含暗棋模式）專屬的動作與畫面資料格式。平台協定不認得這些欄位。 */

export const XiangqiModeSchema = z.enum(['classic', 'banqi']);
export type XiangqiMode = z.infer<typeof XiangqiModeSchema>;

export const SeatSchema = z.union([z.literal(0), z.literal(1)]);
export const SideSchema = z.enum(['red', 'black']);
export const PieceKindSchema = z.enum([
  'king',
  'advisor',
  'elephant',
  'chariot',
  'horse',
  'cannon',
  'pawn',
]);
export const SquareSchema = z.number().int().min(0).max(89);

export const XiangqiActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('move'), from: SquareSchema, to: SquareSchema }).strict(),
  z.object({ kind: z.literal('flip'), square: SquareSchema }).strict(),
]);
export type XiangqiAction = z.infer<typeof XiangqiActionSchema>;

const PieceRefSchema = z.object({ side: SideSchema, kind: PieceKindSchema });

/** 棋盤格：null = 空；faceUp=false 時「不含」身分資訊 */
export const CellViewSchema = z.union([
  z.null(),
  z.object({ id: z.string(), faceUp: z.literal(false) }).strict(),
  z
    .object({ id: z.string(), faceUp: z.literal(true), side: SideSchema, kind: PieceKindSchema })
    .strict(),
]);
export type CellView = z.infer<typeof CellViewSchema>;

export const LastActionSchema = z.object({
  ply: z.number().int(),
  seat: SeatSchema,
  kind: z.enum(['move', 'flip']),
  from: SquareSchema.nullable(),
  to: SquareSchema,
  pieceId: z.string(),
  captured: PieceRefSchema.nullable(),
  revealed: PieceRefSchema.nullable(),
});
export type LastAction = z.infer<typeof LastActionSchema>;

export const MoveListEntrySchema = z.object({
  ply: z.number().int(),
  seat: SeatSchema,
  side: SideSchema.nullable(),
  notation: z.string().max(32),
});
export type MoveListEntry = z.infer<typeof MoveListEntrySchema>;

/** 遊戲自己的畫面資料；平台會再合併 version、turnSeat、outcome 等欄位 */
export const XiangqiViewSchema = z.object({
  mode: XiangqiModeSchema,
  seatSides: z.tuple([SideSchema.nullable(), SideSchema.nullable()]),
  board: z.array(CellViewSchema).max(90),
  /** 只在輪到觀看者時提供，作為落點提示；最終合法性仍由伺服器判定 */
  legalActions: z.array(XiangqiActionSchema).max(300),
  lastAction: LastActionSchema.nullable(),
  checkSquare: SquareSchema.nullable(),
  moveList: z.array(MoveListEntrySchema).max(2000),
  captured: z.object({ red: z.array(PieceKindSchema), black: z.array(PieceKindSchema) }),
  progress: z.object({ plySinceProgress: z.number().int(), limit: z.number().int() }),
});
export type XiangqiView = z.infer<typeof XiangqiViewSchema>;

/** 舊版網址使用 mode=xiangqi 代表大盤象棋 */
export function parseXiangqiMode(raw: unknown): XiangqiMode | null {
  if (raw === 'xiangqi') return 'classic';
  const r = XiangqiModeSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export const XIANGQI_MODE_LABELS: Record<XiangqiMode, string> = {
  classic: '大盤象棋',
  banqi: '暗棋',
};

export const XIANGQI_REASON_LABELS: Record<string, string> = {
  checkmate: '將死',
  stalemate: '困斃（無子可動）',
  'perpetual-check': '長將違規',
  'perpetual-chase': '長捉違規',
  'no-pieces': '棋子全被吃光',
  'no-moves': '無棋可走',
  repetition: '重複局面',
  'mutual-perpetual': '雙方皆長將／長捉',
  'move-limit': '達到無進展步數上限',
  'insufficient-material': '雙方皆無攻擊子力',
};

export const XIANGQI_ERROR_MESSAGES: Record<string, string> = {
  NOT_YOUR_PIECE: '不能操作對方的棋子',
  CANNOT_FLIP: '這顆棋子不能翻',
};

/** 前端收到的完整對局畫面：平台欄位 + 象棋欄位 */
export const XiangqiMatchViewSchema = MatchViewBaseSchema.extend(XiangqiViewSchema.shape);
export type XiangqiMatchView = z.infer<typeof XiangqiMatchViewSchema>;
