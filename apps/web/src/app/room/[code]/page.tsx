import type { Metadata } from 'next';
import { TimeControlIdSchema } from '@xiangqi-arena/game-protocol';
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
  const mode = parseXiangqiMode(query.mode);
  const tc = TimeControlIdSchema.safeParse(query.tc);
  return (
    <RoomScreen
      key={code.toUpperCase()}
      code={code.toUpperCase()}
      createMode={mode ?? undefined}
      createTimeControl={tc.success ? tc.data : undefined}
    />
  );
}
