import type { TimeControlId } from '@xiangqi-arena/game-protocol';
import type { XiangqiAction, XiangqiMode } from '@xiangqi-arena/games-xiangqi';
import type { XiangqiSnapshot } from './xiangqi';

/** UI 送出的意圖（actionId、expectedVersion 由控制器補上） */
export type IntentInput =
  | { type: 'setReady'; ready: boolean }
  | { type: 'configure'; mode: XiangqiMode; timeControl: TimeControlId }
  | { type: 'start' }
  | { type: 'action'; action: XiangqiAction }
  | { type: 'resign' }
  | { type: 'offerDraw' }
  | { type: 'respondDraw'; accept: boolean }
  | { type: 'rematch' }
  | { type: 'sync' };

export type ConnectionStatus =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'replaced' | 'error';

export interface GameControllerState {
  snapshot: XiangqiSnapshot | null;
  /** 收到快照時的 performance.now()，用來在本機推算計時器 */
  snapshotAt: number;
}
