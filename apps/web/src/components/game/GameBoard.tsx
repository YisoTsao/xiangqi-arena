'use client';

import dynamic from 'next/dynamic';
import { Component, useEffect, useState, type ReactNode } from 'react';
import {
  Board2D,
  isWebGLAvailable,
  recommendedQuality,
  type BoardModel,
  type RenderQuality,
} from '@xiangqi-arena/game-renderer';
import { animationScaleOf, useSettings } from '@/lib/settings';
import { toast } from '@/lib/toast';

const Board3D = dynamic(() => import('@xiangqi-arena/game-renderer/three').then((m) => m.Board3D), {
  ssr: false,
  loading: () => <BoardLoading />,
});

function BoardLoading() {
  return (
    <div className="grid h-full w-full place-items-center">
      <div className="size-10 animate-spin rounded-full border-2 border-gold-400/30 border-t-gold-400" />
    </div>
  );
}

class WebGLBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.error('3D board failed, falling back to 2D', error);
    toast('3D 棋盤載入失敗，已切換為 2D 模式', 'error');
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** 依設定與裝置能力選擇 2.5D 或 2D 棋盤 */
export function GameBoard({
  model,
  onSquareClick,
}: {
  model: BoardModel;
  onSquareClick: (sq: number) => void;
}) {
  const { quality, animation } = useSettings();
  const [env, setEnv] = useState<{ webgl: boolean; auto: RenderQuality } | null>(null);
  useEffect(() => setEnv({ webgl: isWebGLAvailable(), auto: recommendedQuality() }), []);
  if (!env) return <BoardLoading />;

  const scale = animationScaleOf(animation);
  const props = { model, onSquareClick, animationScale: scale };
  const use2D = quality === '2d' || !env.webgl;
  if (use2D) return <Board2D {...props} quality="low" />;
  const q: RenderQuality = quality === 'auto' ? env.auto : quality;
  return (
    <WebGLBoundary fallback={<Board2D {...props} quality="low" />}>
      <Board3D {...props} quality={q} />
    </WebGLBoundary>
  );
}
