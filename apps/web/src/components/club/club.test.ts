import { describe, expect, it } from 'vitest';
import { dayPhaseOf, formatGameTime, gameHourAt, lightingAt } from './clock';
import {
  INTERACTABLES,
  INTERACTABLES_2F,
  STAIRS_LANDING_2F,
  ELEVATOR_LANDING,
  ALL_INTERACTABLES,
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
  BOUNDS,
  ARCADE_MACHINES,
  arcadeBox,
  arcadeStandOf,
} from './layout';
import { ARCADE_SPECS } from './arcadeGames';
import { DISTRICT, SIDE_STREET_X, colliderOf } from './district';

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

describe('2F 牌桌館配置', () => {
  it('樓梯口、電梯口與每個互動點的靠近點都站得下', () => {
    expect(isFree(...STAIRS_LANDING_2F, undefined, 2)).toBe(true);
    expect(isFree(...ELEVATOR_LANDING, undefined, 2)).toBe(true);
    for (const it of INTERACTABLES_2F)
      expect(isFree(...it.approach, undefined, 2), it.id).toBe(true);
  });

  it('站在靠近點時，最近的互動點就是它自己', () => {
    for (const it of INTERACTABLES_2F) expect(nearestInteractable(it.approach, 2)?.id).toBe(it.id);
  });

  it('從樓梯口可以走到每一個互動點', () => {
    for (const it of INTERACTABLES_2F) {
      const path = findPath(STAIRS_LANDING_2F, it.approach, 2);
      expect(path.length, it.id).toBeGreaterThan(0);
      expect(path.at(-1)).toEqual(it.approach);
      let prev = STAIRS_LANDING_2F;
      for (const p of path) {
        expect(clearLine(prev, p, 2), `${it.id} ${p}`).toBe(true);
        prev = p;
      }
    }
  });

  it('2F 沒有正門，走不到街上；一律算室內', () => {
    let p = STAIRS_LANDING_2F;
    for (let i = 0; i < 200; i++) p = slide(p, 0, 0.1, 2);
    expect(p[1]).toBeLessThan(0);
    expect(isInside([0, 5], 2)).toBe(true);
  });

  it('1F 樓梯上樓、2F 樓梯下樓，電梯兩層都有', () => {
    expect(INTERACTABLES.some((it) => it.kind === 'stairs')).toBe(true);
    expect(INTERACTABLES_2F.some((it) => it.kind === 'stairsDown')).toBe(true);
    expect(INTERACTABLES.some((it) => it.kind === 'elevator')).toBe(true);
    expect(INTERACTABLES_2F.some((it) => it.kind === 'elevator')).toBe(true);
    expect(INTERACTABLES_2F.filter((it) => it.kind === 'chess').map((it) => it.mode)).toEqual([
      'classic',
      'classic',
      'banqi',
      'banqi',
    ]);
    expect(INTERACTABLES_2F.filter((it) => it.kind === 'cards')).toHaveLength(3);
  });

  it('所有樓層的互動點 id 不重複', () => {
    const ids = ALL_INTERACTABLES.map((it) => it.id);
    expect(new Set(ids).size).toBe(ids.length);
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

describe('樂町街區', () => {
  it('街上不算室內；館內才算', () => {
    expect(isInside([0, -6])).toBe(true);
    expect(isInside([0, 2])).toBe(false);
    expect(isInside([0, -16])).toBe(false);
    expect(isInside([50, -20])).toBe(false);
  });

  it('從騎樓可以走到後巷、對面廣場、兩條側街與擴建預定地', () => {
    const goals: [number, number][] = [
      [0, -16], // 後巷（俱樂部正後方）
      [0, 19], // 廣場
      [SIDE_STREET_X, -30],
      [-SIDE_STREET_X, 30],
      [0, -28], // 擴建預定地 A
      [51, 25], // 擴建預定地 B
    ];
    for (const g of goals) {
      expect(isFree(...g), `${g}`).toBe(true);
      const path = findPath(SPAWN, g);
      expect(path.at(-1), `${g}`).toEqual(g);
      let prev = SPAWN;
      for (const p of path) {
        expect(clearLine(prev, p), `${g} ${p}`).toBe(true);
        prev = p;
      }
    }
  });

  it('街區的大樓擋路、建築不重疊在路面上', () => {
    for (const p of DISTRICT) {
      const c = colliderOf(p);
      if (!c) continue;
      const cx = (c.minX + c.maxX) / 2;
      const cz = (c.minZ + c.maxZ) / 2;
      if (cx < BOUNDS.minX || cx > BOUNDS.maxX || cz < BOUNDS.minZ || cz > BOUNDS.maxZ) continue;
      // 不壓到主街路面（z ∈ [3.5, 10.8]）以外的車道：只有車可以停在路上
      if (!['sedan', 'taxi', 'van', 'suv'].includes(p.model)) {
        expect(c.maxZ <= 3.5 || c.minZ >= 10.8, `${p.model} ${p.x},${p.z}`).toBe(true);
      }
      expect(isFree(cx, cz), `${p.model} ${p.x},${p.z}`).toBe(false);
    }
  });

  it('長距離尋路夠快', () => {
    const t0 = performance.now();
    findPath([-68, -40], [68, 42]);
    findPath([68, -40], [-68, 42]);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('1F 遊樂機台', () => {
  it('每台機台都在館內、站位不和機台重疊，玩完站位就是互動點', () => {
    for (const m of ARCADE_MACHINES) {
      const b = arcadeBox(m);
      expect(b.minX).toBeGreaterThanOrEqual(-9);
      expect(b.maxX).toBeLessThanOrEqual(9);
      expect(b.minZ).toBeGreaterThanOrEqual(-12);
      expect(b.maxZ).toBeLessThanOrEqual(0);
      const at = arcadeStandOf(m);
      expect(isFree(...at), m.game).toBe(true);
      expect(nearestInteractable(at)?.game).toBe(m.game);
    }
    // 2F 上樓梯回來的落腳點不能被機台擋住
    expect(isFree(...STAIRS_LANDING_2F)).toBe(true);
  });

  it('每個小遊戲都玩得起來：亂按一通也會正常結束、不會出錯', () => {
    for (const game of Object.keys(ARCADE_SPECS) as (keyof typeof ARCADE_SPECS)[]) {
      const run = ARCADE_SPECS[game].create();
      let t = 0;
      let seed = 1;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      while (!run.over && t < 600) {
        const x = rnd() * 360;
        run.update(1 / 30, {
          left: rnd() < 0.3,
          right: rnd() < 0.3,
          pointer: { x, y: rnd() * 480 },
          pointerDown: rnd() < 0.5,
          pointerMoved: true,
          taps: rnd() < 0.2 ? [{ x, y: 120 + rnd() * 340 }] : [],
          action: rnd() < 0.1,
          keys: rnd() < 0.1 ? ['Digit5'] : [],
        });
        t += 1 / 30;
      }
      expect(run.over, game).toBe(true);
      expect(Number.isFinite(run.score), game).toBe(true);
      expect(run.score, game).toBeGreaterThanOrEqual(0);
    }
  });
});
