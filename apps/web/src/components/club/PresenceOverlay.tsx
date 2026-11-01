'use client';

import { useCallback, useEffect, useState } from 'react';
import { clubTableCapacity, type ClubPlayer } from '@xiangqi-arena/game-protocol';
import { BUBBLE_MS, seatedAt, useClubNet } from './net';
import { ALL_TABLE_IDS, tagEls } from './RemotePlayers';

/** 把元素登記給 3D 那邊定位；卸載時移除 */
function useTagRef(key: string) {
  return useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        el.style.visibility = 'hidden';
        tagEls.set(key, el);
      } else tagEls.delete(key);
    },
    [key],
  );
}

function useBubble(id: string): string | undefined {
  const bubble = useClubNet((s) => s.bubbles[id]);
  const [, force] = useState(0);
  useEffect(() => {
    if (!bubble) return;
    const left = bubble.at + BUBBLE_MS - Date.now();
    if (left <= 0) return;
    const t = setTimeout(() => force((n) => n + 1), left);
    return () => clearTimeout(t);
  }, [bubble]);
  return bubble && Date.now() - bubble.at < BUBBLE_MS ? bubble.text : undefined;
}

const TAG_BASE = 'absolute top-0 left-0 will-change-transform';

/** 名牌 + 最近一句公開聊天 */
function NameTag({ p, you }: { p: ClubPlayer; you: boolean }) {
  const ref = useTagRef(`p:${p.id}`);
  const bubble = useBubble(p.id);
  return (
    <div ref={ref} className={TAG_BASE}>
      <div className="flex flex-col items-center gap-1 whitespace-nowrap select-none">
        {bubble && (
          <div className="max-w-[220px] truncate rounded-2xl bg-[#F2DAB6] px-3 py-1 text-xs text-[#24344D] shadow-lg">
            {bubble}
          </div>
        )}
        <div
          data-testid="club-nametag"
          className="flex items-center gap-1 rounded-full bg-[#141018]/70 px-2 py-0.5 text-[11px] text-[#F2DAB6]"
        >
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}
          {you && <span className="text-[#F2DAB6]/60">（你）</span>}
        </div>
      </div>
    </div>
  );
}

/** 桌子上方：每個座位一個點（有人就是那人的顏色）+ 人數 */
function TableBadge({ id, who }: { id: string; who: ClubPlayer[] }) {
  const ref = useTagRef(`t:${id}`);
  const cap = clubTableCapacity(id);
  return (
    <div ref={ref} className={TAG_BASE}>
      <div
        data-testid={`club-table-badge-${id}`}
        data-count={who.length}
        className="flex items-center gap-1.5 rounded-full border border-[#F2B552]/50 bg-[#24344D]/85 px-2.5 py-1 text-xs whitespace-nowrap text-[#F2DAB6] shadow-lg select-none"
      >
        <span className="flex gap-0.5">
          {Array.from({ length: cap }, (_, i) => {
            const p = who.find((x) => x.seat === i);
            return (
              <span
                key={i}
                className="size-2.5 rounded-full border border-white/20"
                style={{ background: p ? p.color : 'transparent' }}
              />
            );
          })}
        </span>
        <span className="font-mono">
          {who.length}/{cap}
        </span>
        <span>{who.length >= cap ? '滿座' : '人'}</span>
      </div>
    </div>
  );
}

/** 疊在 3D 畫面上的名牌與桌上人數；位置由 RemotePlayers 的 TagProjector 每格更新 */
export function PresenceOverlay() {
  const players = useClubNet((s) => s.players);
  const you = useClubNet((s) => s.you);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {ALL_TABLE_IDS.map((id) => {
        const who = seatedAt(players, id);
        return who.length > 0 ? <TableBadge key={id} id={id} who={who} /> : null;
      })}
      {Object.values(players).map((p) =>
        // 坐下的人在桌上的人數裡就看得到，不另外掛名牌
        p.tableId ? null : <NameTag key={p.id} p={p} you={p.id === you} />,
      )}
    </div>
  );
}
