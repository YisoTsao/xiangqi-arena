'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import type { ClubPlayer } from '@xiangqi-arena/game-protocol';
import { Character, animateWalk } from './Character';
import {
  CARD_TABLES,
  CHESS_TABLES,
  TABLES,
  cardChairsOf,
  chairsOf,
  chessChairsOf,
  floorY,
  type Floor,
  type Vec2,
} from './layout';
import { outfitForColor, remotes, useClubNet } from './net';
import { player, useClub } from './store';

/** 椅面高度：坐下時臀部落在這裡 */
const SEAT_Y = 0.46;
/** 名牌掛在頭頂上方多高 */
const TAG_Y = 1.7;
const BADGE_Y = 2.05;

/** 桌子 id → 樓層、桌心、椅子位置 */
export function tableGeometry(tableId: string): { floor: Floor; at: Vec2; chairs: Vec2[] } | null {
  const m = /^(table|chess|cards)-(\d+)$/.exec(tableId);
  if (!m) return null;
  const i = Number(m[2]) - 1;
  if (m[1] === 'table') {
    const at = TABLES[i];
    return at ? { floor: 1, at, chairs: chairsOf(at) } : null;
  }
  if (m[1] === 'chess') {
    const t = CHESS_TABLES[i];
    return t ? { floor: 2, at: t.at, chairs: chessChairsOf(t.at) } : null;
  }
  const at = CARD_TABLES[i];
  return at ? { floor: 2, at, chairs: cardChairsOf(at) } : null;
}

export const ALL_TABLE_IDS = [
  ...TABLES.map((_, i) => `table-${i + 1}`),
  ...CHESS_TABLES.map((_, i) => `chess-${i + 1}`),
  ...CARD_TABLES.map((_, i) => `cards-${i + 1}`),
];

/**
 * 名牌與桌上人數是畫在畫布上方的一般 DOM（PresenceOverlay）。
 * 3D 這邊每格把錨點投影成螢幕座標，直接改那些元素的 transform，不經過 React。
 * key：`p:<玩家 id>` 是人頭頂、`t:<桌子 id>` 是桌子上方。
 */
export const tagEls = new Map<string, HTMLElement>();
const anchors = new Map<string, { x: number; y: number; z: number; on: boolean }>();

function setAnchor(key: string, x: number, y: number, z: number, on: boolean): void {
  const a = anchors.get(key);
  if (a) {
    a.x = x;
    a.y = y;
    a.z = z;
    a.on = on;
  } else anchors.set(key, { x, y, z, on });
}

function RemoteAvatar({ p }: { p: ClubPlayer }) {
  const ref = useRef<Group>(null);
  const walk = useRef(0);
  const geo = p.tableId ? tableGeometry(p.tableId) : null;
  const chair = geo && p.seat !== null ? geo.chairs[p.seat] : undefined;

  useFrame((state, delta) => {
    const g = ref.current;
    const r = remotes.get(p.id);
    if (!g || !r) return;
    const dt = Math.min(delta, 0.1);
    let onFloor: number;
    if (geo && chair) {
      // 坐在椅子上、面向桌心，稍微往後坐讓腿伸到桌下
      const [cx, cz] = chair;
      const yaw = Math.atan2(geo.at[0] - cx, geo.at[1] - cz);
      g.position.set(
        cx - Math.sin(yaw) * 0.08,
        floorY(geo.floor) + SEAT_Y - 0.4,
        cz - Math.cos(yaw) * 0.08,
      );
      g.rotation.y = yaw;
      onFloor = geo.floor;
      r.rx = cx;
      r.rz = cz;
      for (const n of ['legL', 'legR'] as const) {
        const leg = g.getObjectByName(n);
        if (leg) leg.rotation.x = -1.45;
      }
      for (const n of ['armL', 'armR'] as const) {
        const arm = g.getObjectByName(n);
        if (arm) arm.rotation.x = -0.9;
      }
      const body = g.getObjectByName('body');
      if (body) body.position.y = 0;
    } else {
      // 換樓層或距離太遠就直接跳過去，否則平滑追上
      if (r.rfloor !== r.floor || Math.hypot(r.x - r.rx, r.z - r.rz) > 4) {
        r.rx = r.x;
        r.rz = r.z;
        r.rfloor = r.floor;
      }
      const k = Math.min(1, dt * 12);
      r.rx += (r.x - r.rx) * k;
      r.rz += (r.z - r.rz) * k;
      onFloor = r.floor;
      g.position.set(r.rx, floorY(r.floor as Floor), r.rz);
      let diff = r.yaw - g.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.rotation.y += diff * Math.min(1, dt * 14);
      const still = Math.hypot(r.x - r.rx, r.z - r.rz) < 0.02 && !r.moving;
      walk.current += ((still ? 0 : 1) - walk.current) * Math.min(1, dt * 10);
      animateWalk(g, state.clock.elapsedTime, walk.current);
    }
    // 只看得到同一層樓的人
    const here = onFloor === useClub.getState().floor;
    g.visible = here;
    setAnchor(`p:${p.id}`, g.position.x, g.position.y + TAG_Y, g.position.z, here);
  });

  return <Character ref={ref} outfit={outfitForColor(p.color)} />;
}

const v = new Vector3();

/** 每格把錨點投影到螢幕，更新名牌與桌牌的位置 */
function TagProjector() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useFrame(() => {
    const club = useClub.getState();
    const you = useClubNet.getState().you;
    if (you) {
      const show = club.mode === 'walk' || club.mode === 'travel';
      setAnchor(`p:${you}`, player.pos[0], floorY(club.floor) + TAG_Y, player.pos[1], show);
    }
    for (const id of ALL_TABLE_IDS) {
      const geo = tableGeometry(id)!;
      setAnchor(
        `t:${id}`,
        geo.at[0],
        floorY(geo.floor) + BADGE_Y,
        geo.at[1],
        geo.floor === club.floor,
      );
    }
    for (const [key, el] of tagEls) {
      const a = anchors.get(key);
      if (!a || !a.on) {
        el.style.visibility = 'hidden';
        continue;
      }
      v.set(a.x, a.y, a.z).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) {
        el.style.visibility = 'hidden';
        continue;
      }
      const sx = ((v.x + 1) / 2) * size.width;
      const sy = ((1 - v.y) / 2) * size.height;
      el.style.visibility = '';
      el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
  });
  return null;
}

/** 俱樂部裡其他人的角色，以及名牌與桌牌的定位 */
export function ClubPresence() {
  const you = useClubNet((s) => s.you);
  const players = useClubNet((s) => s.players);
  return (
    <>
      {Object.values(players)
        .filter((p) => p.id !== you)
        .map((p) => (
          <RemoteAvatar key={p.id} p={p} />
        ))}
      <TagProjector />
    </>
  );
}
