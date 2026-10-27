# Xiangqi Arena 象棋競技場

精緻的 **2.5D 線上雙人象棋競技場**，支援傳統大盤象棋與台灣暗棋，
免註冊、傳一個房間代碼給朋友就能開始對弈。桌面與手機瀏覽器皆可遊玩。

## 特色

- **2.5D 立體棋盤**：Three.js 呈現的木質棋盤與帶倒角、雕刻文字的立體棋子；
  木紋與棋子貼圖全部由程式即時產生，不下載任何圖檔。
- **規則正確**：象棋含馬腳、象眼、將帥照面、將死、困斃、長將長捉（亞洲規則）、
  自然限著；暗棋採台灣常見玩法且規則可配置。全部有單元測試。
- **大老二**：四人線上房間（台灣規則），也能和三位電腦玩家練習。
- **伺服器權威**：Colyseus Server Authoritative，前端不決定任何合法性與勝負；
  暗棋未翻開的棋子身分只存在伺服器。
- **連線韌性**：自動重連、重新整理頁面回到原座位與原棋局、斷線倒數判負。
- **到處都能玩**：WebGL 不可用時自動切換 2D SVG 棋盤；可選畫質與動畫強度。

## 快速開始

```bash
pnpm install
pnpm dev          # Next.js :3000 + 遊戲伺服器 :2567
```

開兩個瀏覽器分頁到 http://localhost:3000，一個建立房間、一個輸入代碼加入。

```bash
pnpm test         # 全部單元與整合測試
pnpm test:e2e     # Playwright E2E（桌面 + 手機）
pnpm typecheck    # 所有套件的 TypeScript 檢查
pnpm build        # 建置前端與遊戲伺服器
```

## 專案結構

```
apps/web            Next.js 16 前端（App Router、React 19、Tailwind 4）
apps/game-server    Colyseus 0.18 遊戲伺服器（Node 22）
packages/
  shared            Result、亂數、洗牌、房間代碼
  game-core         平台契約 GameDefinition、座位、勝負、棋鐘
  game-xiangqi      象棋規則引擎
  game-banqi        暗棋規則引擎（可配置 RuleSet）
  game-protocol     遊戲無關的連線協定（TypeScript 型別 + zod 驗證）
  game-match        泛型對局狀態機（版本、計時、和棋、認輸）
  game-renderer     棋盤呈現（2.5D R3F + 2D SVG）
games/
  xiangqi           象棋遊戲定義（大盤象棋、暗棋兩種模式）
  big-two           大老二（台灣規則，四人）規則、提示與電腦玩家
  mahjong           台灣 16 張麻將規則引擎、台數與電腦玩家（對局畫面尚未完成）
  registry          遊戲註冊表
supabase/           資料結構與 RLS
docs/               文件
```

## 文件

| 文件                                            | 內容                                            |
| ----------------------------------------------- | ----------------------------------------------- |
| [PRD.md](docs/PRD.md)                           | 產品定位、功能範圍、待確認的產品決策            |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)         | 系統架構、技術選型評估與取捨                    |
| [GAME_RULES.md](docs/GAME_RULES.md)             | **選定的規則體系**、完整規則、待確認的規則決策  |
| [ART_BIBLE.md](docs/ART_BIBLE.md)               | 色票、字體、材質、燈光、動畫、效能分級          |
| [CLUB_ART_BIBLE.md](docs/CLUB_ART_BIBLE.md)     | 3D 大廳「暮光遊樂館」的美術規範與 Blender 管線  |
| [ASSET_MANIFEST.md](docs/ASSET_MANIFEST.md)     | 3D 資產來源、授權與驗收登記                     |
| [MULTIPLAYER.md](docs/MULTIPLAYER.md)           | 連線協定、伺服器驗證、斷線重連                  |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md)             | 主機比較（Render / Railway / Fly.io）與部署步驟 |
| [DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) | 各階段任務、依賴與驗收標準                      |

## 環境變數

複製 `.env.example`。重點：

- `NEXT_PUBLIC_GAME_SERVER_URL`：前端連線的遊戲伺服器位址（正式環境用 `wss://`）。
  留空時自動以目前網址的 hostname + 2567 連線，方便用手機在區網測試。
- `CORS_ORIGINS`：遊戲伺服器允許的前端來源，正式環境務必設定。
- `SUPABASE_SERVICE_ROLE_KEY`：**只能放在遊戲伺服器**，絕不可出現在前端。

## 技術選型

Next.js 16 · React 19 · TypeScript (strict) · Tailwind CSS 4 · Three.js + React Three Fiber
· Zustand · Colyseus 0.18 · zod 4 · Supabase · Vitest · Playwright · pnpm

全部使用免費、開源的技術；音效以 WebAudio 即時合成，材質以 Canvas 程序生成，
沒有任何需付費或有授權疑慮的素材。

## 授權

MIT
