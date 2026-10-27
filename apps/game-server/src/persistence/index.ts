import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { FinishedMatchInfo } from '../room/RoomController';
import { logger } from '../logger';

export interface MatchRecorder {
  record(info: FinishedMatchInfo): Promise<void>;
}

export const noopRecorder: MatchRecorder = {
  async record() {
    /* 未設定 Supabase 時不寫入 */
  },
};

/** 訪客 token 只存雜湊，資料庫外洩也無法冒用座位 */
export const hashToken = (token: string): string =>
  createHash('sha256').update(`xiangqi-arena:${token}`).digest('hex');

/** 對局資料位於 game_room schema（需在 Supabase Data API 的 Exposed schemas 中開放） */
export const DB_SCHEMA = 'game_room';

type MatchSummary = ReturnType<FinishedMatchInfo['match']['summary']>;

/** 對局結束時要寫入的三種資料列（不含 id，id 由資料庫產生） */
export function buildMatchRows(info: FinishedMatchInfo, summary: MatchSummary) {
  const outcome = summary.outcome;
  if (!outcome) return null;
  const match = {
    room_code: info.roomCode,
    match_number: info.matchNumber,
    game_id: summary.gameId,
    mode: summary.mode,
    time_control: info.timeControl,
    status: 'finished',
    result: outcome.type === 'draw' ? 'draw' : 'win',
    winner_seat: outcome.type === 'win' ? outcome.winner : null,
    end_reason: outcome.reason,
    started_at: new Date(summary.startedAt).toISOString(),
    ended_at: new Date(summary.endedAt ?? Date.now()).toISOString(),
    action_count: summary.moves.length,
  };
  const players = info.players.map((p, seat) => ({
    seat,
    display_name: p.name,
    seat_label: summary.seatLabels[seat] ?? null,
    result: outcome.type === 'draw' ? 'draw' : outcome.winner === seat ? 'win' : 'loss',
  }));
  const actions = summary.moves.map((m) => ({
    seq: m.ply,
    seat: m.seat,
    action: m.action,
    notation: m.notation,
    think_ms: m.thinkMs,
    played_at: new Date(m.at).toISOString(),
  }));
  return { match, players, actions };
}

/**
 * 使用 Service Role Key 寫入對局紀錄。此金鑰只存在遊戲伺服器環境變數，
 * 絕不可出現在前端或 NEXT_PUBLIC_* 變數中。
 */
export function createSupabaseRecorder(url: string, serviceRoleKey: string): MatchRecorder {
  const client: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const db = client.schema(DB_SCHEMA);

  async function profileId(token: string, name: string): Promise<string> {
    const { data, error } = await db
      .from('profiles')
      .upsert(
        { guest_key_hash: hashToken(token), display_name: name },
        { onConflict: 'guest_key_hash' },
      )
      .select('id')
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  return {
    async record(info) {
      const rows = buildMatchRows(info, info.match.summary());
      if (!rows) return;
      try {
        const ids = await Promise.all(info.players.map((p) => profileId(p.token, p.name)));
        const { data: match, error } = await db
          .from('matches')
          .insert(rows.match)
          .select('id')
          .single();
        if (error) throw error;
        const matchId = (match as { id: string }).id;
        const { error: pErr } = await db
          .from('match_players')
          .insert(rows.players.map((p) => ({ ...p, match_id: matchId, profile_id: ids[p.seat] })));
        if (pErr) throw pErr;
        if (rows.actions.length > 0) {
          const { error: aErr } = await db
            .from('match_actions')
            .insert(rows.actions.map((a) => ({ ...a, match_id: matchId })));
          if (aErr) throw aErr;
        }
        logger.info({ matchId, room: info.roomCode }, 'match recorded');
      } catch (e) {
        logger.error(
          { room: info.roomCode, error: String((e as Error)?.message ?? e) },
          'record failed',
        );
      }
    },
  };
}
