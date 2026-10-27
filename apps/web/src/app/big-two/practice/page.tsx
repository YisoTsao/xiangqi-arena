import type { Metadata } from 'next';
import { BigTwoPracticeScreen } from '@/components/bigtwo/BigTwoPracticeScreen';

export const metadata: Metadata = { title: '大老二練習' };

export default function Page() {
  return <BigTwoPracticeScreen />;
}
