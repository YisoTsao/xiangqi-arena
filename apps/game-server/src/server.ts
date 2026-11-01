import { createEndpoint, createRouter, defineRoom, defineServer, matchMaker } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { CLUB_ROOM_NAME } from '@xiangqi-arena/game-protocol';
import { ArenaRoom, arenaRoomDeps, type ArenaRoomDeps } from './room/ArenaRoom';
import { ClubRoom, clubRoomDeps, type ClubRoomDeps } from './room/ClubRoom';

export const ROOM_NAME = 'arena';

export function createGameServer(options: {
  corsOrigins: string[];
  deps?: ArenaRoomDeps;
  clubDeps?: ClubRoomDeps;
}) {
  Object.assign(arenaRoomDeps, options.deps ?? {});
  Object.assign(clubRoomDeps, options.clubDeps ?? {});

  // 只允許設定的前端來源呼叫 matchmaking HTTP API
  const allowAll = options.corsOrigins.includes('*');
  matchMaker.controller.getCorsHeaders = (headers: Headers) => {
    const origin = headers.get('origin') ?? '';
    const allowed = allowAll || options.corsOrigins.includes(origin);
    return { 'Access-Control-Allow-Origin': allowed ? origin || '*' : 'null', Vary: 'Origin' };
  };

  return defineServer({
    transport: new WebSocketTransport({ maxPayload: 16 * 1024 }),
    greet: false,
    gracefullyShutdown: true,
    rooms: { [ROOM_NAME]: defineRoom(ArenaRoom), [CLUB_ROOM_NAME]: defineRoom(ClubRoom) },
    routes: createRouter({
      health: createEndpoint('/healthz', { method: 'GET' }, async () => ({
        ok: true,
        uptime: Math.round(process.uptime()),
      })),
    }),
  });
}
