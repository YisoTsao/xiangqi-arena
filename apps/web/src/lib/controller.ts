import type { TimeControlId } from '@xiangqi-arena/game-protocol';

/**
 * UI 送出的意圖（actionId、expectedVersion 由控制器補上）。
 * 動作內容由各遊戲自己的 schema 定義，平台只負責轉送。
 */
export type IntentInput<Action = unknown, Mode extends string = string> =
  | { type: 'setReady'; ready: boolean }
  | { type: 'configure'; mode: Mode; timeControl: TimeControlId }
  | { type: 'start' }
  | { type: 'action'; action: Action }
  | { type: 'resign' }
  | { type: 'offerDraw' }
  | { type: 'respondDraw'; accept: boolean }
  | { type: 'rematch' }
  | { type: 'sync' };

export type ConnectionStatus =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'replaced' | 'error';
