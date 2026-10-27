-- 個人遊戲室：把對局資料從 public 搬到 game_room schema，並改成多遊戲通用的結構。
-- 設計說明見 docs/ARCHITECTURE.md §7。
--
-- 變更摘要
--   public.profiles          → game_room.profiles
--   public.game_sessions     → game_room.matches        （mode enum → game_id + mode 文字）
--   public.game_players      → game_room.match_players  （side → seat_label，座位不再限 0/1）
--   public.game_moves        → game_room.match_actions  （ply → seq）
--   public.player_statistics → game_room.player_statistics（以 game_id + mode 分組）
--   public.game_mode enum    → 移除
--
-- 既有資料完整保留（以 alter ... set schema 搬移，不重建）。
-- 套用後還需要在 Supabase Dashboard → Project Settings → Data API → Exposed schemas 加入 game_room。

begin;

create schema if not exists game_room;

-- ---------------------------------------------------------------------------
-- 1. 搬移資料表與型別
-- ---------------------------------------------------------------------------
alter table public.profiles set schema game_room;
alter table public.game_sessions set schema game_room;
alter table public.game_players set schema game_room;
alter table public.game_moves set schema game_room;
alter table public.player_statistics set schema game_room;
alter type public.game_result set schema game_room;
alter type public.player_result set schema game_room;

alter table game_room.game_sessions rename to matches;
alter table game_room.game_players rename to match_players;
alter table game_room.game_moves rename to match_actions;

alter index game_room.game_sessions_room_code_idx rename to matches_room_code_idx;
alter index game_room.game_sessions_started_at_idx rename to matches_started_at_idx;
alter index game_room.game_players_profile_idx rename to match_players_profile_idx;

-- 舊觸發器與函式依賴 game_mode enum，先移除，最後以新結構重建
drop trigger if exists game_players_statistics on game_room.match_players;
drop function if exists public.apply_player_statistics();

-- ---------------------------------------------------------------------------
-- 2. matches：game_id + mode
-- ---------------------------------------------------------------------------
alter table game_room.matches add column game_id text;
alter table game_room.matches alter column mode type text
  using (case mode::text when 'xiangqi' then 'classic' else mode::text end);
update game_room.matches set game_id = 'xiangqi' where game_id is null;
alter table game_room.matches alter column game_id set not null;
alter table game_room.matches add constraint matches_game_id_format
  check (game_id ~ '^[a-z0-9][a-z0-9-]{0,31}$');
alter table game_room.matches add constraint matches_mode_format
  check (mode ~ '^[a-z0-9][a-z0-9-]{0,31}$');

alter table game_room.matches rename column ply_count to action_count;
alter table game_room.matches drop constraint if exists game_sessions_winner_seat_check;
alter table game_room.matches add constraint matches_winner_seat_range
  check (winner_seat between 0 and 63);
alter table game_room.matches rename constraint sessions_winner_consistent to matches_winner_consistent;
alter table game_room.matches rename constraint game_sessions_status_check to matches_status_check;
alter table game_room.matches rename constraint game_sessions_pkey to matches_pkey;

create index if not exists matches_game_idx on game_room.matches (game_id, mode, started_at desc);

-- ---------------------------------------------------------------------------
-- 3. match_players：座位數由遊戲決定；陣營改為通用的 seat_label；多人遊戲可記名次
-- ---------------------------------------------------------------------------
alter table game_room.match_players rename column session_id to match_id;
alter table game_room.match_players drop constraint if exists game_players_seat_check;
alter table game_room.match_players add constraint match_players_seat_range
  check (seat between 0 and 63);
alter table game_room.match_players drop constraint if exists game_players_side_check;
alter table game_room.match_players rename column side to seat_label;
alter table game_room.match_players add constraint match_players_seat_label_length
  check (char_length(seat_label) <= 32);
alter table game_room.match_players add column placement smallint
  check (placement between 1 and 64);
alter table game_room.match_players rename constraint game_players_pkey to match_players_pkey;
alter table game_room.match_players rename constraint game_players_session_id_fkey to match_players_match_id_fkey;
alter table game_room.match_players rename constraint game_players_profile_id_fkey to match_players_profile_id_fkey;

-- ---------------------------------------------------------------------------
-- 4. match_actions：通用動作紀錄（棋步、出牌、打牌……）
-- ---------------------------------------------------------------------------
alter table game_room.match_actions rename column session_id to match_id;
alter table game_room.match_actions rename column ply to seq;
alter table game_room.match_actions drop constraint if exists game_moves_seat_check;
alter table game_room.match_actions add constraint match_actions_seat_range
  check (seat between 0 and 63);
alter table game_room.match_actions rename constraint game_moves_pkey to match_actions_pkey;
alter table game_room.match_actions rename constraint game_moves_session_id_fkey to match_actions_match_id_fkey;

-- ---------------------------------------------------------------------------
-- 5. player_statistics：以 (profile, game_id, mode) 分組
-- ---------------------------------------------------------------------------
alter table game_room.player_statistics add column game_id text;
alter table game_room.player_statistics alter column mode type text
  using (case mode::text when 'xiangqi' then 'classic' else mode::text end);
update game_room.player_statistics set game_id = 'xiangqi' where game_id is null;
alter table game_room.player_statistics alter column game_id set not null;
alter table game_room.player_statistics drop constraint player_statistics_pkey;
alter table game_room.player_statistics add constraint player_statistics_pkey
  primary key (profile_id, game_id, mode);

drop type public.game_mode;

create or replace function game_room.apply_player_statistics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m_game_id text;
  m_mode text;
begin
  if new.profile_id is null or new.result is null then
    return new;
  end if;
  select game_id, mode into m_game_id, m_mode from game_room.matches where id = new.match_id;
  if m_game_id is null then
    return new;
  end if;
  insert into game_room.player_statistics (profile_id, game_id, mode, games, wins, losses, draws)
  values (
    new.profile_id,
    m_game_id,
    m_mode,
    1,
    case when new.result = 'win' then 1 else 0 end,
    case when new.result = 'loss' then 1 else 0 end,
    case when new.result = 'draw' then 1 else 0 end
  )
  on conflict (profile_id, game_id, mode) do update set
    games = game_room.player_statistics.games + 1,
    wins = game_room.player_statistics.wins + excluded.wins,
    losses = game_room.player_statistics.losses + excluded.losses,
    draws = game_room.player_statistics.draws + excluded.draws,
    updated_at = now();
  return new;
end;
$$;

create trigger match_players_statistics
  after insert on game_room.match_players
  for each row execute function game_room.apply_player_statistics();

revoke execute on function game_room.apply_player_statistics() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. 權限：RLS 與 policy 已隨資料表搬移；這裡改名並收斂 grant
-- ---------------------------------------------------------------------------
alter policy sessions_public_read on game_room.matches rename to matches_public_read;

revoke all on all tables in schema game_room from anon, authenticated;
grant usage on schema game_room to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema game_room to service_role;
-- 公開可讀的部分（實際可見的列仍由 RLS policy 決定）
grant select on game_room.matches, game_room.match_players, game_room.player_statistics
  to anon, authenticated;
grant select on game_room.profiles to authenticated;
-- match_actions 不給 anon / authenticated 任何權限

-- 之後在 game_room 新建的資料表不自動開放給 anon / authenticated
alter default privileges for role postgres in schema game_room
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema game_room
  revoke execute on functions from public;

commit;
