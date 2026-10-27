import type { Metadata } from 'next';
import { GameIdSchema, ModeIdSchema, TimeControlIdSchema } from '@xiangqi-arena/game-protocol';
import { parseXiangqiMode } from '@xiangqi-arena/games-xiangqi';
import { RoomScreen } from '@/components/room/RoomScreen';

export const metadata: Metadata = { title: '房間' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const game = GameIdSchema.safeParse(query.game);
  const gameId = game.success ? game.data : 'xiangqi';
  // 舊網址只有 mode（象棋）；其他遊戲的模式交給伺服器驗證，不合法時用預設模式
  const rawMode = ModeIdSchema.safeParse(query.mode);
  const mode =
    gameId === 'xiangqi' ? parseXiangqiMode(query.mode) : rawMode.success ? rawMode.data : null;
  const tc = TimeControlIdSchema.safeParse(query.tc);
  return (
    <RoomScreen
      key={code.toUpperCase()}
      code={code.toUpperCase()}
      createGame={gameId}
      createMode={mode ?? undefined}
      createTimeControl={tc.success ? tc.data : undefined}
    />
  );
}
