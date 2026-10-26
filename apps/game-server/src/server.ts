import { createEndpoint, createRouter, defineRoom, defineServer, matchMaker } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ArenaRoom, arenaRoomDeps, type ArenaRoomDeps } from './room/ArenaRoom';

export const ROOM_NAME = 'arena';

export function createGameServer(options: { corsOrigins: string[]; deps?: ArenaRoomDeps }) {
  Object.assign(arenaRoomDeps, options.deps ?? {});

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
    rooms: { [ROOM_NAME]: defineRoom(ArenaRoom) },
    routes: createRouter({
      health: createEndpoint('/healthz', { method: 'GET' }, async () => ({
        ok: true,
        uptime: Math.round(process.uptime()),
      })),
    }),
  });
}
