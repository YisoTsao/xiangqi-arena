'use client';

import { useState } from 'react';
import { Check, Copy, Crown, LogOut, Play, Wifi, WifiOff } from 'lucide-react';
import {
  TIME_CONTROL_LABELS,
  type RoomSnapshot,
  type TimeControlId,
} from '@xiangqi-arena/game-protocol';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Segmented } from '../ui/segmented';
import { Logo } from '../Logo';
import type { IntentInput } from '@/lib/controller';
import { GAME_INFO } from '@/lib/games';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const SEAT_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八'];

export function Lobby({
  snapshot,
  send,
  onLeave,
}: {
  snapshot: RoomSnapshot;
  send: (i: IntentInput) => void;
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const you = snapshot.yourSeat;
  const isHost = you !== null && you === snapshot.hostSeat;
  const me = you !== null ? snapshot.seats[you] : null;
  const allReady = snapshot.seats.every((s) => s?.ready);
  const game = GAME_INFO[snapshot.config.gameId];
  const info = game?.modes.find((m) => m.value === snapshot.config.mode);
  const inviteUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/room/${snapshot.roomCode}` : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast('無法複製，請手動複製網址');
    }
  };

  const seatCard = (seat: number) => {
    const s = snapshot.seats[seat];
    return (
      <div
        key={seat}
        className={cn(
          'flex items-center gap-3 rounded-2xl border p-4 transition-colors',
          s ? 'border-ink-600 bg-ink-850' : 'border-dashed border-ink-700 bg-transparent',
          s?.ready && 'border-jade-400/50',
        )}
        data-testid={`seat-${seat}`}
      >
        <div
          className={cn(
            'grid size-11 place-items-center rounded-full font-serif text-lg',
            s ? 'bg-gold-400/15 text-gold-300' : 'bg-ink-800 text-ink-400',
          )}
        >
          {SEAT_NUMERALS[seat]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{s?.name ?? '等待玩家加入…'}</span>
            {snapshot.hostSeat === seat && s && (
              <Crown className="size-4 text-gold-400" aria-label="房主" />
            )}
            {seat === you && <Badge variant="gold">你</Badge>}
          </div>
          {s && (
            <div className="mt-1 flex items-center gap-2 text-xs text-ink-400">
              {s.connected ? (
                <Wifi className="size-3.5 text-jade-400" />
              ) : (
                <WifiOff className="size-3.5 text-cinnabar-400" />
              )}
              {s.connected ? '已連線' : '離線'}
            </div>
          )}
        </div>
        {s && (
          <Badge variant={s.ready ? 'success' : 'default'}>{s.ready ? '已準備' : '未準備'}</Badge>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between">
        <Logo size="sm" />
        <Button variant="ghost" onClick={onLeave} data-testid="room-leave">
          <LogOut /> 離開
        </Button>
      </header>

      <Card className="animate-rise">
        <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
          <span className="text-xs tracking-[0.4em] text-ink-400">房間代碼</span>
          <div
            className="font-mono text-5xl font-bold tracking-[0.25em] text-gold-300"
            data-testid="room-code"
          >
            {snapshot.roomCode}
          </div>
          <Button variant="outline" onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? '已複製邀請連結' : '複製邀請連結'}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">{snapshot.seats.map((_, i) => seatCard(i))}</div>

      <Card>
        <CardHeader>
          <CardTitle>{game ? `${game.name} · 遊戲設定` : '遊戲設定'}</CardTitle>
          {!isHost && <p className="text-xs text-ink-400">由房主選擇模式與時間</p>}
        </CardHeader>
        <CardContent className="space-y-4">
          {game && game.modes.length > 1 && (
            <Segmented<string>
              ariaLabel="遊戲模式"
              value={snapshot.config.mode}
              disabled={!isHost}
              options={game.modes}
              onChange={(mode) =>
                send({ type: 'configure', mode, timeControl: snapshot.config.timeControl })
              }
            />
          )}
          <Segmented<TimeControlId>
            ariaLabel="計時"
            value={snapshot.config.timeControl}
            disabled={!isHost}
            options={(Object.keys(TIME_CONTROL_LABELS) as TimeControlId[]).map((v) => ({
              value: v,
              label: TIME_CONTROL_LABELS[v],
            }))}
            onChange={(timeControl) =>
              send({ type: 'configure', mode: snapshot.config.mode, timeControl })
            }
          />
          <ul className="grid gap-1.5 text-sm text-ink-300 sm:grid-cols-2">
            {info?.rules.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="text-gold-400">◆</span>
                {r}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 grid gap-2 sm:grid-cols-2">
        <Button
          size="lg"
          variant={me?.ready ? 'secondary' : 'outline'}
          onClick={() => send({ type: 'setReady', ready: !me?.ready })}
          data-testid="ready-toggle"
        >
          {me?.ready ? '取消準備' : '準備'}
        </Button>
        <Button
          size="lg"
          variant="primary"
          disabled={!isHost || !allReady}
          onClick={() => send({ type: 'start' })}
          data-testid="start-game"
        >
          <Play />{' '}
          {isHost
            ? allReady
              ? '開始遊戲'
              : snapshot.seats.length > 2
                ? `等待 ${snapshot.seats.length} 位玩家到齊並準備`
                : '等待雙方準備'
            : '等待房主開始'}
        </Button>
      </div>
    </div>
  );
}
