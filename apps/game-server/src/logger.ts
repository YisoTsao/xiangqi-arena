/** 極簡結構化 logger（JSON 行），避免額外相依 */
type Fields = Record<string, unknown>;
const write = (level: string, fields: Fields, msg: string): void => {
  if (process.env.NODE_ENV === 'test') return;
  console.log(JSON.stringify({ level, time: new Date().toISOString(), msg, ...fields }));
};
export const logger = {
  info: (fields: Fields, msg: string) => write('info', fields, msg),
  warn: (fields: Fields, msg: string) => write('warn', fields, msg),
  error: (fields: Fields, msg: string) => write('error', fields, msg),
};
