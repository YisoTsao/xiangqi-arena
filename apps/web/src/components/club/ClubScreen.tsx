'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { CloudRain, DoorOpen, Footprints, LogOut, Navigation, Sun } from 'lucide-react';
import { isWebGLAvailable, recommendedQuality } from '@xiangqi-arena/game-renderer';
import { MahjongPracticeScreen } from '../mahjong/MahjongPracticeScreen';
import { Button } from '../ui/button';
import { DAY_PHASE_LABELS, dayPhaseOf, formatGameTime, gameHourAt } from './clock';
import { INTERACTABLES, type Interactable } from './layout';
import { player, useClub, walkToNearestTable } from './store';
import { useSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';

const ClubScene = dynamic(() => import('./ClubScene').then((m) => m.ClubScene), {
  ssr: false,
});

const A_LE_LINES = [
  '歡迎光臨！桌子都空著，挑一張坐吧。',
  '今天手氣怎麼樣？先喝杯烏龍再上桌。',
  '樓上牌桌館還在整修，過陣子就開了。',
  '打牌別急，聽牌了再來跟我炫耀。',
  '晚上最熱鬧，霓虹一亮客人就上門囉。',
];

/** 遊戲時間：每 5 秒更新一次（網址加 ?hour=20 可固定時間，方便看夜景） */
function useGameHour(override: number | undefined): number | null {
  // 伺服器端不知道時間：掛載後才開始算，避免 hydration 不一致
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    if (override !== undefined) {
      setHour(override);
      return;
    }
    const tick = () => setHour(gameHourAt(Date.now()));
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [override]);
  return hour;
}

function readHourOverride(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = new URLSearchParams(window.location.search).get('hour');
  if (raw === null) return undefined;
  const h = Number(raw);
  return Number.isFinite(h) && h >= 0 && h < 24 ? h : undefined;
}

function Clock({ hour }: { hour: number | null }) {
  if (hour === null) return null;
  return (
    <div
      data-testid="club-clock"
      className="rounded-full border border-white/15 bg-[#24344D]/75 px-3 py-1 font-mono text-xs text-[#F2DAB6] backdrop-blur"
    >
      {formatGameTime(hour)} · {DAY_PHASE_LABELS[dayPhaseOf(hour)]}
    </div>
  );
}

/** 晴雨切換：下雨時街面濕亮、倒映霓虹 */
function WeatherToggle() {
  const weather = useClub((s) => s.weather);
  const rain = weather === 'rain';
  return (
    <button
      type="button"
      data-testid="club-weather"
      aria-pressed={rain}
      onClick={() => useClub.getState().setWeather(rain ? 'clear' : 'rain')}
      className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/15 bg-[#24344D]/75 px-3 py-1 text-xs text-[#F2DAB6] backdrop-blur hover:bg-[#24344D]"
    >
      {rain ? <CloudRain className="size-3.5" /> : <Sun className="size-3.5" />}
      {rain ? '雨天' : '晴天'}
    </button>
  );
}

function TitleMenu({ hour, onEnter }: { hour: number | null; onEnter: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-[#141018]/85 via-[#141018]/20 to-transparent p-6 pb-10 sm:justify-center sm:bg-gradient-to-r sm:p-12">
      <div className="pointer-events-auto max-w-sm animate-rise">
        <div className="text-xs tracking-[0.4em] text-[#F2DAB6]/80">樂町三丁目 · 24 小時營業</div>
        <h1 className="mt-2 font-serif text-5xl font-black tracking-wider text-[#F2DAB6] drop-shadow-[0_0_18px_rgb(233_91_75/0.65)] sm:text-6xl">
          暮光<span className="text-[#E95B4B]">遊樂館</span>
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#F2DAB6]/80">
          藏在老街裡、燈從不熄的遊戲俱樂部。1F 麻將館已經開門，找張桌子坐下來吧。
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Clock hour={hour} />
          <WeatherToggle />
        </div>
        <div className="mt-6 grid gap-2 sm:w-64">
          <Button variant="primary" size="lg" onClick={onEnter} data-testid="club-enter">
            <DoorOpen /> 進入遊戲
          </Button>
          <Link
            href="/"
            className="rounded-xl px-4 py-2 text-center text-sm text-[#F2DAB6]/70 hover:text-[#F2DAB6]"
          >
            回到遊戲列表
          </Link>
        </div>
      </div>
    </div>
  );
}

function Prompt({ it, onAct }: { it: Interactable; onAct: () => void }) {
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-[#F2B552]/40 bg-[#24344D]/85 py-2 pr-2 pl-4 text-sm text-[#F2DAB6] shadow-xl backdrop-blur animate-rise">
      <kbd className="hidden rounded-md border border-[#F2DAB6]/40 px-1.5 font-mono text-xs sm:inline">
        E
      </kbd>
      <span data-testid="club-prompt">{it.label}</span>
      <Button variant="primary" size="sm" onClick={onAct} data-testid="club-act">
        {it.kind === 'table' ? '入座' : it.kind === 'npc' ? '聊天' : '查看'}
      </Button>
    </div>
  );
}

/** /club：街口首頁 → 走進 1F 麻將館 → 入座打牌 */
export function ClubScreen() {
  const mode = useClub((s) => s.mode);
  const nearby = useClub((s) => s.nearby);
  const bubble = useClub((s) => s.bubble);
  const seatedAt = useClub((s) => s.seatedAt);
  const { setMode, sit, stand, say, reset } = useClub.getState();
  const qualitySetting = useSettings((s) => s.quality);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [override, setOverride] = useState<number | undefined>(undefined);
  // 網址加 ?q=high／medium／low 可以固定畫質（截圖比對用）
  const [qualityOverride, setQualityOverride] = useState<'low' | 'medium' | 'high' | null>(null);
  const hour = useGameHour(override);

  useEffect(() => {
    setWebgl(isWebGLAvailable());
    setOverride(readHourOverride());
    const q = new URLSearchParams(window.location.search).get('q');
    if (q === 'low' || q === 'medium' || q === 'high') setQualityOverride(q);
    reset();
    // 網址加 ?weather=clear／rain 可以固定天氣（截圖比對用）
    const w = new URLSearchParams(window.location.search).get('weather');
    if (w === 'clear' || w === 'rain') useClub.getState().setWeather(w);
    // 網址加 ?spawn=hall 直接站在 1F 室內（截圖檢視用）
    if (new URLSearchParams(window.location.search).get('spawn') === 'hall') {
      player.pos = [-0.4, -6.8];
      player.yaw = Math.PI;
      useClub.setState({ mode: 'walk', inside: true });
    }
  }, [reset]);

  const act = (it: Interactable | null) => {
    if (!it || useClub.getState().mode !== 'walk') return;
    if (it.kind === 'table') sit(it.id);
    else if (it.kind === 'npc') {
      say('阿樂', A_LE_LINES[Math.floor(Math.random() * A_LE_LINES.length)]!);
    } else {
      say('告示', '2F 以上還在整修，開放後就能上樓了。');
    }
  };

  // E／Enter／空白鍵：和附近的東西互動
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE' && e.code !== 'Enter' && e.code !== 'Space') return;
      if ((e.target as HTMLElement | null)?.closest('button, input, textarea, select, a')) return;
      const s = useClub.getState();
      if (s.mode !== 'walk' || !s.nearby) return;
      e.preventDefault();
      act(s.nearby);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // 走開或幾秒後，對白自動收起
  useEffect(() => {
    if (!bubble) return;
    const id = setTimeout(() => useClub.setState({ bubble: null }), 4500);
    return () => clearTimeout(id);
  }, [bubble]);
  useEffect(() => {
    if (!nearby) useClub.setState({ bubble: null });
  }, [nearby]);

  if (webgl === false) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm">
          <h1 className="font-serif text-3xl text-[#F2DAB6]">暮光遊樂館</h1>
          <p className="mt-3 text-sm text-ink-300">
            這台裝置無法顯示 3D 場景（WebGL 未啟用）。可以直接到麻將桌和電腦打一將。
          </p>
          <Link href="/mahjong/practice" className="mt-5 inline-block text-gold-300 underline">
            直接打麻將
          </Link>
        </div>
      </div>
    );
  }

  const quality =
    qualityOverride ??
    (qualitySetting === 'auto' || qualitySetting === '2d' ? recommendedQuality() : qualitySetting);
  const table = INTERACTABLES.find((x) => x.id === seatedAt);

  return (
    <div
      data-testid="club-root"
      data-mode={mode}
      className="fixed inset-0 overflow-hidden bg-[#24344D]"
    >
      {webgl && <ClubScene hour={override} quality={quality} />}

      {mode === 'title' && <TitleMenu hour={hour} onEnter={() => setMode('intro')} />}

      {mode === 'walk' && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-[#24344D]/75 px-3 py-1 font-serif text-sm font-bold text-[#F2DAB6] backdrop-blur">
                暮光<span className="text-[#E95B4B]">遊樂館</span>
              </div>
              <Clock hour={hour} />
              <WeatherToggle />
            </div>
            <Link
              href="/"
              data-testid="club-exit"
              className="pointer-events-auto flex items-center gap-1 rounded-full bg-[#24344D]/75 px-3 py-1 text-xs text-[#F2DAB6] backdrop-blur hover:bg-[#24344D]"
            >
              <LogOut className="size-3.5" /> 離開
            </Link>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {bubble && (
              <div
                data-testid="club-bubble"
                className="max-w-xs rounded-2xl bg-[#F2DAB6] px-4 py-2 text-sm text-[#24344D] shadow-xl animate-rise"
              >
                <span className="mr-1 font-bold text-[#E95B4B]">{bubble.who}</span>
                {bubble.text}
              </div>
            )}
            {nearby ? (
              <Prompt it={nearby} onAct={() => act(nearby)} />
            ) : (
              <button
                type="button"
                onClick={walkToNearestTable}
                data-testid="club-find-table"
                className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-[#F2B552]/40 bg-[#24344D]/85 px-4 py-2 text-sm text-[#F2DAB6] shadow-xl backdrop-blur hover:bg-[#24344D]"
              >
                <Navigation className="size-3.5" /> 帶我去空桌
              </button>
            )}
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1 text-[11px] text-[#F2DAB6]/80',
                nearby && 'opacity-60',
              )}
            >
              <Footprints className="size-3" />
              <span className="hidden sm:inline">WASD／方向鍵走路，</span>
              點地面走過去，點桌子直接走到桌邊
            </div>
          </div>
        </>
      )}

      {mode === 'seated' && table && (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-ink-950" data-testid="club-table">
          <MahjongPracticeScreen onExit={() => stand(table.approach)} />
        </div>
      )}
    </div>
  );
}
