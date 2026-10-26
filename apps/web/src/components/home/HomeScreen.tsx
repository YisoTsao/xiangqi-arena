'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DoorOpen, Gamepad2, LogIn, Monitor, Plus, Settings, Swords } from 'lucide-react';
import {
  DEFAULT_TIME_CONTROL,
  TIME_CONTROL_LABELS,
  type GameMode,
  type TimeControlId,
} from '@xiangqi-arena/game-protocol';
import { isRoomCode } from '@xiangqi-arena/shared';
import { Logo } from '../Logo';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Input } from '../ui/input';
import { Segmented } from '../ui/segmented';
import { SettingsDialog } from '../SettingsDialog';
import { cn } from '@/lib/utils';

function ModeCard({
  title,
  subtitle,
  glyph,
  accent,
  onClick,
  testId,
}: {
  title: string;
  subtitle: string;
  glyph: string;
  accent: 'red' | 'jade';
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="group relative overflow-hidden rounded-3xl border border-ink-700 bg-gradient-to-br from-ink-850 to-ink-900 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-gold-400/60 hover:shadow-[0_20px_50px_-20px_rgb(227_181_91/0.45)]"
    >
      <div
        className={cn(
          'mb-4 grid size-14 place-items-center rounded-full font-serif text-2xl font-bold shadow-[inset_0_-3px_0_rgb(0_0_0/0.2)] ring-2 transition-transform group-hover:-translate-y-1 group-hover:rotate-6',
          accent === 'red'
            ? 'bg-gradient-to-br from-[#f7ecd2] to-[#d8bf8c] text-cinnabar-500 ring-cinnabar-500/60'
            : 'bg-gradient-to-br from-jade-400 to-jade-500 text-gold-300 ring-gold-400/50',
        )}
      >
        {glyph}
      </div>
      <div className="font-serif text-xl font-semibold">{title}</div>
      <div className="mt-1 text-sm text-ink-400">{subtitle}</div>
      <Swords className="absolute right-5 top-5 size-5 text-ink-600 transition-colors group-hover:text-gold-400" />
    </button>
  );
}

export function HomeScreen() {
  const router = useRouter();
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<GameMode>('xiangqi');
  const [tc, setTc] = useState<TimeControlId>(DEFAULT_TIME_CONTROL);
  const normalized = code.trim().toUpperCase();

  const create = (m: GameMode, t: TimeControlId = DEFAULT_TIME_CONTROL) =>
    router.push(`/room/new?mode=${m}&tc=${t}`);

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-8 sm:py-14">
      <header className="flex items-center justify-between">
        <Logo size="sm" />
        <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} aria-label="設定">
          <Settings />
        </Button>
      </header>

      <section className="mt-10 flex flex-col items-center text-center sm:mt-16">
        <Logo size="lg" className="animate-rise" />
        <p className="mt-6 max-w-md text-ink-300">
          精緻 2.5D 棋盤，與朋友即時對弈大盤象棋與台灣暗棋。免註冊，建立房間、分享代碼即可開始。
        </p>
        <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
          <Button
            size="xl"
            variant="primary"
            onClick={() => create('xiangqi')}
            data-testid="quick-start"
            className="animate-glow"
          >
            <Gamepad2 /> 開始遊戲
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button
              size="lg"
              variant="secondary"
              onClick={() => setCreateOpen(true)}
              data-testid="create-room"
            >
              <Plus /> 建立房間
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => setJoinOpen(true)}
              data-testid="join-room"
            >
              <LogIn /> 加入房間
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        <ModeCard
          testId="mode-xiangqi"
          title="大盤象棋"
          subtitle="傳統 9×10 棋盤，亞洲規則判定長將長捉"
          glyph="帥"
          accent="red"
          onClick={() => create('xiangqi')}
        />
        <ModeCard
          testId="mode-banqi"
          title="暗棋"
          subtitle="4×8 蓋牌翻棋，台灣常見玩法"
          glyph="？"
          accent="jade"
          onClick={() => create('banqi')}
        />
        <button
          type="button"
          onClick={() => router.push('/local')}
          data-testid="local-play"
          className="group rounded-3xl border border-dashed border-ink-700 p-5 text-left transition-colors hover:border-gold-400/50"
        >
          <div className="mb-4 grid size-14 place-items-center rounded-full bg-ink-800 text-gold-300 ring-1 ring-ink-600">
            <Monitor className="size-6" />
          </div>
          <div className="font-serif text-xl font-semibold">同裝置對戰</div>
          <div className="mt-1 text-sm text-ink-400">不需連線，兩人輪流在同一台裝置下棋</div>
        </button>
      </section>

      <footer className="mt-auto pt-12 text-center text-xs text-ink-400">
        Xiangqi Arena · 開源專案 · 以 Next.js、React Three Fiber 與 Colyseus 打造
      </footer>

      <Dialog open={joinOpen} onClose={() => setJoinOpen(false)} title="加入房間">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (isRoomCode(normalized)) router.push(`/room/${normalized}`);
          }}
        >
          <Input
            autoFocus
            value={code}
            maxLength={6}
            placeholder="輸入 6 碼房間代碼"
            onChange={(e) => setCode(e.target.value)}
            className="text-center font-mono text-2xl tracking-[0.4em] uppercase"
            aria-label="房間代碼"
            data-testid="join-code"
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!isRoomCode(normalized)}
            data-testid="join-submit"
          >
            <DoorOpen /> 加入
          </Button>
        </form>
      </Dialog>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="建立私人房間">
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="text-sm text-ink-300">遊戲模式</span>
            <Segmented<GameMode>
              ariaLabel="遊戲模式"
              value={mode}
              options={[
                { value: 'xiangqi', label: '大盤象棋' },
                { value: 'banqi', label: '暗棋' },
              ]}
              onChange={setMode}
            />
          </div>
          <div className="space-y-2">
            <span className="text-sm text-ink-300">計時</span>
            <Segmented<TimeControlId>
              ariaLabel="計時"
              value={tc}
              options={(Object.keys(TIME_CONTROL_LABELS) as TimeControlId[]).map((v) => ({
                value: v,
                label: TIME_CONTROL_LABELS[v],
              }))}
              onChange={setTc}
            />
          </div>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => create(mode, tc)}
            data-testid="create-submit"
          >
            <Plus /> 建立
          </Button>
        </div>
      </Dialog>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
