export interface ServerConfig {
  port: number;
  corsOrigins: string[];
  supabaseUrl: string | null;
  supabaseServiceRoleKey: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 2567),
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    supabaseUrl: env.SUPABASE_URL || null,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || null,
  };
}
