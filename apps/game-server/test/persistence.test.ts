import { describe, expect, it } from 'vitest';
import type { AnyMatch } from '@xiangqi-arena/game-match';
import { buildMatchRows, DB_SCHEMA, hashToken } from '../src/persistence';
import type { FinishedMatchInfo } from '../src/room/RoomController';

function info(summary: ReturnType<AnyMatch['summary']>, seats = 2): FinishedMatchInfo {
  return {
    roomCode: 'ABCDEF',
    matchNumber: 2,
    timeControl: 'unlimited',
    players: Array.from({ length: seats }, (_, i) => ({ token: `token-${i}`, name: `P${i}` })),
    match: { summary: () => summary } as unknown as AnyMatch,
  };
}

const base = {
  gameId: 'xiangqi',
  mode: 'banqi',
  startedAt: Date.UTC(2026, 9, 27, 0, 0, 0),
  endedAt: Date.UTC(2026, 9, 27, 0, 5, 0),
  seatLabels: ['red', 'black'],
  moves: [
    {
      ply: 1,
      seat: 0,
      action: { kind: 'flip', square: 3 },
      notation: '翻',
      at: 1000,
      thinkMs: 800,
    },
  ],
};

describe('persistence rows', () => {
  it('writes to the game_room schema and hashes guest tokens', () => {
    expect(DB_SCHEMA).toBe('game_room');
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('maps a finished match to matches / match_players / match_actions rows', () => {
    const summary = { ...base, outcome: { type: 'win' as const, winner: 1, reason: 'resign' } };
    const rows = buildMatchRows(info(summary), summary)!;
    expect(rows.match).toMatchObject({
      room_code: 'ABCDEF',
      match_number: 2,
      game_id: 'xiangqi',
      mode: 'banqi',
      result: 'win',
      winner_seat: 1,
      end_reason: 'resign',
      action_count: 1,
      started_at: '2026-10-27T00:00:00.000Z',
    });
    expect(rows.players).toEqual([
      { seat: 0, display_name: 'P0', seat_label: 'red', result: 'loss' },
      { seat: 1, display_name: 'P1', seat_label: 'black', result: 'win' },
    ]);
    expect(rows.actions[0]).toMatchObject({ seq: 1, seat: 0, think_ms: 800, notation: '翻' });
  });

  it('supports draws and games with more than two seats', () => {
    const summary = {
      ...base,
      gameId: 'big-two',
      mode: 'standard',
      seatLabels: [null, null, null, null],
      moves: [],
      outcome: { type: 'draw' as const, reason: 'agreement' },
    };
    const rows = buildMatchRows(info(summary, 4), summary)!;
    expect(rows.match).toMatchObject({ game_id: 'big-two', result: 'draw', winner_seat: null });
    expect(rows.players.map((p) => p.result)).toEqual(['draw', 'draw', 'draw', 'draw']);
    expect(rows.actions).toEqual([]);
  });

  it('skips unfinished matches', () => {
    const summary = { ...base, outcome: null };
    expect(buildMatchRows(info(summary), summary)).toBeNull();
  });
});
