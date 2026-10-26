-- Xiangqi Arena 初始資料結構
-- 說明與設計決策見 docs/ARCHITECTURE.md §7
-- 套用方式：supabase db push，或在 Supabase SQL Editor 執行本檔內容。

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles：玩家。第一階段為匿名訪客（只存 token 雜湊），
-- 第三階段可將 auth_user_id 連到 Supabase Auth 帳號。
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  -- 訪客識別碼的 SHA-256；原始 token 只存在玩家瀏覽器，資料庫不保存
  guest_key_hash text unique,
  display_name text not null check (char_length(display_name) between 1 and 16),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint profiles_identity_present check (auth_user_id is not null or guest_key_hash is not null)
);

-- ---------------------------------------------------------------------------
-- game_sessions：一場對局
-- ---------------------------------------------------------------------------
create type public.game_mode as enum ('xiangqi', 'banqi');
create type public.game_result as enum ('win', 'draw', 'aborted');
create type public.player_result as enum ('win', 'loss', 'draw');

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  match_number integer not null default 1,
  mode public.game_mode not null,
  time_control text not null default 'unlimited',
  status text not null default 'finished' check (status in ('playing', 'finished', 'aborted')),
  result public.game_result,
  winner_seat smallint check (winner_seat in (0, 1)),
  end_reason text,
  ply_count integer not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  -- 分出勝負時必須有勝方座位
  constraint sessions_winner_consistent check (
    (result = 'win' and winner_seat is not null) or (result is distinct from 'win' and winner_seat is null)
  )
);
create index if not exists game_sessions_room_code_idx on public.game_sessions (room_code, started_at desc);
create index if not exists game_sessions_started_at_idx on public.game_sessions (started_at desc);

-- ---------------------------------------------------------------------------
-- game_players：對局中的兩個座位
-- ---------------------------------------------------------------------------
create table if not exists public.game_players (
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  seat smallint not null check (seat in (0, 1)),
  profile_id uuid references public.profiles (id) on delete set null,
  display_name text not null,
  side text check (side in ('red', 'black')),
  result public.player_result,
  primary key (session_id, seat)
);
create index if not exists game_players_profile_idx on public.game_players (profile_id, session_id);

-- ---------------------------------------------------------------------------
-- game_moves：棋步紀錄（可用於重播與分析）
-- action 為 JSON：{"kind":"move","from":25,"to":22} 或 {"kind":"flip","square":7}
-- ---------------------------------------------------------------------------
create table if not exists public.game_moves (
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  ply integer not null,
  seat smallint not null check (seat in (0, 1)),
  action jsonb not null,
  notation text not null,
  think_ms integer not null default 0,
  played_at timestamptz not null default now(),
  primary key (session_id, ply)
);

-- ---------------------------------------------------------------------------
-- player_statistics：勝率與場次（由觸發器維護）
-- ---------------------------------------------------------------------------
create table if not exists public.player_statistics (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  mode public.game_mode not null,
  games integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (profile_id, mode)
);

create or replace function public.apply_player_statistics()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  session_mode public.game_mode;
begin
  if new.profile_id is null or new.result is null then
    return new;
  end if;
  select mode into session_mode from public.game_sessions where id = new.session_id;
  if session_mode is null then
    return new;
  end if;
  insert into public.player_statistics (profile_id, mode, games, wins, losses, draws)
  values (
    new.profile_id,
    session_mode,
    1,
    case when new.result = 'win' then 1 else 0 end,
    case when new.result = 'loss' then 1 else 0 end,
    case when new.result = 'draw' then 1 else 0 end
  )
  on conflict (profile_id, mode) do update set
    games = public.player_statistics.games + 1,
    wins = public.player_statistics.wins + excluded.wins,
    losses = public.player_statistics.losses + excluded.losses,
    draws = public.player_statistics.draws + excluded.draws,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists game_players_statistics on public.game_players;
create trigger game_players_statistics
  after insert on public.game_players
  for each row execute function public.apply_player_statistics();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- 遊戲伺服器使用 Service Role Key（繞過 RLS）寫入；瀏覽器只會用
-- publishable key 讀取彙總資料，因此預設拒絕所有寫入。
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_players enable row level security;
alter table public.game_moves enable row level security;
alter table public.player_statistics enable row level security;

-- 已登入玩家可讀自己的 profile（第三階段帳號功能用）
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated using (auth_user_id = auth.uid());

-- 對局結果與統計公開可讀（排行榜），但不開放棋步明細與 profile 列表
drop policy if exists sessions_public_read on public.game_sessions;
create policy sessions_public_read on public.game_sessions
  for select to anon, authenticated using (status = 'finished');

drop policy if exists players_public_read on public.game_players;
create policy players_public_read on public.game_players
  for select to anon, authenticated using (true);

drop policy if exists statistics_public_read on public.player_statistics;
create policy statistics_public_read on public.player_statistics
  for select to anon, authenticated using (true);

-- game_moves 不建立任何 policy：僅 Service Role 可存取。
