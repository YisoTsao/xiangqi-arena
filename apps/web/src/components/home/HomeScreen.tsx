'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Bot,
  DoorOpen,
  Gamepad2,
  LogIn,
  Monitor,
  Plus,
  Settings,
  Swords,
  Users,
} from 'lucide-react';
import {
  DEFAULT_TIME_CONTROL,
  TIME_CONTROL_LABELS,
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
      className="group relative overflow-hidden rounded-2xl border border-wood-500/50 bg-gradient-to-b from-ink-800 to-ink-900 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-gold-400/60 hover:shadow-[0_20px_50px_-20px_rgb(242_181_82/0.45)]"
    >
      <div
        className={cn(
          'mb-3 grid size-12 place-items-center rounded-full font-serif text-xl font-bold shadow-[inset_0_-3px_0_rgb(0_0_0/0.2)] ring-2 transition-transform group-hover:-translate-y-1 group-hover:rotate-6',
          accent === 'red'
            ? 'bg-gradient-to-br from-[#f7ecd2] to-[#d8bf8c] text-cinnabar-500 ring-cinnabar-400/60'
            : 'bg-gradient-to-br from-jade-400 to-jade-500 text-gold-300 ring-gold-400/50',
        )}
      >
        {glyph}
      </div>
      <div className="font-serif text-lg font-semibold">{title}</div>
      <div className="mt-1 text-sm text-ink-400">{subtitle}</div>
      <Swords className="absolute right-4 top-4 size-5 text-ink-600 transition-colors group-hover:text-gold-400" />
    </button>
  );
}

/** 樓層招牌：左邊是霓虹樓層號，右邊是館名，和 3D 外觀上的樓層招牌同一套語言 */
function FloorHeading({ floor, name, note }: { floor: string; name: string; note: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <span className="rounded-md bg-cinnabar-400 px-2 py-0.5 font-serif text-sm font-bold text-cream-200 shadow-[0_0_14px_rgb(233_91_75/0.55)]">
        {floor}
      </span>
      <h2 className="font-serif text-2xl font-bold tracking-wider text-cream-200">{name}</h2>
      <span className="text-sm text-ink-400">{note}</span>
    </div>
  );
}

/** 首頁「建立房間」可選的遊戲：象棋兩種模式 + 大老二 */
type CreateChoice = 'classic' | 'banqi' | 'big-two';

const createUrl = (choice: CreateChoice, tc: TimeControlId) =>
  choice === 'big-two'
    ? `/room/new?game=big-two&mode=standard&tc=${tc}`
    : `/room/new?mode=${choice}&tc=${tc}`;

export function HomeScreen() {
  const router = useRouter();
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<CreateChoice>('classic');
  const [tc, setTc] = useState<TimeControlId>(DEFAULT_TIME_CONTROL);
  const normalized = code.trim().toUpperCase();

  const create = (m: CreateChoice, t: TimeControlId = DEFAULT_TIME_CONTROL) =>
    router.push(createUrl(m, t));

  return (
    <div className="flex min-h-dvh flex-col">
      {/* 場景式首頁：遊樂館夜景（3D 場景的實際算圖）當主視覺 */}
      <section className="relative isolate flex min-h-[560px] flex-col overflow-hidden sm:min-h-[640px]">
        <Image
          src="/club/keyart-night.jpg"
          alt="夜晚的暮光遊樂館街口"
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover object-[42%_50%] sm:object-[62%_88%]"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink-950 via-ink-950/75 to-ink-950/5 sm:via-ink-950/25" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink-950/80 via-ink-950/15 to-transparent" />
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 pt-5">
          <Logo size="sm" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            aria-label="設定"
          >
            <Settings />
          </Button>
        </header>
        {/* 文字靠左貼齊，避開畫面中央的 3D 招牌（和遊樂館開場選單同樣的位置） */}
        <div className="mt-auto w-full px-5 pb-10 sm:px-12 sm:pb-14">
          <div className="max-w-sm animate-rise">
            <div className="text-xs tracking-[0.4em] text-cream-200/80">
              樂町三丁目 · 24 小時營業
            </div>
            <h1 className="mt-2 font-serif text-5xl font-black tracking-wider text-cream-200 drop-shadow-[0_0_18px_rgb(233_91_75/0.65)]">
              暮光<span className="text-cinnabar-400">遊樂館</span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-cream-200/85">
              老街裡燈從不熄的遊戲俱樂部。1F 麻將館已經開門，2F
              牌桌館有象棋、暗棋和大老二。免註冊，建立房間、分享代碼就能和朋友開局。
            </p>
            <div className="mt-6 grid gap-3 sm:w-80">
              <Button
                size="xl"
                variant="primary"
                onClick={() => router.push('/club')}
                data-testid="club-open"
                className="animate-glow"
              >
                <DoorOpen /> 走進遊樂館
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
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-5xl space-y-10 px-5 py-10">
        <section>
          <FloorHeading floor="1F" name="麻將館" note="台灣 16 張・打一將東風圈" />
          <div className="grid overflow-hidden rounded-2xl border border-wood-500/50 bg-gradient-to-b from-ink-800 to-ink-900 sm:grid-cols-[1.3fr_1fr]">
            <div className="relative aspect-[16/9] sm:aspect-auto sm:min-h-[240px]">
              <Image
                src="/club/keyart-hall.jpg"
                alt="1F 麻將館內部"
                fill
                sizes="(min-width: 640px) 560px, 100vw"
                className="object-cover"
              />
            </div>
            <div className="flex flex-col justify-center gap-3 p-5">
              <p className="text-sm leading-relaxed text-ink-300">
                六張木桌、吊燈、茶櫃和老闆阿樂。走進館裡挑一張桌子坐下，和三位電腦牌友打一將。
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="primary" onClick={() => router.push('/club')}>
                  <DoorOpen /> 走進麻將館
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => router.push('/mahjong/practice')}
                  data-testid="mahjong-practice"
                >
                  <Bot /> 直接練習
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section>
          <FloorHeading floor="2F" name="牌桌館" note="和朋友即時對戰" />
          <div className="grid gap-3 sm:grid-cols-3">
            <ModeCard
              testId="mode-xiangqi"
              title="大盤象棋"
              subtitle="傳統 9×10 棋盤，亞洲規則判定長將長捉"
              glyph="帥"
              accent="red"
              onClick={() => create('classic')}
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
              className="group rounded-2xl border border-dashed border-wood-500/60 p-4 text-left transition-colors hover:border-gold-400/50"
            >
              <div className="mb-3 grid size-12 place-items-center rounded-full bg-ink-800 text-gold-300 ring-1 ring-ink-600">
                <Monitor className="size-5" />
              </div>
              <div className="font-serif text-lg font-semibold">同裝置對戰</div>
              <div className="mt-1 text-sm text-ink-400">不需連線，兩人輪流在同一台裝置下棋</div>
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-4 rounded-2xl border border-wood-500/50 bg-gradient-to-b from-ink-800 to-ink-900 p-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#fffdf7] to-[#efe6d2] font-serif text-2xl text-ink-950 shadow-[inset_0_-3px_0_rgb(0_0_0/0.15)] ring-2 ring-gold-400/60">
                ♠
              </div>
              <div>
                <div className="font-serif text-lg font-semibold">大老二</div>
                <div className="mt-1 text-sm text-ink-400">
                  四人撲克，台灣規則：梅花 3 先出，2 最大，先出完的人贏
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:w-72">
              <Button
                variant="primary"
                onClick={() => create('big-two', 'unlimited')}
                data-testid="big-two-room"
              >
                <Users /> 開四人房
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push('/big-two/practice')}
                data-testid="big-two-practice"
              >
                <Bot /> 和電腦練習
              </Button>
            </div>
          </div>
          <Button
            variant="outline"
            size="lg"
            onClick={() => create('classic')}
            data-testid="quick-start"
            className="mt-3 w-full"
          >
            <Gamepad2 /> 馬上開一局象棋
          </Button>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          {[
            { floor: '3F', name: '電玩網咖', tone: 'bg-[#7a4fc0]' },
            { floor: '4F', name: '包廂', tone: 'bg-wood-500' },
          ].map((f) => (
            <div
              key={f.floor}
              className="flex items-center gap-3 rounded-2xl border border-ink-700 bg-ink-900/60 p-4 text-ink-400"
            >
              <span
                className={cn(
                  'rounded-md px-2 py-0.5 font-serif text-sm font-bold text-cream-200',
                  f.tone,
                )}
              >
                {f.floor}
              </span>
              <span className="font-serif text-lg text-ink-300">{f.name}</span>
              <span className="ml-auto text-xs tracking-widest">整修中・敬請期待</span>
            </div>
          ))}
        </section>
      </main>

      <footer className="mt-auto px-5 pb-8 text-center text-xs text-ink-400">
        暮光遊樂館 · Xiangqi Arena 開源專案 · 以 Next.js、React Three Fiber 與 Colyseus 打造
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
            <span className="text-sm text-ink-300">遊戲</span>
            <Segmented<CreateChoice>
              ariaLabel="遊戲"
              value={mode}
              options={[
                { value: 'classic', label: '大盤象棋' },
                { value: 'banqi', label: '暗棋' },
                { value: 'big-two', label: '大老二（四人）' },
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
