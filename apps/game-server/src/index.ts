import { loadConfig } from './config';
import { createSupabaseRecorder, noopRecorder } from './persistence';
import { createGameServer } from './server';
import { logger } from './logger';

const config = loadConfig();
const recorder =
  config.supabaseUrl && config.supabaseServiceRoleKey
    ? createSupabaseRecorder(config.supabaseUrl, config.supabaseServiceRoleKey)
    : noopRecorder;

const server = createGameServer({
  corsOrigins: config.corsOrigins,
  deps: { onMatchFinished: (info) => void recorder.record(info) },
});

await server.listen(config.port);
logger.info(
  { port: config.port, cors: config.corsOrigins, persistence: recorder !== noopRecorder },
  'Xiangqi Arena game server listening',
);
