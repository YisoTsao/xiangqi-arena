import type { Metadata } from 'next';
import { parseXiangqiMode } from '@xiangqi-arena/games-xiangqi';
import { LocalScreen } from '@/components/LocalScreen';

export const metadata: Metadata = { title: '同裝置對戰' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const mode = parseXiangqiMode((await searchParams).mode);
  return <LocalScreen initialMode={mode ?? 'classic'} />;
}
