import { describe, expect, it } from 'vitest';
import { dayPhaseOf, formatGameTime, gameHourAt, lightingAt } from './clock';
import {
  INTERACTABLES,
  SPAWN,
  TABLES,
  CAMERA_YAW,
  clearLine,
  inputToWorld,
  isInside,
  findPath,
  isFree,
  nearestInteractable,
  slide,
  standPointOf,
} from './layout';

describe('暮光遊樂館配置', () => {
  it('開場位置、每張桌子的站位與每個互動點的靠近點都站得下', () => {
    expect(isFree(...SPAWN)).toBe(true);
    for (const t of TABLES) expect(isFree(...standPointOf(t))).toBe(true);
    for (const it of INTERACTABLES) expect(isFree(...it.approach), it.id).toBe(true);
  });

  it('站在靠近點時，最近的互動點就是它自己', () => {
    for (const it of INTERACTABLES) expect(nearestInteractable(it.approach)?.id).toBe(it.id);
  });

  it('從騎樓可以走到每一個互動點', () => {
    for (const it of INTERACTABLES) {
      const path = findPath(SPAWN, it.approach);
      expect(path.length, it.id).toBeGreaterThan(0);
      expect(path.at(-1)).toEqual(it.approach);
      let prev = SPAWN;
      for (const p of path) {
        expect(clearLine(prev, p), `${it.id} ${p}`).toBe(true);
        prev = p;
      }
    }
  });

  it('正門可以直走進去；牆會擋住', () => {
    let p = SPAWN;
    for (let i = 0; i < 60; i++) p = slide(p, 0, -0.1);
    expect(p[1]).toBeLessThan(-2);
    // 往門的左邊走會被正面牆擋在外面
    let q: readonly [number, number] = [-5, 2];
    for (let i = 0; i < 40; i++) q = slide(q, 0, -0.1);
    expect(q[1]).toBeGreaterThan(0);
  });

  it('按住 W（畫面往上）從騎樓走進門，會先出現麻將桌的入座提示', () => {
    let p = SPAWN;
    let hit = null;
    for (let i = 0; i < 120 && !hit; i++) {
      const yaw = isInside(p) ? CAMERA_YAW.inside : CAMERA_YAW.outside;
      const [dx, dz] = inputToWorld(0, -1, yaw);
      p = slide(p, dx * 0.1, dz * 0.1);
      hit = nearestInteractable(p);
    }
    expect(hit?.kind).toBe('table');
  });

  it('方向鍵依鏡頭角度旋轉', () => {
    expect(inputToWorld(0, -1, 0)).toEqual([0, -1]);
    const [x, z] = inputToWorld(0, -1, CAMERA_YAW.inside);
    expect(x).toBeLessThan(0);
    expect(z).toBeLessThan(0);
    const [rx, rz] = inputToWorld(1, 0, CAMERA_YAW.inside);
    expect(rx).toBeGreaterThan(0);
    expect(rz).toBeLessThan(0);
  });
});

describe('日夜時鐘', () => {
  it('現實 2 小時 = 遊戲 1 天', () => {
    expect(gameHourAt(0)).toBe(0);
    expect(gameHourAt(300_000)).toBe(1);
    expect(gameHourAt(7_200_000)).toBe(0);
  });

  it('時段與時間格式', () => {
    expect(dayPhaseOf(7)).toBe('morning');
    expect(dayPhaseOf(12)).toBe('day');
    expect(dayPhaseOf(18)).toBe('dusk');
    expect(dayPhaseOf(22)).toBe('night');
    expect(dayPhaseOf(3)).toBe('night');
    expect(formatGameTime(19.5)).toBe('19:30');
  });

  it('霓虹白天關、夜晚全亮，跨午夜連續', () => {
    expect(lightingAt(12).neon).toBe(0);
    expect(lightingAt(22).neon).toBe(1);
    expect(lightingAt(23.99).sky).toEqual(lightingAt(0).sky);
    expect(lightingAt(18).neon).toBeGreaterThan(0);
  });
});
