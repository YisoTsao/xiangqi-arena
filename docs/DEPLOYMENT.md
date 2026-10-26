# 部署文件

> 版本 0.1 · 最後更新 2026-10-26
> 價格與方案會變動，部署前請以各平台官方頁面為準。

## 1. 架構拆分

| 元件                           | 性質               | 適合的平台                                  |
| ------------------------------ | ------------------ | ------------------------------------------- |
| `apps/web`（Next.js）          | 無狀態、短請求     | **Vercel**（或 Cloudflare Pages / Netlify） |
| `apps/game-server`（Colyseus） | **有狀態、長連線** | 支援長時間執行 Node 行程的主機              |
| Supabase                       | 託管 PostgreSQL    | Supabase 免費方案                           |

> ⚠️ **不要把 Colyseus 部署成 Vercel Serverless Function。**
> 遊戲房間是存在記憶體中的長連線物件，Serverless 的無狀態模型與執行時間上限
> 會讓房間在對局進行中消失。

## 2. 遊戲伺服器主機比較

| 平台        | 免費方案                                               | 休眠 / 冷啟動                      | 長連線                                                      | 注意事項                                                                |
| ----------- | ------------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Render**  | 有（每月 750 instance 小時）                           | 15 分鐘無流量即休眠，喚醒約 1 分鐘 | ✅ 自 2026-02 起，既有連線上的 WebSocket 訊息會重設閒置計時 | 休眠喚醒期間玩家會看到載入頁；記憶體內的房間在休眠時全部消失            |
| **Railway** | Free 方案 $0（1 vCPU / 0.5GB），另有 30 天 $5 試用額度 | 服務不休眠                         | ✅                                                          | 超出額度後需升級 Hobby（每月最低 $5，含 $5 額度）                       |
| **Fly.io**  | **無免費方案**，新帳號有 2 小時機器執行時間試用        | 可設定 autostop/autostart          | ✅                                                          | `shared-cpu-1x` 256MB 全天候約 $2.19/月，按秒計費；全球節點對延遲最有利 |
| 自架 VPS    | 無                                                     | 無                                 | ✅                                                          | 每月 $4～6，需自行處理 TLS、更新與監控                                  |

**建議**：

- **開發與小規模測試** → Render 免費方案。接受「第一個玩家可能要等一分鐘喚醒」。
- **要穩定可用** → Railway Hobby 或 Fly.io，每月約 $2～5，不休眠。
- **重視延遲** → Fly.io，把機器放在玩家所在區域。

共同限制（各平台皆同）：

- 免費／低價方案通常是共享 CPU，突發流量會被節流。
- 記憶體內的房間在部署、重啟、休眠時全部消失 —— 這是本專案目前的設計限制。
- 流量計費以**對外傳出**為主；本遊戲每局約數十 KB，流量不是瓶頸，連線數才是。

## 3. 部署步驟

### 3.1 遊戲伺服器

**Render（建議，已附 Blueprint）**

1. 登入 [Render](https://dashboard.render.com) → **New → Blueprint** → 選擇本 repo。
   Render 會讀取根目錄的 [`render.yaml`](../render.yaml)，建立 `xiangqi-arena-game-server`（免費方案、新加坡區）。
2. 依提示填入 `CORS_ORIGINS`（前端正式網址，例如 `https://xiangqi-arena.vercel.app`）。
   `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 不記錄戰績可以留空。
3. 部署完成後，網址形如 `https://xiangqi-arena-game-server.onrender.com`；
   前端要填的是 `wss://xiangqi-arena-game-server.onrender.com`。
4. 開啟 `https://…onrender.com/healthz` 應回傳 `{"ok":true,…}`。

**其他平台（手動設定）**

```bash
# 建置
pnpm --filter @xiangqi-arena/game-server build   # 產出 apps/game-server/dist/index.js

# 平台設定
Build Command:  pnpm install --frozen-lockfile && pnpm --filter @xiangqi-arena/game-server build
Start Command:  node apps/game-server/dist/index.js
Health Check:   /healthz
```

環境變數：

```
PORT=                         # 由平台注入
CORS_ORIGINS=https://你的網域  # 逗號分隔；務必設定
SUPABASE_URL=                 # 選配
SUPABASE_SERVICE_ROLE_KEY=    # 選配，只能放這裡
```

### 3.2 前端（Vercel）

```
Framework Preset: Next.js
Root Directory:   apps/web
Install Command:  pnpm install --frozen-lockfile
```

環境變數：

```
NEXT_PUBLIC_GAME_SERVER_URL=wss://your-game-server.example.com
```

正式環境必須是 `wss://`（而非 `ws://`），否則 HTTPS 頁面會因 mixed content 被瀏覽器擋下。

### 3.3 Supabase

見 [`supabase/README.md`](../supabase/README.md)。

## 4. 本機開發

```bash
pnpm install
pnpm dev          # 同時啟動 Next.js (3000) 與遊戲伺服器 (2567)
```

兩個瀏覽器分頁開 http://localhost:3000 即可雙人對戰。
用手機測試時，把 `NEXT_PUBLIC_GAME_SERVER_URL` 留空，前端會自動以目前網址的
hostname + 2567 連線（例如 `ws://192.168.1.20:2567`）。

模擬斷線：在 DevTools → Network 切換 Offline，或直接關閉遊戲伺服器再重新啟動。

## 5. 上線前檢查

- [ ] `CORS_ORIGINS` 已設為正式網域（不是 `*`）
- [ ] 前端使用 `wss://`
- [ ] Service Role Key 不在任何 `NEXT_PUBLIC_*` 變數中
- [ ] 遊戲伺服器的健康檢查指向 `/healthz`
- [ ] `pnpm test` 與 `pnpm test:e2e` 全數通過
- [ ] 已在實機手機上測過一局（含橫豎向切換）
