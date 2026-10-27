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

/**
 * 目前資料表的 mode 欄位仍是舊的 game_mode enum（'xiangqi' | 'banqi'）。
 * 資料庫改成 game_id + mode 之前，只有象棋能寫入。
 */
export function legacyDbMode(gameId: string, mode: string): 'xiangqi' | 'banqi' | null {
  if (gameId !== 'xiangqi') return null;
  if (mode === 'classic') return 'xiangqi';
  if (mode === 'banqi') return 'banqi';
  return null;
}

/**
 * 使用 Service Role Key 寫入對局紀錄。此金鑰只存在遊戲伺服器環境變數，
 * 絕不可出現在前端或 NEXT_PUBLIC_* 變數中。
 */
export function createSupabaseRecorder(url: string, serviceRoleKey: string): MatchRecorder {
  const db: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
      const summary = info.match.summary();
      if (!summary.outcome) return;
      const dbMode = legacyDbMode(summary.gameId, summary.mode);
      if (!dbMode) {
        logger.warn({ room: info.roomCode, game: summary.gameId }, 'game not recordable yet');
        return;
      }
      try {
        const ids = await Promise.all(info.players.map((p) => profileId(p.token, p.name)));
        const outcome = summary.outcome;
        const { data: session, error } = await db
          .from('game_sessions')
          .insert({
            room_code: info.roomCode,
            match_number: info.matchNumber,
            mode: dbMode,
            time_control: info.timeControl,
            status: 'finished',
            result: outcome.type === 'draw' ? 'draw' : 'win',
            winner_seat: outcome.type === 'win' ? outcome.winner : null,
            end_reason: outcome.reason,
            started_at: new Date(summary.startedAt).toISOString(),
            ended_at: new Date(summary.endedAt ?? Date.now()).toISOString(),
            ply_count: summary.moves.length,
          })
          .select('id')
          .single();
        if (error) throw error;
        const sessionId = (session as { id: string }).id;
        const players = info.players.map((p, seat) => ({
          session_id: sessionId,
          seat,
          profile_id: ids[seat],
          display_name: p.name,
          side: summary.seatLabels[seat] ?? null,
          result: outcome.type === 'draw' ? 'draw' : outcome.winner === seat ? 'win' : 'loss',
        }));
        const { error: pErr } = await db.from('game_players').insert(players);
        if (pErr) throw pErr;
        if (summary.moves.length > 0) {
          const { error: mErr } = await db.from('game_moves').insert(
            summary.moves.map((m) => ({
              session_id: sessionId,
              ply: m.ply,
              seat: m.seat,
              action: m.action,
              notation: m.notation,
              think_ms: m.thinkMs,
              played_at: new Date(m.at).toISOString(),
            })),
          );
          if (mErr) throw mErr;
        }
        logger.info({ sessionId, room: info.roomCode }, 'match recorded');
      } catch (e) {
        logger.error(
          { room: info.roomCode, error: String((e as Error)?.message ?? e) },
          'record failed',
        );
      }
    },
  };
}
