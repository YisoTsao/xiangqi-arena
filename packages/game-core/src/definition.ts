import type { RandomInt, Result } from '@xiangqi-arena/shared';

/**
 * 平台與遊戲之間的契約。平台（對局狀態機、房間、協定、資料庫）只認得這個介面，
 * 不知道任何一款遊戲的規則；每款遊戲以一個 GameDefinition 接上平台。
 */

/** 座位編號：0 起算，上限為遊戲的 players.max - 1 */
export type SeatIndex = number;

/** 平台自己會產生的結束原因；其餘原因字串由遊戲定義（例如 'checkmate'） */
export type PlatformWinReason = 'resign' | 'timeout' | 'abandon';
export type PlatformDrawReason = 'agreement';

export type MatchOutcome =
  { type: 'win'; winner: SeatIndex; reason: string } | { type: 'draw'; reason: string };

export interface GameModeInfo<Mode extends string = string> {
  id: Mode;
  label: string;
}

export interface GameSetupContext<Mode extends string = string> {
  mode: Mode;
  seats: number;
  random: RandomInt;
  /** 先手 / 執紅等「第一順位」的座位；再來一局時由平台輪替 */
  firstSeat: SeatIndex;
}

export interface AppliedAction<State> {
  state: State;
  /** 寫入棋譜與資料庫的人類可讀紀錄 */
  notation: string;
}

/** 動作驗證失敗時回傳的錯誤碼（平台會原樣回給客戶端） */
export type GameErrorCode = string;

export interface GameDefinition<State, Action, View, Mode extends string = string> {
  /** 全平台唯一，也是資料庫 games.id */
  id: string;
  name: string;
  players: { min: number; max: number };
  modes: readonly GameModeInfo<Mode>[];
  defaultMode: Mode;
  /** 平台提供的功能開關；和棋提議目前只支援兩人遊戲 */
  features: { drawOffers: boolean; clock: boolean; resign: boolean };
  /** 驗證並轉型客戶端送來的動作；回傳 null 表示格式錯誤 */
  parseAction(raw: unknown): Action | null;
  setup(ctx: GameSetupContext<Mode>): State;
  /** 目前可以行動的座位；空陣列表示遊戲已結束或在等待外部事件 */
  activeSeats(state: State): SeatIndex[];
  apply(state: State, seat: SeatIndex, action: Action): Result<AppliedAction<State>, GameErrorCode>;
  /** 規則判定的結果（將死、無子可走等）；未結束回傳 null */
  outcome(state: State): MatchOutcome | null;
  /**
   * 平台判定結束（認輸、超時、和棋）時，讓遊戲把結果寫進自己的狀態。
   * forfeitSeat = 認輸、超時或斷線被判負的座位；和棋時為 null
   */
  end?(state: State, outcome: MatchOutcome, forfeitSeat: SeatIndex | null): State;
  /** 依觀看者產生畫面資料，必須濾掉觀看者不該知道的資訊；viewer = null 表示觀戰 */
  view(state: State, viewer: SeatIndex | null): View;
  /** 座位在這局的陣營標籤（例如 red / black），寫入資料庫用 */
  seatLabel?(state: State, seat: SeatIndex): string | null;
  /** 多人遊戲的名次（1 起算，依座位排列），寫入資料庫用；省略則只記勝負 */
  placements?(state: State, outcome: MatchOutcome): number[] | null;
  /** 認輸或斷線時的結果；省略時兩人遊戲由對手獲勝 */
  forfeit?(state: State, seat: SeatIndex, reason: PlatformWinReason): MatchOutcome;
}

// 讓呼叫端以 AnyGameDefinition 處理註冊表中型別各異的遊戲
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameDefinition = GameDefinition<any, any, any, string>;
