import { z } from 'zod';
import { GameModeSchema, PROTOCOL_VERSION, SquareSchema, TimeControlIdSchema } from './common';

/** 加入 / 建立房間時的選項（onAuth 驗證） */
export const JoinOptionsSchema = z
  .object({
    protocol: z.literal(PROTOCOL_VERSION),
    /** 匿名訪客的長期識別祕密；只用於重新取回座位，不可外流 */
    playerToken: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    name: z
      .string()
      .trim()
      .min(1)
      .max(16)
      .regex(/^[^<>\u0000-\u001f]+$/),
    mode: GameModeSchema.optional(),
    timeControl: TimeControlIdSchema.optional(),
  })
  .strict();
export type JoinOptions = z.infer<typeof JoinOptionsSchema>;

export const ActionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export const GameActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('move'), from: SquareSchema, to: SquareSchema }).strict(),
  z.object({ kind: z.literal('flip'), square: SquareSchema }).strict(),
]);
export type GameAction = z.infer<typeof GameActionSchema>;

/** 客戶端只送「意圖」，伺服器驗證後才更新狀態 */
export const ClientIntentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setReady'), ready: z.boolean() }).strict(),
  z
    .object({
      type: z.literal('configure'),
      mode: GameModeSchema,
      timeControl: TimeControlIdSchema,
    })
    .strict(),
  z.object({ type: z.literal('start') }).strict(),
  z
    .object({
      type: z.literal('action'),
      actionId: ActionIdSchema,
      expectedVersion: z.number().int().min(0),
      action: GameActionSchema,
    })
    .strict(),
  z.object({ type: z.literal('resign'), actionId: ActionIdSchema }).strict(),
  z.object({ type: z.literal('offerDraw'), actionId: ActionIdSchema }).strict(),
  z
    .object({ type: z.literal('respondDraw'), actionId: ActionIdSchema, accept: z.boolean() })
    .strict(),
  z.object({ type: z.literal('rematch'), actionId: ActionIdSchema }).strict(),
  z.object({ type: z.literal('sync') }).strict(),
]);
export type ClientIntent = z.infer<typeof ClientIntentSchema>;

/** Colyseus 訊息頻道名稱 */
export const MSG = {
  intent: 'intent',
  snapshot: 'snapshot',
  ack: 'ack',
  notice: 'notice',
} as const;
