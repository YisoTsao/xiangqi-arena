# Supabase

## 套用資料結構

```bash
# 方式一：Supabase CLI
supabase link --project-ref <your-project-ref>
supabase db push

# 方式二：在 Supabase Dashboard → SQL Editor 貼上
# migrations/20261026000000_initial_schema.sql 的內容並執行
```

## 環境變數

遊戲伺服器（`apps/game-server`）設定下列變數後，才會把對局結果寫入資料庫；
未設定時遊戲仍可正常遊玩，只是不保存戰績。

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

> **Service Role Key 只能放在遊戲伺服器。**
> 絕對不要放進 `apps/web` 或任何 `NEXT_PUBLIC_*` 變數，否則會外流到瀏覽器。

## 安全設計

- 所有資料表都啟用 RLS，預設拒絕寫入；寫入一律經由遊戲伺服器的 Service Role。
- 訪客身分只保存 `sha256('xiangqi-arena:' + token)`，原始 token 僅存在玩家瀏覽器。
- `game_moves` 不開放任何 anon/authenticated policy。
