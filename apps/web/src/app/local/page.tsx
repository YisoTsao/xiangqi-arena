import type { Metadata } from 'next';
import { GameModeSchema } from '@xiangqi-arena/game-protocol';
import { LocalScreen } from '@/components/LocalScreen';

export const metadata: Metadata = { title: '同裝置對戰' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const mode = GameModeSchema.safeParse((await searchParams).mode);
  return <LocalScreen initialMode={mode.success ? mode.data : 'xiangqi'} />;
}
