import type { Metadata } from 'next';
import { ClubScreen } from '@/components/club/ClubScreen';

export const metadata: Metadata = { title: '暮光遊樂館' };

export default function Page() {
  return <ClubScreen />;
}
