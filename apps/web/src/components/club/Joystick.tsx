'use client';

import { useEffect, useRef, useState } from 'react';
import { player, stick } from './store';

/** 搖桿底座半徑（px）；手指離中心超過這個距離就算推到底 */
const RADIUS = 52;
/** 中間這一小圈不動，手指輕放不會走 */
const DEAD_ZONE = 0.12;
/** 推到這個比例以上就跑步 */
const RUN_AT = 0.92;

/** 觸控裝置（手機、平板）才顯示搖桿；網址加 ?stick=1 在桌機也顯示（測試用） */
export function useTouchDevice(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const force = new URLSearchParams(window.location.search).get('stick') === '1';
    const mq = window.matchMedia('(pointer: coarse)');
    const update = () => setTouch(force || mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return touch;
}

function release() {
  stick.x = 0;
  stick.z = 0;
  stick.run = false;
}

/**
 * 手機的虛擬搖桿（左下角）：拇指按住拖曳就往那個方向走，推到底用跑的。
 * 方向跟方向鍵一樣依鏡頭換算（往上推 = 往畫面裡面走）。
 * 搖桿自己吃掉觸控事件，不會同時觸發拖曳轉視角或點地面走路；另一隻手指仍可以在畫面上轉視角。
 */
export function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [active, setActive] = useState(false);

  // 卸載（坐下、換畫面）時一定放開，角色不會自己一直走
  useEffect(() => release, []);

  const move = (clientX: number, clientY: number) => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = clientX - (r.left + r.width / 2);
    let dy = clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) {
      dx = (dx / d) * RADIUS;
      dy = (dy / d) * RADIUS;
    }
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
    const amount = Math.min(1, d / RADIUS);
    if (amount < DEAD_ZONE) {
      stick.x = 0;
      stick.z = 0;
      stick.run = false;
      return;
    }
    // 去掉死區後重新映射成 0～1，輕推就是慢走
    const scaled = (amount - DEAD_ZONE) / (1 - DEAD_ZONE);
    stick.x = (dx / (d || 1)) * scaled;
    stick.z = (dy / (d || 1)) * scaled;
    stick.run = amount >= RUN_AT;
    // 用搖桿就取消點地面的尋路
    player.path = [];
  };

  const end = () => {
    pointer.current = null;
    setActive(false);
    release();
    if (knob.current) knob.current.style.transform = 'translate(0px, 0px)';
  };

  return (
    <div
      ref={base}
      data-testid="club-joystick"
      aria-label="移動搖桿"
      role="application"
      className="pointer-events-auto absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-5 z-20 grid size-[120px] touch-none place-items-center rounded-full border border-[#F2DAB6]/30 bg-[#141018]/35 backdrop-blur-sm select-none"
      style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      onPointerDown={(e) => {
        if (pointer.current !== null) return;
        e.preventDefault();
        e.stopPropagation();
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        setActive(true);
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== pointer.current) return;
        e.preventDefault();
        move(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => e.pointerId === pointer.current && end()}
      onPointerCancel={(e) => e.pointerId === pointer.current && end()}
      onLostPointerCapture={(e) => e.pointerId === pointer.current && end()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 四個方向的小箭頭 */}
      {[0, 90, 180, 270].map((deg) => (
        <span
          key={deg}
          aria-hidden
          className="absolute inset-0 grid place-items-start justify-center pt-1.5 text-[10px] text-[#F2DAB6]/45"
          style={{ transform: `rotate(${deg}deg)` }}
        >
          ▲
        </span>
      ))}
      <div
        ref={knob}
        className={
          'size-12 rounded-full border-2 border-[#F2DAB6]/70 shadow-lg transition-colors ' +
          (active ? 'bg-[#E95B4B]/85' : 'bg-[#24344D]/85')
        }
      />
    </div>
  );
}
