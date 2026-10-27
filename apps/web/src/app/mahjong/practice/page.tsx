import type { Metadata } from 'next';
import { MahjongPracticeScreen } from '@/components/mahjong/MahjongPracticeScreen';

export const metadata: Metadata = { title: '麻將練習' };

export default function Page() {
  return <MahjongPracticeScreen />;
}
