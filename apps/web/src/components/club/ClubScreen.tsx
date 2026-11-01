'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  ArrowUpDown,
  CloudRain,
  DoorOpen,
  Footprints,
  LogOut,
  Navigation,
  Sun,
  X,
} from 'lucide-react';
import { isWebGLAvailable, recommendedQuality } from '@xiangqi-arena/game-renderer';
import { BigTwoPracticeScreen } from '../bigtwo/BigTwoPracticeScreen';
import { LocalScreen } from '../LocalScreen';
import { MahjongPracticeScreen } from '../mahjong/MahjongPracticeScreen';
import { Button } from '../ui/button';
import { DAY_PHASE_LABELS, dayPhaseOf, formatGameTime, gameHourAt } from './clock';
import {
  ALL_INTERACTABLES,
  ELEVATOR_LANDING,
  STAIRS_LANDING_2F,
  type Floor,
  type Interactable,
} from './layout';
import { TRAVEL_FADE_MS, player, useClub, walkToNearestTable } from './store';
import { useSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';

const ClubScene = dynamic(() => import('./ClubScene').then((m) => m.ClubScene), {
  ssr: false,
});

const A_LE_LINES = [
  '歡迎光臨！桌子都空著，挑一張坐吧。',
  '今天手氣怎麼樣？先喝杯烏龍再上桌。',
  '樓上 2F 是牌桌館，想下象棋、打大老二就上樓。',
  '打牌別急，聽牌了再來跟我炫耀。',
  '晚上最熱鬧，霓虹一亮客人就上門囉。',
];

const HOST_LINES = [
  '歡迎來到牌桌館！左邊下棋，右邊打牌，隨便坐。',
  '棋桌是兩人同一台裝置對弈，找朋友來一盤吧。',
  '牌桌的三位老客人都是電腦，打大老二不會累。',
  '觀棋不語真君子，阿伯看了一下午都沒出聲。',
  '3F 電玩網咖還在整修，電梯先只停 1F、2F。',
];

/** 截圖與 E2E 用的固定站位：1F 室內全景、剛進門、牌桌旁、樓梯口、電梯口；2F 全景、棋桌旁、牌桌旁 */
const SPAWNS: Record<string, { pos: [number, number]; yaw: number; floor?: Floor }> = {
  hall: { pos: [-0.4, -6.8], yaw: Math.PI },
  door: { pos: [0, -1.2], yaw: Math.PI },
  table: { pos: [-2, -3.9], yaw: Math.PI },
  stairs: { pos: [-8.15, -7.9], yaw: Math.PI },
  elevator: { pos: [7.5, -9.7], yaw: Math.PI },
  '2f': { pos: [0.2, -6], yaw: Math.PI, floor: 2 },
  '2f-chess': { pos: [-4.4, -1.6], yaw: Math.PI, floor: 2 },
  '2f-cards': { pos: [3, -1.6], yaw: Math.PI, floor: 2 },
};

/** 電梯面板：1F、2F 可以去，3F 以上整修中 */
const ELEVATOR_STOPS: { floor: number; label: string; open: boolean }[] = [
  { floor: 4, label: '4F 私人包廂', open: false },
  { floor: 3, label: '3F 電玩網咖', open: false },
  { floor: 2, label: '2F 牌桌館', open: true },
  { floor: 1, label: '1F 麻將館', open: true },
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
          藏在老街裡、燈從不熄的遊戲俱樂部。1F 麻將館、2F 牌桌館都開門了，找張桌子坐下來吧。
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

const SEAT_KINDS = new Set<Interactable['kind']>(['table', 'chess', 'cards']);

const ACT_LABELS: Record<Interactable['kind'], string> = {
  table: '入座',
  chess: '入座',
  cards: '入座',
  npc: '聊天',
  host: '聊天',
  stairs: '上樓',
  stairsDown: '下樓',
  elevator: '搭乘',
};

/** 電梯樓層面板 */
function ElevatorPanel({
  floor,
  onPick,
  onClose,
}: {
  floor: Floor;
  onPick: (to: Floor) => void;
  onClose: () => void;
}) {
  return (
    <div
      data-testid="club-elevator"
      className="pointer-events-auto w-60 rounded-2xl border border-[#F2B552]/40 bg-[#24344D]/90 p-3 text-sm text-[#F2DAB6] shadow-xl backdrop-blur animate-rise"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold">電梯</span>
        <button
          type="button"
          aria-label="關閉"
          onClick={onClose}
          className="rounded-full p-1 text-[#F2DAB6]/70 hover:text-[#F2DAB6]"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="grid gap-1.5">
        {ELEVATOR_STOPS.map((s) => {
          const here = s.floor === floor;
          return (
            <button
              key={s.floor}
              type="button"
              data-testid={`club-elevator-${s.floor}f`}
              disabled={!s.open || here}
              onClick={() => onPick(s.floor as Floor)}
              className={cn(
                'flex items-center justify-between rounded-xl border px-3 py-1.5 text-left',
                s.open && !here
                  ? 'border-[#F2B552]/50 hover:bg-[#F2B552]/15'
                  : 'border-white/10 text-[#F2DAB6]/45',
              )}
            >
              <span>{s.label}</span>
              <span className="text-[11px]">{here ? '目前樓層' : s.open ? '' : '整修中'}</span>
            </button>
          );
        })}
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
        {ACT_LABELS[it.kind]}
      </Button>
    </div>
  );
}

/** /club：街口首頁 → 走進 1F 麻將館 → 入座打牌；上樓到 2F 牌桌館下棋、打大老二 */
export function ClubScreen() {
  const mode = useClub((s) => s.mode);
  const nearby = useClub((s) => s.nearby);
  const inside = useClub((s) => s.inside);
  const bubble = useClub((s) => s.bubble);
  const seatedAt = useClub((s) => s.seatedAt);
  const floor = useClub((s) => s.floor);
  const { setMode, sit, stand, say, reset, travel } = useClub.getState();
  const [elevatorOpen, setElevatorOpen] = useState(false);
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
    // 網址加 ?spawn=hall／door／table 直接站在 1F 室內固定位置（截圖比對用）
    const spawn = SPAWNS[new URLSearchParams(window.location.search).get('spawn') ?? ''];
    if (spawn) {
      player.pos = [...spawn.pos];
      player.yaw = spawn.yaw;
      useClub.setState({ mode: 'walk', inside: true, floor: spawn.floor ?? 1 });
    }
  }, [reset]);

  const pickLine = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)]!;

  const ride = (to: Floor) => {
    setElevatorOpen(false);
    // 出電梯面向畫面下方（+z），背對電梯門
    travel(to, ELEVATOR_LANDING, 0);
  };

  const act = (it: Interactable | null) => {
    if (!it || useClub.getState().mode !== 'walk') return;
    switch (it.kind) {
      case 'table':
      case 'chess':
      case 'cards':
        sit(it.id);
        break;
      case 'npc':
        say('阿樂', pickLine(A_LE_LINES));
        break;
      case 'host':
        say('小葵', pickLine(HOST_LINES));
        break;
      case 'stairs':
        travel(2, STAIRS_LANDING_2F, 0);
        break;
      case 'stairsDown':
        travel(1, STAIRS_LANDING_2F, 0);
        break;
      case 'elevator':
        setElevatorOpen((o) => !o);
        break;
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
    if (nearby?.kind !== 'elevator') setElevatorOpen(false);
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
  const table = ALL_INTERACTABLES.find((x) => x.id === seatedAt);
  const leaveTable = () => table && stand(table.approach);

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
              {(inside || floor === 2) && (
                <div
                  data-testid="club-floor"
                  className="hidden items-center gap-1 rounded-full bg-[#24344D]/75 px-3 py-1 text-xs text-[#F2DAB6] backdrop-blur sm:flex"
                >
                  <ArrowUpDown className="size-3" />
                  {floor === 2 ? '2F 牌桌館' : '1F 麻將館'}
                </div>
              )}
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
            {elevatorOpen && nearby?.kind === 'elevator' && (
              <ElevatorPanel floor={floor} onPick={ride} onClose={() => setElevatorOpen(false)} />
            )}
            {nearby && <Prompt it={nearby} onAct={() => act(nearby)} />}
            {/* 站在樓梯口、電梯口或 NPC 旁也能直接找桌子；已經在桌邊就不用 */}
            {(!nearby || !SEAT_KINDS.has(nearby.kind)) && (
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

      {/* 換樓層的黑幕：淡出 → 換樓層 → 淡入 */}
      <div
        aria-hidden
        data-testid="club-fade"
        className="pointer-events-none absolute inset-0 z-30 bg-[#141018] transition-opacity ease-in-out"
        style={{ opacity: mode === 'travel' ? 1 : 0, transitionDuration: `${TRAVEL_FADE_MS}ms` }}
      />

      {mode === 'seated' && table && (
        <div
          className="absolute inset-0 z-40 overflow-y-auto bg-ink-950"
          data-testid="club-table"
          data-game={table.kind}
        >
          {table.kind === 'cards' ? (
            <BigTwoPracticeScreen onExit={leaveTable} />
          ) : table.kind === 'chess' ? (
            <LocalScreen initialMode={table.mode ?? 'classic'} onExit={leaveTable} />
          ) : (
            <MahjongPracticeScreen onExit={leaveTable} />
          )}
        </div>
      )}
    </div>
  );
}
