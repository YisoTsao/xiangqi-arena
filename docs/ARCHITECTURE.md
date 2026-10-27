# 架構文件

> 版本 0.1 · 最後更新 2026-10-26

## 1. 總覽

```
┌─────────────────┐        WebSocket (Colyseus)        ┌────────────────────┐
│  apps/web       │ ─────────────────────────────────▶ │ apps/game-server   │
│  Next.js 16     │ ◀───────────────────────────────── │ Colyseus 0.18      │
│  React 19       │        snapshot / ack / notice     │ Node 22            │
│  R3F + Three.js │                                    │  └ ArenaRoom       │
└─────────────────┘                                    │  └ RoomController  │
         │                                             │  └ Match           │
         │ 只讀公開統計                                 └─────────┬──────────┘
         ▼                                                       │ Service Role
┌─────────────────────────────────────────────────────────────────▼──────────┐
│ Supabase（PostgreSQL）profiles / game_sessions / game_players / game_moves  │
└────────────────────────────────────────────────────────────────────────────┘
```

**核心原則**：規則引擎是純函式、與 React / Three.js / 網路層完全無關的套件，
伺服器與瀏覽器（本機模式）共用同一份程式碼，因此「伺服器怎麼判，前端就怎麼顯示」。

## 2. Monorepo 結構

```
xiangqi-arena/
├── apps/
│   ├── web/              Next.js（App Router）前端
│   └── game-server/      Colyseus 遊戲伺服器
├── packages/
│   ├── shared/           Result、亂數、洗牌、房間代碼
│   ├── game-core/        平台契約 GameDefinition、座位、勝負、棋鐘（N 座位）
│   ├── game-xiangqi/     象棋規則引擎（FEN、走法、將軍、長將長捉、中文記譜）
│   ├── game-banqi/       暗棋規則引擎（可配置 RuleSet）
│   ├── game-protocol/    遊戲無關的連線協定（v2）+ zod 執行時驗證
│   ├── game-match/       泛型對局狀態機（回合、版本、計時、和棋、認輸）
│   └── game-renderer/    棋盤呈現：2.5D（R3F）與 2D（SVG）
├── games/
│   ├── xiangqi/          象棋遊戲定義：classic（大盤）與 banqi（暗棋）兩種模式
│   └── registry/         遊戲註冊表（伺服器與前端共用）
├── supabase/migrations/  資料結構
└── docs/                 本資料夾
```

相依方向（單向，無循環）：

```
shared ← game-core ← game-protocol ← game-match ─────────────→ apps/*
         game-core ← game-xiangqi ─┐
         game-core ← game-banqi ───┼→ games/xiangqi → games/registry → apps/*
                     game-protocol ┘
game-core → game-renderer → apps/web
```

平台層（`game-core`、`game-protocol`、`game-match`、`RoomController`）**不依賴任何一款遊戲**；
遊戲只透過 `GameDefinition` 接上平台（見 §4）。

工具：pnpm workspace。套件以 TypeScript 原始碼發佈（`main` 指向 `src/index.ts`），
由 Next.js 的 `transpilePackages` 與伺服器端的 tsup 轉譯，省去 build step。

## 3. 規則引擎設計

全部是**純函式 + 不可變狀態**：

```ts
applyXiangqiMove(state, side, from, to): Result<XiangqiState, XiangqiMoveError>
applyBanqiAction(state, seat, action): Result<BanqiState, BanqiActionError>
```

- 不丟例外，一律回傳 `Result`，錯誤碼直接對應到協定的 `ErrorCode`。
- 狀態含 `positionKeys`（歷史局面鍵），用於重複局面、長將／長捉判定。
- 棋子有穩定 `id`，供渲染層做動畫追蹤；`id` **不參與**局面比較。
- 走法產生器以 perft 驗證：開局 perft(1)=44、perft(2)=1920、perft(3)=79666。

## 4. 平台與遊戲（`GameDefinition` 與 `packages/game-match`）

每款遊戲提供一個 `GameDefinition`（`packages/game-core/src/definition.ts`）：

| 成員                            | 說明                                                    |
| ------------------------------- | ------------------------------------------------------- |
| `id`、`players`、`modes`        | 註冊表 id、座位數範圍、模式（象棋：`classic`、`banqi`） |
| `features`                      | 是否支援和棋提議（限兩人）、計時、認輸                  |
| `parseAction(raw)`              | 用遊戲自己的 zod schema 驗證客戶端動作                  |
| `setup` / `apply`               | 開局；套用動作並回傳新狀態與棋譜文字，或錯誤碼          |
| `activeSeats` / `outcome`       | 現在誰能行動（可多人）；規則判定的結果                  |
| `view(state, viewer)`           | 依座位過濾隱藏資訊後的畫面資料                          |
| `end` / `seatLabel` / `forfeit` | 選配：寫入平台判定的結果、座位陣營、多人遊戲的認輸處理  |

新增遊戲 = 在 `games/<id>/` 寫一個定義，並加進 `games/registry`。

`Match` 類別包住遊戲定義，負責平台共通的部分：

| 職責     | 實作                                                      |
| -------- | --------------------------------------------------------- |
| 回合     | `activeSeats` 只有一個座位時才計時；不是行動座位一律拒絕  |
| 棋局版本 | 每次成功操作 `version++`，客戶端須附 `expectedVersion`    |
| 重複封包 | 保留最近 512 個 `actionId`，重送回 `DUPLICATE`            |
| 計時     | Fischer 加秒；`tick(now)` 判超時；`msUntilFlag()` 供排程  |
| 和棋     | 提議／接受／拒絕；對手走棋視同拒絕；每步限提議一次        |
| 視角過濾 | 遊戲的 `view(state, seat)` + 平台欄位（版本、回合、結果） |

**暗棋的隱藏資訊**：`view()` 對未翻開的棋子只輸出 `{ id, faceUp: false }`。
`games/xiangqi` 的 `CellViewSchema` 用 discriminated union 讓「蓋牌卻帶身分」在型別與執行時都不合法，
並有測試掃描整份快照 JSON 確認不含未翻開棋子的 `kind`。

## 5. 多人連線

詳見 [MULTIPLAYER.md](./MULTIPLAYER.md)。摘要：

- 單一房型 `arena`，`roomId` 即 6 碼房間代碼（以 matchmaker 查詢確保不重複）。
- 客戶端只送**意圖**（`intent` 頻道），伺服器回 `snapshot` / `ack` / `notice`。
- 房間邏輯放在不依賴 Colyseus 的 `RoomController`，便於單元測試；
  `ArenaRoom` 只做網路事件轉接。
- 所有進站訊息經 zod `safeParse`，且 schema 為 `.strict()`，多餘欄位直接拒絕。
- 每個連線有 token bucket（20 容量、10/秒補充）防洗訊息。

## 6. 前端架構

| 層   | 內容                                               | 規則                          |
| ---- | -------------------------------------------------- | ----------------------------- |
| 頁面 | `app/page.tsx`、`app/room/[code]`、`app/local`     | 只負責路由與參數解析          |
| 畫面 | `HomeScreen`、`Lobby`、`GameScreen`、`LocalScreen` | 組合元件、處理 UI 狀態        |
| 連線 | `lib/net/online.ts`（zustand）                     | 唯一與 Colyseus 對話的地方    |
| 互動 | `lib/interaction.ts`                               | 純函式：點擊 → 選取／送出意圖 |
| 呈現 | `@xiangqi-arena/game-renderer`                     | 只認 `BoardModel`，不知道規則 |

`GameScreen` 同時服務線上與本機模式：兩者都提供 `RoomSnapshot` 與 `send(intent)`，
差別只在 `variant` 與連線狀態。

棋盤選擇邏輯：`quality === '2d'` 或偵測不到 WebGL → `Board2D`；
3D 載入失敗時由 error boundary 退回 2D 並提示使用者。

## 7. 資料庫

見 `supabase/migrations/`。重點：

- 訪客只存 `sha256('xiangqi-arena:' + token)`，原始 token 僅在瀏覽器 localStorage。
- 所有資料表啟用 RLS，寫入一律經遊戲伺服器的 Service Role Key。
- `game_moves` 不開放任何 anon/authenticated policy。
- `player_statistics` 由 `game_players` 的 after insert 觸發器維護。

## 8. 技術選型評估

| 項目                         | 採用            | 理由 / 替代方案                                                                                                                                                                                 |
| ---------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 16（App Router）     | ✅              | 規格指定；SSR 對大廳頁有幫助，對戰頁為純 client                                                                                                                                                 |
| React 19 + TypeScript strict | ✅              | 規格指定                                                                                                                                                                                        |
| Tailwind CSS 4               | ✅              | CSS-first 設定（`@theme`），不需 tailwind.config                                                                                                                                                |
| shadcn/ui                    | 部分            | 採其設計慣例與 `components.json`，但只手寫實際用到的元件（button/card/badge/input/dialog/segmented），避免為了 6 個元件引入 Radix 全家桶。需要 Popover、Tooltip 等複雜元件時再 `npx shadcn add` |
| Three.js + R3F + drei        | ✅              | 規格指定；drei 只用 `Environment`、`Lightformer`、`ContactShadows`                                                                                                                              |
| 貼圖                         | Canvas 程序生成 | 木紋、棋子文字、玉石背面全部在瀏覽器即時繪製：零下載、零授權問題、可依畫質調整解析度                                                                                                            |
| Zustand                      | ✅              | 連線狀態與設定；棋局狀態來自伺服器快照，不需額外狀態管理                                                                                                                                        |
| Colyseus 0.18                | ✅              | Server Authoritative、房間生命週期、`allowReconnection` 開箱即用                                                                                                                                |
| Colyseus Schema              | ❌ 未使用       | 本遊戲每步狀態很小（< 2KB）且需要**依座位過濾**暗棋資訊；直接送 JSON 快照更簡單安全。若未來要做即時動作同步再導入                                                                               |
| zod 4                        | ✅              | 執行時驗證；`.strict()` 擋多餘欄位                                                                                                                                                              |
| Vitest + Playwright          | ✅              | 規格指定                                                                                                                                                                                        |
| 音效                         | WebAudio 合成   | 不需音檔、無授權問題、體積為零                                                                                                                                                                  |

## 9. 已知取捨

1. **沒有用 Colyseus Schema 的增量同步**：每次操作送完整快照（約 1～3KB）。
   回合制遊戲一局最多百餘次，流量可忽略，換來的是隱藏資訊過濾的簡單與安全。
2. **棋子貼圖即時產生**：首次進房需繪製 14 張棋子貼圖（約 50～150ms），已做快取。
   若要再加速，可改為預先產生 sprite sheet。
3. **長捉判定為簡化版**：見 [GAME_RULES.md §2.6](./GAME_RULES.md) 的限制說明。
4. **房間狀態只在單一伺服器行程記憶體**：伺服器重啟 = 所有房間消失。
   多行程部署需加上 Redis presence/driver（見 MULTIPLAYER.md §8）。
