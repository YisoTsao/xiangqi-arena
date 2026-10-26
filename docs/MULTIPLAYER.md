# 多人連線文件

> 版本 0.1 · 最後更新 2026-10-26

## 1. 架構

Colyseus 0.18，單一房型 `arena`，`roomId` 即 6 碼房間代碼。
**Server Authoritative**：客戶端只送意圖，伺服器驗證後廣播結果。

```
apps/game-server/src/
├── index.ts                 進入點：讀環境變數、組裝持久化
├── server.ts                defineServer、CORS、/healthz
├── config.ts                環境變數
├── room/ArenaRoom.ts        Colyseus 房間（只做網路事件轉接）
├── room/RoomController.ts   房間邏輯（不依賴 Colyseus，可單元測試）
├── room/rateLimit.ts        token bucket
└── persistence/index.ts     Supabase 寫入（選配）
```

## 2. 訊息協定

全部定義於 `packages/game-protocol`，型別與 zod schema 同源。

### 加入房間（`onAuth` 驗證）

```ts
{
  protocol: 1,
  playerToken: string,   // 16–64 字元，URL-safe；只有該瀏覽器知道
  name: string,          // 1–16 字元，不含控制字元與角括號
  mode?: 'xiangqi' | 'banqi',
  timeControl?: TimeControlId,
}
```

### 客戶端 → 伺服器（頻道 `intent`）

| type          | 欄位                                    | 說明                         |
| ------------- | --------------------------------------- | ---------------------------- |
| `setReady`    | `ready`                                 | 大廳準備狀態                 |
| `configure`   | `mode`, `timeControl`                   | 僅房主                       |
| `start`       | —                                       | 僅房主，且雙方皆已準備       |
| `action`      | `actionId`, `expectedVersion`, `action` | 走棋或翻棋                   |
| `resign`      | `actionId`                              | 認輸                         |
| `offerDraw`   | `actionId`                              | 提議和棋                     |
| `respondDraw` | `actionId`, `accept`                    | 回應和棋                     |
| `rematch`     | `actionId`                              | 再來一局（雙方皆同意才開始） |
| `sync`        | —                                       | 要求重送快照                 |

所有 schema 都是 `.strict()`，多餘欄位（例如企圖夾帶 `seat`）一律拒絕。

### 伺服器 → 客戶端

| 頻道       | 內容                                                  |
| ---------- | ----------------------------------------------------- |
| `snapshot` | `RoomSnapshot`：房間 + 棋局的完整狀態（已依座位過濾） |
| `ack`      | `{ actionId, intent, ok, error? }`                    |
| `notice`   | 對手加入／離開／斷線／提議和棋／要求再來一局          |

## 3. 伺服器驗證項目

| #   | 驗證                       | 失敗回傳                         |
| --- | -------------------------- | -------------------------------- |
| 1   | 訊息格式（zod strict）     | `INVALID_MESSAGE`                |
| 2   | 傳送頻率（20 容量、10/秒） | `RATE_LIMITED`                   |
| 3   | 是否為此房間的玩家         | `NOT_SEATED`                     |
| 4   | 是否為房主（設定／開始）   | `NOT_HOST`                       |
| 5   | 對局是否進行中             | `GAME_NOT_ACTIVE`                |
| 6   | 是否輪到此玩家             | `NOT_YOUR_TURN`                  |
| 7   | 棋局版本是否為最新         | `STALE_VERSION`                  |
| 8   | `actionId` 是否重複        | `DUPLICATE`                      |
| 9   | 是否操作對手棋子           | `NOT_YOUR_PIECE`                 |
| 10  | 走法／翻棋是否合法         | `ILLEGAL_ACTION` / `CANNOT_FLIP` |

**棋局版本**：每次成功操作 `version++`。客戶端送出時附上 `expectedVersion`，
不符即拒絕 —— 兩位玩家同時送出時只有先到的那個會成功，後到的收到 `STALE_VERSION`
並自動重新同步。

## 4. 座位與身分

- 座位由 `playerToken` 認定，不是連線 id。
- 重新整理頁面、換分頁、斷線重連都用同一個 token 回到原座位。
- 同一 token 的新連線會**取代**舊連線，舊連線收到 `replacedByNewConnection` 並被請離，
  避免同一人開兩個視窗造成混亂。
- 房間滿（兩個座位都有人）時，第三位玩家的 `onAuth` 直接以 `ROOM_FULL` 拒絕，
  永遠不會占用座位。

## 5. 斷線與重連

三層保護：

1. **Colyseus SDK 自動重連**：網路短暫中斷時由 SDK 重建連線。
2. **`allowReconnection(client, 60)`**：伺服器保留 session 60 秒。
3. **以 token 重新加入**：前述兩者都失敗時，前端以指數退避
   （0.5s → 8s，最多 6 次）用同一個 token `joinById`，伺服器認出 token 後還原座位。

對局中斷線：

- 立即廣播 `playerDisconnected`，對手看到「離線」標籤。
- 快照帶 `abandonDeadlineMs`，對手看到倒數。
- 90 秒未回 → 判負（`abandon`）。
- 大廳中斷線 5 分鐘 → 釋放座位，房主轉移給另一位玩家。

重連後收到完整快照，包含棋局、座位、回合、剩餘時間與最後一步（供提示動畫）。

## 6. 房間生命週期

```
onCreate → 產生不重複的 6 碼代碼（以 matchMaker.query 檢查）
         → autoDispose = false（避免玩家都斷線時立刻銷毀）
         → 每 250ms tick：超時判定、斷線判負、座位釋放
所有玩家離線超過 10 分鐘 → disconnect() 銷毀房間
```

## 7. 對局流程

```
lobby ──(雙方 ready + 房主 start)──▶ playing ──(將死/認輸/超時/和棋)──▶ ended
  ▲                                                                      │
  └──────────────(房主改設定)──────────────┬──(雙方 rematch)──────────────┘
                                          ▼
                                       playing（交換紅黑／先後手）
```

## 8. 部署注意事項

- **絕對不要把 Colyseus 房間部署成一般 Vercel Serverless Function**：
  房間是有狀態的長連線行程，Serverless 的無狀態與執行時間限制會讓房間在對局中消失。
- 目前房間狀態只存在單一行程的記憶體中。要水平擴充需加上：
  - `RedisPresence` 與 `RedisDriver`（Colyseus 內建）
  - 或以 sticky session 把同一房間的玩家導到同一個行程
- 正式環境務必設定 `CORS_ORIGINS`，限制 matchmaking HTTP API 的來源。

## 9. 測試

| 層級 | 檔案                                               | 涵蓋                                                                                   |
| ---- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 單元 | `apps/game-server/test/RoomController.test.ts`     | 座位、第三人、準備、設定、權限、超時、斷線判負、和棋、再來一局、速率限制、暗棋隱藏資訊 |
| 整合 | `apps/game-server/test/server.integration.test.ts` | 真實 WebSocket：建房、加入、第三人被拒、非法參數、走棋同步、重新整理回座               |
| 對局 | `packages/game-match/src/match.test.ts`            | 版本、重複封包、同時送出、計時、認輸、和棋、視角過濾                                   |
| E2E  | `apps/web/e2e/arena.spec.ts`                       | 兩個瀏覽器 context 完整對局（桌面 + 手機）                                             |
