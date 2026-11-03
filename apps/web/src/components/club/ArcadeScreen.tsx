'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, Trophy, X } from 'lucide-react';
import { Button } from '../ui/button';
import type { ArcadeGame } from './layout';
import {
  ARCADE_H,
  ARCADE_SPECS,
  ARCADE_W,
  loadBest,
  saveBest,
  type ArcadeButton,
  type ArcadeInput,
  type ArcadeRun,
} from './arcadeGames';
import { cn } from '@/lib/utils';

type Phase = 'ready' | 'playing' | 'over';

const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);
const ACTION_KEYS = new Set(['Space', 'Enter', 'ArrowUp', 'ArrowDown']);

/**
 * 站在 1F 遊樂機台前玩：機台外框 + 直式畫布 + 手機按鈕。
 * 遊戲迴圈用 requestAnimationFrame，3D 場景在這段時間暫停（ClubScene 的 frameloop）。
 */
export function ArcadeScreen({
  game,
  onExit,
}: {
  game: ArcadeGame;
  onExit: (best: number | null) => void;
}) {
  const spec = ARCADE_SPECS[game];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runRef = useRef<ArcadeRun | null>(null);
  const [phase, setPhase] = useState<Phase>('ready');
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('');
  const [best, setBest] = useState(0);
  const [record, setRecord] = useState(false);
  const [summary, setSummary] = useState<string | undefined>();
  /** 這次玩出的新紀錄（離開時讓阿樂說一聲） */
  const newBest = useRef<number | null>(null);

  // 輸入狀態：鍵盤、指標與畫面按鈕都寫到這裡，每格由遊戲迴圈讀走
  const input = useRef({
    keysHeld: new Set<string>(),
    pressed: [] as string[],
    btnLeft: false,
    btnRight: false,
    action: false,
    pointer: null as { x: number; y: number } | null,
    pointerDown: false,
    pointerMoved: false,
    taps: [] as { x: number; y: number }[],
  });

  useEffect(() => setBest(loadBest(game)), [game]);

  const start = useCallback(() => {
    runRef.current = spec.create();
    const i = input.current;
    i.taps = [];
    i.pressed = [];
    i.action = false;
    setScore(0);
    setRecord(false);
    setSummary(undefined);
    setStatus(runRef.current.status);
    setPhase('playing');
  }, [spec]);

  // 鍵盤
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select')) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        onExit(newBest.current);
        return;
      }
      const i = input.current;
      if (phase !== 'playing') {
        if ((e.code === 'Space' || e.code === 'Enter') && !t?.closest('button')) {
          e.preventDefault();
          start();
        }
        return;
      }
      if (LEFT_KEYS.has(e.code) || RIGHT_KEYS.has(e.code) || ACTION_KEYS.has(e.code))
        e.preventDefault();
      if (e.repeat) return;
      i.keysHeld.add(e.code);
      i.pressed.push(e.code);
      if (ACTION_KEYS.has(e.code)) i.action = true;
    };
    const up = (e: KeyboardEvent) => input.current.keysHeld.delete(e.code);
    const blur = () => input.current.keysHeld.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [phase, start, onExit]);

  // 遊戲迴圈
  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = ARCADE_W * dpr;
    canvas.height = ARCADE_H * dpr;
    let raf = 0;
    let last = performance.now();
    let lastScore = -1;
    let lastStatus = '';
    // 開始前先畫一張待機畫面
    const idle = spec.create();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const run = runRef.current;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (phase === 'playing' && run) {
        const i = input.current;
        const held = (set: Set<string>) => [...i.keysHeld].some((k) => set.has(k));
        const frameInput: ArcadeInput = {
          left: i.btnLeft || held(LEFT_KEYS),
          right: i.btnRight || held(RIGHT_KEYS),
          pointer: i.pointer,
          pointerDown: i.pointerDown,
          pointerMoved: i.pointerMoved,
          taps: i.taps,
          action: i.action,
          keys: i.pressed,
        };
        i.taps = [];
        i.pressed = [];
        i.action = false;
        i.pointerMoved = false;
        run.update(dt, frameInput);
        run.draw(g, now / 1000);
        if (run.score !== lastScore) setScore((lastScore = run.score));
        if (run.status !== lastStatus) setStatus((lastStatus = run.status));
        if (run.over) {
          const broke = saveBest(game, run.score);
          if (broke) newBest.current = run.score;
          setRecord(broke);
          setBest(loadBest(game));
          setSummary(run.summary);
          setPhase('over');
          return;
        }
      } else if (phase === 'ready') {
        idle.draw(g, now / 1000);
      } else if (run) {
        run.draw(g, now / 1000);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, spec, game]);

  // 指標座標換成 360×480 的畫布座標
  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * ARCADE_W,
      y: ((e.clientY - r.top) / r.height) * ARCADE_H,
    };
  };

  const hold = (b: ArcadeButton, on: boolean) => {
    const i = input.current;
    if (b.kind === 'left') i.btnLeft = on;
    else if (b.kind === 'right') i.btnRight = on;
    else if (on) i.action = true;
  };

  return (
    <div
      data-testid="club-arcade"
      data-game={game}
      data-phase={phase}
      className="absolute inset-0 z-40 flex items-center justify-center bg-[#141018]/75 p-2 backdrop-blur-sm"
    >
      <div
        className="flex max-h-full w-full max-w-[420px] flex-col rounded-[28px] border-4 bg-[#24344D] p-3 shadow-2xl animate-rise"
        style={{ borderColor: spec.accent, boxShadow: `0 0 40px ${spec.accent}55` }}
      >
        {/* 機台招牌 */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <div
            className="font-serif text-xl font-black tracking-wider"
            style={{ color: spec.accent, textShadow: `0 0 12px ${spec.accent}aa` }}
          >
            {spec.title}
          </div>
          <button
            type="button"
            aria-label="離開機台"
            data-testid="club-arcade-exit"
            onClick={() => onExit(newBest.current)}
            className="rounded-full bg-black/30 p-1.5 text-[#F2DAB6]/80 hover:text-[#F2DAB6]"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mb-2 flex items-center justify-between rounded-xl bg-black/35 px-3 py-1 font-mono text-sm text-[#F2DAB6]">
          <span data-testid="club-arcade-score">得分 {score}</span>
          <span className="text-xs text-[#F2DAB6]/80">{phase === 'playing' ? status : ''}</span>
          <span className="flex items-center gap-1 text-xs text-[#F2B552]">
            <Trophy className="size-3" /> {best}
          </span>
        </div>

        {/* 畫布：維持 3:4，高度不超過螢幕 */}
        <div
          className="relative mx-auto w-full"
          style={{ maxWidth: 'calc((100dvh - 210px) * 0.75)' }}
        >
          <canvas
            ref={canvasRef}
            data-testid="club-arcade-canvas"
            className="block aspect-[3/4] w-full touch-none rounded-xl bg-black select-none"
            onPointerDown={(e) => {
              if (phase !== 'playing') return;
              e.currentTarget.setPointerCapture(e.pointerId);
              const p = toCanvas(e);
              const i = input.current;
              i.pointer = p;
              i.pointerDown = true;
              i.taps.push(p);
            }}
            onPointerMove={(e) => {
              input.current.pointer = toCanvas(e);
              input.current.pointerMoved = true;
            }}
            onPointerUp={() => {
              input.current.pointerDown = false;
            }}
            onPointerCancel={() => {
              input.current.pointerDown = false;
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === 'mouse') input.current.pointer = null;
            }}
          />
          {phase !== 'playing' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-[#141018]/70 p-6 text-center text-[#F2DAB6]">
              {phase === 'over' ? (
                <>
                  <div className="text-sm text-[#F2DAB6]/70">遊戲結束</div>
                  <div className="font-serif text-5xl font-black" data-testid="club-arcade-final">
                    {score}
                  </div>
                  {record && (
                    <div className="rounded-full bg-[#F2B552] px-3 py-0.5 text-xs font-bold text-[#24344D]">
                      新紀錄！
                    </div>
                  )}
                  {summary && <div className="text-sm text-[#F2DAB6]/85">{summary}</div>}
                </>
              ) : (
                <>
                  <p className="hidden text-sm leading-relaxed sm:block">{spec.howto}</p>
                  <p className="text-sm leading-relaxed sm:hidden">{spec.howtoTouch}</p>
                </>
              )}
              <Button variant="primary" onClick={start} data-testid="club-arcade-start">
                {phase === 'over' ? <RotateCcw /> : <Play />}
                {phase === 'over' ? '再玩一次' : '投幣開始'}
              </Button>
              {phase === 'over' && (
                <button
                  type="button"
                  onClick={() => onExit(newBest.current)}
                  className="text-xs text-[#F2DAB6]/70 underline hover:text-[#F2DAB6]"
                >
                  離開機台
                </button>
              )}
            </div>
          )}
        </div>

        {/* 手機按鈕（桌機也能點） */}
        {spec.buttons.length > 0 && (
          <div className="mt-3 flex items-stretch justify-center gap-2">
            {spec.buttons.map((b) => (
              <button
                key={b.label}
                type="button"
                data-testid={`club-arcade-btn-${b.kind}`}
                disabled={phase !== 'playing'}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  hold(b, true);
                }}
                onPointerUp={() => hold(b, false)}
                onPointerCancel={() => hold(b, false)}
                onContextMenu={(e) => e.preventDefault()}
                className={cn(
                  'min-h-12 flex-1 touch-none rounded-2xl border-b-4 text-lg font-bold select-none active:translate-y-0.5 active:border-b-2 disabled:opacity-40',
                  b.kind === 'action'
                    ? 'border-[#a83a2e] bg-[#E95B4B] text-white'
                    : 'max-w-24 border-black/40 bg-[#F2DAB6] text-[#24344D]',
                )}
              >
                {b.label}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 hidden text-center text-[11px] text-[#F2DAB6]/50 sm:block">
          Esc 離開機台
        </div>
      </div>
    </div>
  );
}
