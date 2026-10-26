'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Play } from 'lucide-react';
import {
  TIME_CONTROL_LABELS,
  type GameMode,
  type TimeControlId,
} from '@xiangqi-arena/game-protocol';
import { GameScreen } from './game/GameScreen';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Segmented } from './ui/segmented';
import { Logo } from './Logo';
import { useLocalGame } from '@/lib/local/localGame';

export function LocalScreen({ initialMode }: { initialMode: GameMode }) {
  const router = useRouter();
  const { snapshot, snapshotAt, start, send, stop } = useLocalGame();
  const [mode, setMode] = useState<GameMode>(initialMode);
  const [tc, setTc] = useState<TimeControlId>('unlimited');
  useEffect(() => () => stop(), [stop]);

  if (snapshot?.game) {
    return (
      <GameScreen
        snapshot={snapshot}
        snapshotAt={snapshotAt}
        send={send}
        variant="local"
        onExit={() => {
          stop();
          router.push('/');
        }}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-5 py-8">
      <header className="flex items-center justify-between">
        <Logo size="sm" />
        <Button variant="ghost" onClick={() => router.push('/')}>
          <ArrowLeft /> 返回
        </Button>
      </header>
      <Card className="animate-rise">
        <CardHeader>
          <CardTitle>同裝置雙人對戰</CardTitle>
          <p className="text-sm text-ink-400">
            兩位玩家輪流在這台裝置上操作。暗棋的蓋牌在本機模式中由瀏覽器洗牌。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Segmented<GameMode>
            ariaLabel="遊戲模式"
            value={mode}
            options={[
              { value: 'xiangqi', label: '大盤象棋' },
              { value: 'banqi', label: '暗棋' },
            ]}
            onChange={setMode}
          />
          <Segmented<TimeControlId>
            ariaLabel="計時"
            value={tc}
            options={(Object.keys(TIME_CONTROL_LABELS) as TimeControlId[]).map((v) => ({
              value: v,
              label: TIME_CONTROL_LABELS[v],
            }))}
            onChange={setTc}
          />
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => start(mode, tc)}
            data-testid="local-start"
          >
            <Play /> 開始
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
