/**
 * 1F 遊樂機台的小遊戲：夾娃娃、打地鼠、太空射擊、打磚塊、投籃。
 *
 * 每個遊戲都畫在 360×480 的直式畫布上（ArcadeScreen 負責縮放、輸入與遊戲迴圈），
 * 這裡只有遊戲邏輯與 2D canvas 繪圖，不碰 React 與 three.js。
 */

import type { ArcadeGame } from './layout';

export const ARCADE_W = 360;
export const ARCADE_H = 480;

/** 這一格的輸入（座標已換算成 360×480 的畫布座標） */
export interface ArcadeInput {
  left: boolean;
  right: boolean;
  /** 指標（滑鼠或手指）目前的位置；沒有在畫布上時是 null */
  pointer: { x: number; y: number } | null;
  /** 指標是否按著（拖曳中） */
  pointerDown: boolean;
  /** 這一格指標有移動（滑鼠沒按著也算） */
  pointerMoved: boolean;
  /** 這一格新按下的點 */
  taps: { x: number; y: number }[];
  /** 這一格按了「動作」（空白鍵、Enter、畫面上的動作鈕） */
  action: boolean;
  /** 這一格按下的按鍵 code */
  keys: string[];
}

export interface ArcadeRun {
  score: number;
  over: boolean;
  /** 遊戲中顯示在分數旁的狀態（剩幾秒、剩幾條命…） */
  status: string;
  /** 結束畫面多一行說明（例如夾到哪些娃娃） */
  summary?: string;
  update(dt: number, input: ArcadeInput): void;
  draw(g: CanvasRenderingContext2D, time: number): void;
}

export interface ArcadeButton {
  label: string;
  /** hold = 按住算方向；action = 按一下 */
  kind: 'left' | 'right' | 'action';
}

export interface ArcadeSpec {
  title: string;
  /** 開始畫面的玩法說明（桌機、手機） */
  howto: string;
  howtoTouch: string;
  /** 手機上畫面下方的按鈕（沒有就是直接點畫面玩） */
  buttons: ArcadeButton[];
  /** 畫布外框與標題的主色 */
  accent: string;
  create(): ArcadeRun;
}

// ── 共用 ───────────────────────────────────────────────

const C = {
  navy: '#24344D',
  ink: '#141018',
  cream: '#F2DAB6',
  red: '#E95B4B',
  amber: '#F2B552',
  cyan: '#5cc2c9',
  green: '#4f9a6e',
  pink: '#f08fb0',
  violet: '#8a6fd1',
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function text(
  g: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = 'center',
) {
  g.font = `bold ${size}px "Noto Sans TC", system-ui, sans-serif`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(s, x, y);
}

/** 飄起來的得分字 */
interface Floater {
  x: number;
  y: number;
  t: number;
  s: string;
  color: string;
}
function updateFloaters(fs: Floater[], dt: number) {
  for (const f of fs) {
    f.t += dt;
    f.y -= dt * 40;
  }
  while (fs.length && fs[0]!.t > 0.9) fs.shift();
}
function drawFloaters(g: CanvasRenderingContext2D, fs: Floater[]) {
  for (const f of fs) {
    g.globalAlpha = 1 - f.t / 0.9;
    text(g, f.s, f.x, f.y, 20, f.color);
  }
  g.globalAlpha = 1;
}

/** 依指標或方向鍵算出水平移動後的 x */
function steer(x: number, input: ArcadeInput, speed: number, dt: number, min: number, max: number) {
  let nx = x;
  if (input.left) nx -= speed * dt;
  if (input.right) nx += speed * dt;
  if (input.pointerDown && input.pointer) {
    const want = input.pointer.x;
    const step = speed * 1.6 * dt;
    nx = Math.abs(want - nx) <= step ? want : nx + Math.sign(want - nx) * step;
  }
  return clamp(nx, min, max);
}

// ── 夾娃娃 ─────────────────────────────────────────────

type PlushKind = 'bear' | 'bunny' | 'chick' | 'cat' | 'octo';
const PLUSH: Record<PlushKind, { name: string; color: string; r: number }> = {
  bear: { name: '小熊', color: '#c48a5a', r: 24 },
  bunny: { name: '兔兔', color: '#f3e6e8', r: 22 },
  chick: { name: '小雞', color: '#f6d55c', r: 19 },
  cat: { name: '招財貓', color: '#fbf4e8', r: 23 },
  octo: { name: '小章魚', color: '#f08fb0', r: 21 },
};

interface Plush {
  kind: PlushKind;
  x: number;
  y: number;
  vy: number;
  rot: number;
  /** 掉進出貨口了 */
  won?: boolean;
}

function drawPlush(g: CanvasRenderingContext2D, p: Plush) {
  const { color, r } = PLUSH[p.kind];
  g.save();
  g.translate(p.x, p.y);
  g.rotate(p.rot);
  g.fillStyle = color;
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  // 耳朵、觸手
  const ear = (x: number, y: number, rx: number, ry: number, fill = color) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    g.stroke();
  };
  if (p.kind === 'bear') {
    ear(-r * 0.7, -r * 0.75, r * 0.32, r * 0.32);
    ear(r * 0.7, -r * 0.75, r * 0.32, r * 0.32);
  } else if (p.kind === 'bunny') {
    ear(-r * 0.4, -r * 1.05, r * 0.2, r * 0.55);
    ear(r * 0.4, -r * 1.05, r * 0.2, r * 0.55);
  } else if (p.kind === 'cat') {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * r * 0.85, -r * 0.35);
      g.lineTo(s * r * 0.6, -r * 1.05);
      g.lineTo(s * r * 0.15, -r * 0.8);
      g.closePath();
      g.fillStyle = color;
      g.fill();
      g.stroke();
    }
  } else if (p.kind === 'octo') {
    for (let i = -2; i <= 2; i++) ear(i * r * 0.38, r * 0.75, r * 0.17, r * 0.4);
  }
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.stroke();
  if (p.kind === 'chick') {
    g.fillStyle = '#f08a3c';
    g.beginPath();
    g.moveTo(-5, 4);
    g.lineTo(5, 4);
    g.lineTo(0, 10);
    g.closePath();
    g.fill();
  }
  if (p.kind === 'cat') {
    g.fillStyle = C.red;
    g.fillRect(-r * 0.6, r * 0.55, r * 1.2, 4);
    g.fillStyle = C.amber;
    g.beginPath();
    g.arc(0, r * 0.75, 4, 0, Math.PI * 2);
    g.fill();
  }
  // 臉
  g.fillStyle = '#2a2220';
  g.beginPath();
  g.arc(-r * 0.32, -r * 0.1, 2.6, 0, Math.PI * 2);
  g.arc(r * 0.32, -r * 0.1, 2.6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(233,91,75,0.45)';
  g.beginPath();
  g.arc(-r * 0.55, r * 0.2, 3.5, 0, Math.PI * 2);
  g.arc(r * 0.55, r * 0.2, 3.5, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

const CLAW_TOP = 70;
const PIT_FLOOR = 412;
const CHUTE = { minX: 22, maxX: 92, top: 330 };
const CLAW_TRIES = 6;
const AIM_SECONDS = 15;

function createClaw(): ArcadeRun {
  const plushes: Plush[] = [];
  const kinds = Object.keys(PLUSH) as PlushKind[];
  const restock = () => {
    while (plushes.filter((p) => !p.won).length < 9) {
      const kind = pick(kinds);
      const r = PLUSH[kind].r;
      plushes.push({
        kind,
        x: rand(110 + r, 332 - r),
        y: rand(-60, 0),
        vy: 0,
        rot: rand(-0.4, 0.4),
      });
    }
  };
  restock();

  let tries = CLAW_TRIES;
  let phase: 'aim' | 'drop' | 'grab' | 'lift' | 'carry' | 'release' | 'return' = 'aim';
  let clawX = 200;
  let clawY = CLAW_TOP;
  let open = 1; // 1 = 張開、0 = 合起來
  let timer = AIM_SECONDS;
  let held: Plush | null = null;
  /** 抓牢了（不會半路掉下來） */
  let secure = false;
  let slipAt = 0;
  const won: string[] = [];
  const floaters: Floater[] = [];
  let message = '';
  let messageT = 0;

  /** 娃娃落下堆疊：碰到地板或其他娃娃就停 */
  const settle = (dt: number) => {
    for (const p of plushes) {
      if (p === held || p.won === true) continue;
      const r = PLUSH[p.kind].r;
      p.vy += 900 * dt;
      let ny = p.y + p.vy * dt;
      let floor = PIT_FLOOR - r;
      let under: Plush | null = null;
      for (const q of plushes) {
        if (q === p || q === held || q.won || q.y <= p.y) continue;
        const dx = q.x - p.x;
        const rr = r + PLUSH[q.kind].r - 6;
        if (Math.abs(dx) < rr) {
          const top = q.y - Math.sqrt(rr * rr - dx * dx);
          if (top < floor) {
            floor = top;
            under = q;
          }
        }
      }
      if (ny >= floor) {
        ny = Math.max(p.y - 40 * dt, floor);
        p.vy = 0;
        // 疊在別隻上面會往旁邊滾下來，不會疊成高塔
        if (under) {
          const away = p.x === under.x ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(p.x - under.x);
          p.x = clamp(p.x + away * 70 * dt, CHUTE.maxX + 8 + r, ARCADE_W - 8 - r);
        }
      }
      p.y = ny;
    }
    // 掉進出貨口的娃娃往下掉出畫面
    for (const p of plushes) if (p.won) p.y += 300 * dt;
  };

  const run: ArcadeRun = {
    score: 0,
    over: false,
    status: `剩 ${CLAW_TRIES} 次`,
    get summary() {
      return won.length ? `夾到：${won.join('、')}` : '下次一定夾得到！';
    },
    update(dt, input) {
      settle(dt);
      updateFloaters(floaters, dt);
      if (messageT > 0) messageT -= dt;
      switch (phase) {
        case 'aim': {
          timer -= dt;
          clawX = steer(clawX, input, 150, dt, 60, 330);
          if (input.action || timer <= 0) phase = 'drop';
          break;
        }
        case 'drop': {
          // 爪子往下，碰到娃娃頂端或地板就停
          let stop = PIT_FLOOR - 26;
          for (const p of plushes) {
            if (p.won) continue;
            const r = PLUSH[p.kind].r;
            if (Math.abs(p.x - clawX) < r) stop = Math.min(stop, p.y - r * 0.2);
          }
          clawY += 210 * dt;
          if (clawY >= stop) {
            clawY = stop;
            phase = 'grab';
          }
          break;
        }
        case 'grab': {
          open = Math.max(0, open - dt * 2.5);
          if (open > 0) break;
          // 爪子正下方最上面的那隻
          let best: Plush | null = null;
          for (const p of plushes) {
            if (p.won) continue;
            const r = PLUSH[p.kind].r;
            const dx = Math.abs(p.x - clawX);
            if (dx < r + 4 && Math.abs(p.y - clawY) < r * 1.4 && (!best || p.y < best.y)) best = p;
          }
          if (best) {
            const aligned = 1 - Math.abs(best.x - clawX) / (PLUSH[best.kind].r + 4);
            secure = Math.random() < 0.18 + aligned * 0.6;
            slipAt = rand(CLAW_TOP + 20, clawY - 10);
            held = best;
          }
          phase = 'lift';
          break;
        }
        case 'lift': {
          clawY -= 150 * dt;
          if (held) {
            held.x += (clawX - held.x) * Math.min(1, dt * 8);
            held.y = clawY + PLUSH[held.kind].r * 0.9;
            if (!secure && clawY < slipAt) {
              held.vy = 0;
              held = null;
              message = '啊！滑掉了';
              messageT = 1.2;
            }
          }
          if (clawY <= CLAW_TOP) {
            clawY = CLAW_TOP;
            phase = held ? 'carry' : 'return';
            if (!held) open = 1;
          }
          break;
        }
        case 'carry': {
          clawX -= 140 * dt;
          if (held) {
            held.x = clawX;
            held.y = clawY + PLUSH[held.kind].r * 0.9;
            // 搬運途中還是有一點機會晃掉
            if (!secure && Math.random() < dt * 0.6) {
              held.vy = 0;
              held = null;
              message = '晃掉了…';
              messageT = 1.2;
            }
          }
          if (clawX <= (CHUTE.minX + CHUTE.maxX) / 2) phase = 'release';
          break;
        }
        case 'release': {
          open = Math.min(1, open + dt * 3);
          if (held) {
            held.won = true;
            won.push(PLUSH[held.kind].name);
            run.score += 1;
            floaters.push({
              x: clawX + 30,
              y: CHUTE.top - 30,
              t: 0,
              s: `${PLUSH[held.kind].name}！`,
              color: C.amber,
            });
            message = `夾到${PLUSH[held.kind].name}了！`;
            messageT = 1.5;
            held = null;
          }
          if (open >= 1) phase = 'return';
          break;
        }
        case 'return': {
          open = Math.min(1, open + dt * 3);
          clawX = Math.min(200, clawX + 160 * dt);
          if (clawX >= 200 && open >= 1) {
            tries -= 1;
            if (tries <= 0) {
              run.over = true;
            } else {
              phase = 'aim';
              timer = AIM_SECONDS;
              restock();
            }
          }
          break;
        }
      }
      run.status = phase === 'aim' ? `剩 ${tries} 次 · ${Math.ceil(timer)} 秒` : `剩 ${tries} 次`;
    },
    draw(g, time) {
      // 機台內部
      const bg = g.createLinearGradient(0, 0, 0, ARCADE_H);
      bg.addColorStop(0, '#3a2a52');
      bg.addColorStop(1, '#1d1530');
      g.fillStyle = bg;
      g.fillRect(0, 0, ARCADE_W, ARCADE_H);
      // 後面的燈泡
      for (let i = 0; i < 12; i++) {
        const on = (Math.floor(time * 4) + i) % 3 === 0;
        g.fillStyle = on ? C.amber : 'rgba(242,181,82,0.25)';
        g.beginPath();
        g.arc(20 + i * 29.1, 22, 5, 0, Math.PI * 2);
        g.fill();
      }
      // 地板與出貨口
      g.fillStyle = '#5b4380';
      g.fillRect(0, PIT_FLOOR, ARCADE_W, ARCADE_H - PIT_FLOOR);
      g.fillStyle = '#120c1c';
      g.fillRect(CHUTE.minX, CHUTE.top, CHUTE.maxX - CHUTE.minX, ARCADE_H - CHUTE.top);
      g.strokeStyle = C.cyan;
      g.lineWidth = 3;
      g.strokeRect(CHUTE.minX, CHUTE.top, CHUTE.maxX - CHUTE.minX, ARCADE_H - CHUTE.top);
      text(g, '出口', (CHUTE.minX + CHUTE.maxX) / 2, CHUTE.top + 22, 14, C.cyan);
      for (const p of plushes) if (p !== held) drawPlush(g, p);
      // 天車軌道與繩子
      g.fillStyle = '#8a8fa0';
      g.fillRect(14, CLAW_TOP - 32, ARCADE_W - 28, 6);
      g.strokeStyle = '#c9ccd6';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(clawX, CLAW_TOP - 26);
      g.lineTo(clawX, clawY - 10);
      g.stroke();
      if (held) drawPlush(g, held);
      // 爪子：中心 + 三支爪
      g.fillStyle = '#c9ccd6';
      roundRect(g, clawX - 12, clawY - 14, 24, 14, 4);
      g.fill();
      g.strokeStyle = '#c9ccd6';
      g.lineWidth = 4;
      g.lineCap = 'round';
      const spread = 6 + open * 16;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(clawX + s * 8, clawY - 2);
        g.lineTo(clawX + s * spread, clawY + 16);
        g.lineTo(clawX + s * (spread - 8 - open * 2), clawY + 30);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(clawX, clawY);
      g.lineTo(clawX, clawY + 26);
      g.stroke();
      g.lineCap = 'butt';
      // 瞄準線
      if (phase === 'aim') {
        g.setLineDash([4, 6]);
        g.strokeStyle = 'rgba(242,218,182,0.35)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(clawX, clawY + 34);
        g.lineTo(clawX, PIT_FLOOR);
        g.stroke();
        g.setLineDash([]);
      }
      // 玻璃反光
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.beginPath();
      g.moveTo(240, 0);
      g.lineTo(300, 0);
      g.lineTo(150, ARCADE_H);
      g.lineTo(90, ARCADE_H);
      g.fill();
      drawFloaters(g, floaters);
      if (messageT > 0) {
        g.globalAlpha = Math.min(1, messageT * 2);
        text(g, message, ARCADE_W / 2, 160, 24, C.cream);
        g.globalAlpha = 1;
      }
    },
  };
  return run;
}

// ── 打地鼠 ─────────────────────────────────────────────

const MOLE_SECONDS = 30;
/** 1～9 對應九個洞（數字鍵盤排列：7 8 9 在上排），也可以用 QWE／ASD／ZXC */
const MOLE_KEYS: Record<string, number> = {
  Numpad7: 0,
  Numpad8: 1,
  Numpad9: 2,
  Numpad4: 3,
  Numpad5: 4,
  Numpad6: 5,
  Numpad1: 6,
  Numpad2: 7,
  Numpad3: 8,
  Digit7: 0,
  Digit8: 1,
  Digit9: 2,
  Digit4: 3,
  Digit5: 4,
  Digit6: 5,
  Digit1: 6,
  Digit2: 7,
  Digit3: 8,
  KeyQ: 0,
  KeyW: 1,
  KeyE: 2,
  KeyA: 3,
  KeyS: 4,
  KeyD: 5,
  KeyZ: 6,
  KeyX: 7,
  KeyC: 8,
};

interface Hole {
  x: number;
  y: number;
  /** 'none' 沒東西、'up' 冒出來、'hit' 被打到 */
  state: 'none' | 'up' | 'hit';
  type: 'mole' | 'gold' | 'bomb';
  /** 這個狀態已經過的時間 */
  t: number;
  life: number;
}

function createMole(): ArcadeRun {
  const holes: Hole[] = Array.from({ length: 9 }, (_, i) => ({
    x: 70 + (i % 3) * 110,
    y: 170 + Math.floor(i / 3) * 105,
    state: 'none',
    type: 'mole',
    t: 0,
    life: 1,
  }));
  let left = MOLE_SECONDS;
  let spawn = 0.4;
  let combo = 0;
  const floaters: Floater[] = [];
  let shake = 0;

  const whack = (i: number) => {
    const h = holes[i];
    if (!h) return;
    if (h.state !== 'up' || h.t < 0.05) {
      combo = 0;
      return;
    }
    h.state = 'hit';
    h.t = 0;
    if (h.type === 'bomb') {
      run.score = Math.max(0, run.score - 3);
      combo = 0;
      shake = 0.35;
      floaters.push({ x: h.x, y: h.y - 40, t: 0, s: '-3', color: C.red });
      return;
    }
    combo += 1;
    const pts = (h.type === 'gold' ? 3 : 1) + (combo > 0 && combo % 5 === 0 ? 2 : 0);
    run.score += pts;
    floaters.push({
      x: h.x,
      y: h.y - 40,
      t: 0,
      s: combo % 5 === 0 ? `+${pts} 連擊！` : `+${pts}`,
      color: h.type === 'gold' ? C.amber : C.cream,
    });
  };

  const run: ArcadeRun = {
    score: 0,
    over: false,
    status: `${MOLE_SECONDS} 秒`,
    update(dt, input) {
      left -= dt;
      shake = Math.max(0, shake - dt);
      updateFloaters(floaters, dt);
      const progress = 1 - left / MOLE_SECONDS;
      spawn -= dt;
      if (spawn <= 0) {
        spawn = 0.85 - progress * 0.45;
        const free = holes.filter((h) => h.state === 'none');
        if (free.length) {
          const h = pick(free);
          const r = Math.random();
          h.state = 'up';
          h.type = r < 0.12 ? 'gold' : r < 0.12 + 0.1 + progress * 0.08 ? 'bomb' : 'mole';
          h.t = 0;
          h.life = 1.25 - progress * 0.55;
        }
      }
      for (const h of holes) {
        h.t += dt;
        if (h.state === 'up' && h.t > h.life) {
          if (h.type !== 'bomb') combo = 0;
          h.state = 'none';
          h.t = 0;
        } else if (h.state === 'hit' && h.t > 0.35) {
          h.state = 'none';
          h.t = 0;
        }
      }
      for (const tap of input.taps) {
        let hit = -1;
        holes.forEach((h, i) => {
          if (Math.abs(tap.x - h.x) < 52 && tap.y > h.y - 85 && tap.y < h.y + 30) hit = i;
        });
        if (hit >= 0) whack(hit);
      }
      for (const k of input.keys) if (k in MOLE_KEYS) whack(MOLE_KEYS[k]!);
      run.status = `${Math.max(0, Math.ceil(left))} 秒`;
      if (left <= 0) run.over = true;
    },
    draw(g, time) {
      g.save();
      if (shake > 0) g.translate(rand(-5, 5) * shake * 3, rand(-5, 5) * shake * 3);
      g.fillStyle = '#6aa85a';
      g.fillRect(-10, -10, ARCADE_W + 20, ARCADE_H + 20);
      // 草地條紋
      g.fillStyle = 'rgba(0,0,0,0.06)';
      for (let y = 0; y < ARCADE_H; y += 40) g.fillRect(0, y, ARCADE_W, 20);
      text(g, '打到金色的 +3、別打炸彈！', ARCADE_W / 2, 80, 15, 'rgba(36,52,77,0.75)');
      for (const h of holes) {
        // 洞
        g.fillStyle = '#3b2a1e';
        g.beginPath();
        g.ellipse(h.x, h.y, 44, 16, 0, 0, Math.PI * 2);
        g.fill();
        if (h.state !== 'none') {
          const k =
            h.state === 'up'
              ? Math.min(1, h.t / 0.12) * Math.min(1, (h.life - h.t) / 0.12 + 0.2)
              : 1 - h.t / 0.35;
          const rise = clamp(k, 0, 1) * 52;
          g.save();
          g.beginPath();
          g.rect(h.x - 50, h.y - 110, 100, 110);
          g.clip();
          const cy = h.y - rise + 18;
          if (h.type === 'bomb') {
            g.fillStyle = '#2a2a34';
            g.beginPath();
            g.arc(h.x, cy, 26, 0, Math.PI * 2);
            g.fill();
            g.strokeStyle = '#d9a35a';
            g.lineWidth = 3;
            g.beginPath();
            g.moveTo(h.x + 12, cy - 22);
            g.quadraticCurveTo(h.x + 22, cy - 36, h.x + 14, cy - 42);
            g.stroke();
            g.fillStyle = Math.floor(time * 12) % 2 ? C.amber : C.red;
            g.beginPath();
            g.arc(h.x + 14, cy - 43, 4, 0, Math.PI * 2);
            g.fill();
            text(g, '✕', h.x, cy, 22, C.red);
          } else {
            const body = h.type === 'gold' ? '#f2c14e' : '#9a6b4a';
            g.fillStyle = body;
            roundRect(g, h.x - 28, cy - 30, 56, 70, 26);
            g.fill();
            g.fillStyle = h.type === 'gold' ? '#fbe6a8' : '#d9b48f';
            g.beginPath();
            g.ellipse(h.x, cy + 6, 16, 12, 0, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = '#2a2220';
            if (h.state === 'hit') {
              text(g, '× ×', h.x, cy - 10, 14, '#2a2220');
            } else {
              g.beginPath();
              g.arc(h.x - 10, cy - 10, 3.5, 0, Math.PI * 2);
              g.arc(h.x + 10, cy - 10, 3.5, 0, Math.PI * 2);
              g.fill();
            }
            g.fillStyle = C.pink;
            g.beginPath();
            g.arc(h.x, cy + 1, 4, 0, Math.PI * 2);
            g.fill();
          }
          g.restore();
          if (h.state === 'hit' && h.type !== 'bomb') {
            g.strokeStyle = C.amber;
            g.lineWidth = 3;
            for (let a = 0; a < 6; a++) {
              const ang = (a / 6) * Math.PI * 2;
              const r0 = 30 + h.t * 60;
              g.beginPath();
              g.moveTo(h.x + Math.cos(ang) * r0, h.y - 40 + Math.sin(ang) * r0);
              g.lineTo(h.x + Math.cos(ang) * (r0 + 10), h.y - 40 + Math.sin(ang) * (r0 + 10));
              g.stroke();
            }
          }
        }
        // 洞的前緣（擋住身體下半）
        g.fillStyle = '#5a8a4a';
        g.beginPath();
        g.ellipse(h.x, h.y + 6, 48, 12, 0, 0, Math.PI);
        g.fill();
      }
      drawFloaters(g, floaters);
      if (combo >= 3) text(g, `${combo} 連擊`, ARCADE_W / 2, 460, 18, C.cream);
      g.restore();
    },
  };
  return run;
}

// ── 星際巡航（太空射擊） ───────────────────────────────

interface Foe {
  x: number;
  y: number;
  hp: number;
  big: boolean;
  t: number;
  baseX: number;
  vy: number;
  fireIn: number;
}

function createBlaster(): ArcadeRun {
  let shipX = ARCADE_W / 2;
  const shipY = 430;
  let lives = 3;
  let invuln = 1;
  let fireCd = 0;
  let spawnCd = 1;
  let elapsed = 0;
  const shots: { x: number; y: number }[] = [];
  const foeShots: { x: number; y: number; vx: number; vy: number }[] = [];
  const foes: Foe[] = [];
  const sparks: { x: number; y: number; vx: number; vy: number; t: number; c: string }[] = [];
  const stars = Array.from({ length: 50 }, () => ({
    x: rand(0, ARCADE_W),
    y: rand(0, ARCADE_H),
    s: rand(20, 90),
  }));
  const floaters: Floater[] = [];

  const boom = (x: number, y: number, c: string, n = 12) => {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(40, 160);
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, c });
    }
  };

  const run: ArcadeRun = {
    score: 0,
    over: false,
    status: '♥♥♥',
    update(dt, input) {
      elapsed += dt;
      const level = 1 + elapsed / 25;
      for (const s of stars) {
        s.y += s.s * dt;
        if (s.y > ARCADE_H) {
          s.y = 0;
          s.x = rand(0, ARCADE_W);
        }
      }
      shipX = steer(shipX, input, 220, dt, 20, ARCADE_W - 20);
      invuln = Math.max(0, invuln - dt);
      fireCd -= dt;
      if (fireCd <= 0) {
        fireCd = 0.2;
        shots.push({ x: shipX - 7, y: shipY - 14 }, { x: shipX + 7, y: shipY - 14 });
      }
      for (const s of shots) s.y -= 480 * dt;
      while (shots.length && shots[0]!.y < -10) shots.shift();

      spawnCd -= dt;
      if (spawnCd <= 0) {
        // 一波：一排小飛碟，偶爾夾一台大的
        const n = Math.min(6, 2 + Math.floor(level));
        const x0 = rand(40, ARCADE_W - 40 - (n - 1) * 46 > 40 ? ARCADE_W - 40 - (n - 1) * 46 : 40);
        for (let i = 0; i < n; i++) {
          const big = Math.random() < 0.12 * level;
          foes.push({
            x: x0 + i * 46,
            baseX: x0 + i * 46,
            y: -20 - (i % 2) * 24,
            hp: big ? 4 : 1,
            big,
            t: rand(0, 6),
            vy: 45 + level * 10,
            fireIn: rand(1.5, 4) / level,
          });
        }
        spawnCd = Math.max(1.4, 3.4 - level * 0.4);
      }
      for (const f of foes) {
        f.t += dt;
        f.y += f.vy * dt;
        f.x = clamp(f.baseX + Math.sin(f.t * 1.6) * 30, 16, ARCADE_W - 16);
        f.fireIn -= dt;
        if (f.fireIn <= 0 && f.y > 0 && f.y < shipY - 120) {
          f.fireIn = rand(2, 4.5) / Math.sqrt(level);
          const dx = shipX - f.x;
          const dy = shipY - f.y;
          const len = Math.hypot(dx, dy);
          foeShots.push({ x: f.x, y: f.y + 10, vx: (dx / len) * 150, vy: (dy / len) * 150 });
        }
      }
      for (const s of foeShots) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
      // 子彈打中敵人
      for (const s of shots) {
        for (const f of foes) {
          const r = f.big ? 22 : 14;
          if (f.hp > 0 && Math.abs(s.x - f.x) < r && Math.abs(s.y - f.y) < r) {
            f.hp -= 1;
            s.y = -100;
            if (f.hp <= 0) {
              const pts = f.big ? 50 : 10;
              run.score += pts;
              boom(f.x, f.y, f.big ? C.amber : C.cyan, f.big ? 24 : 12);
              floaters.push({ x: f.x, y: f.y, t: 0, s: `+${pts}`, color: C.cream });
            } else {
              boom(s.x, s.y, C.cream, 3);
            }
          }
        }
      }
      // 自己被打中或撞到
      const hurt = () => {
        if (invuln > 0) return;
        lives -= 1;
        invuln = 1.6;
        boom(shipX, shipY, C.red, 24);
        if (lives <= 0) run.over = true;
      };
      for (const s of foeShots) {
        if (Math.abs(s.x - shipX) < 12 && Math.abs(s.y - shipY) < 14) {
          s.y = ARCADE_H + 100;
          hurt();
        }
      }
      for (const f of foes) {
        const r = f.big ? 24 : 16;
        if (f.hp > 0 && Math.abs(f.x - shipX) < r + 10 && Math.abs(f.y - shipY) < r + 10) {
          f.hp = 0;
          boom(f.x, f.y, C.red);
          hurt();
        }
      }
      for (let i = foes.length - 1; i >= 0; i--) {
        if (foes[i]!.hp <= 0 || foes[i]!.y > ARCADE_H + 30) foes.splice(i, 1);
      }
      for (let i = foeShots.length - 1; i >= 0; i--) {
        const s = foeShots[i]!;
        if (s.y > ARCADE_H + 10 || s.x < -10 || s.x > ARCADE_W + 10) foeShots.splice(i, 1);
      }
      for (const p of sparks) {
        p.t += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      while (sparks.length && sparks[0]!.t > 0.6) sparks.shift();
      updateFloaters(floaters, dt);
      run.status = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
    },
    draw(g) {
      g.fillStyle = '#0b0a1a';
      g.fillRect(0, 0, ARCADE_W, ARCADE_H);
      for (const s of stars) {
        g.fillStyle = s.s > 60 ? 'rgba(242,218,182,0.9)' : 'rgba(242,218,182,0.4)';
        g.fillRect(s.x, s.y, s.s > 60 ? 2 : 1, s.s > 60 ? 2 : 1);
      }
      g.fillStyle = C.amber;
      for (const s of shots) g.fillRect(s.x - 1.5, s.y - 6, 3, 10);
      g.fillStyle = C.pink;
      for (const s of foeShots) {
        g.beginPath();
        g.arc(s.x, s.y, 4, 0, Math.PI * 2);
        g.fill();
      }
      for (const f of foes) {
        const r = f.big ? 20 : 13;
        g.fillStyle = f.big ? C.violet : C.cyan;
        g.beginPath();
        g.ellipse(f.x, f.y, r * 1.2, r * 0.55, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = f.big ? '#d6c8ff' : '#c9f2f4';
        g.beginPath();
        g.arc(f.x, f.y - r * 0.3, r * 0.55, Math.PI, 0);
        g.fill();
        if (f.big) {
          g.fillStyle = C.red;
          g.fillRect(f.x - 16, f.y + 14, (32 * f.hp) / 4, 3);
        }
      }
      // 自己的船（無敵時閃爍）
      if (!run.over && (invuln <= 0 || Math.floor(invuln * 10) % 2 === 0)) {
        g.fillStyle = C.cream;
        g.beginPath();
        g.moveTo(shipX, shipY - 18);
        g.lineTo(shipX + 16, shipY + 12);
        g.lineTo(shipX, shipY + 6);
        g.lineTo(shipX - 16, shipY + 12);
        g.closePath();
        g.fill();
        g.fillStyle = C.red;
        g.fillRect(shipX - 3, shipY - 6, 6, 8);
        g.fillStyle = C.amber;
        g.beginPath();
        g.moveTo(shipX - 5, shipY + 9);
        g.lineTo(shipX, shipY + 18 + Math.random() * 6);
        g.lineTo(shipX + 5, shipY + 9);
        g.fill();
      }
      for (const p of sparks) {
        g.globalAlpha = 1 - p.t / 0.6;
        g.fillStyle = p.c;
        g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      g.globalAlpha = 1;
      drawFloaters(g, floaters);
    },
  };
  return run;
}

// ── 磚塊爆破 ───────────────────────────────────────────

const BRICK_COLS = 8;
const BRICK_ROWS = 6;
const BRICK_COLORS = [C.red, '#f08a3c', C.amber, C.green, C.cyan, C.violet];

function createBricks(): ArcadeRun {
  const padY = 440;
  const padW = 70;
  let padX = ARCADE_W / 2;
  let lives = 3;
  let level = 1;
  let ball = { x: padX, y: padY - 12, vx: 0, vy: 0, stuck: true };
  let bricks: { x: number; y: number; hp: number; row: number }[] = [];
  const floaters: Floater[] = [];
  const bw = (ARCADE_W - 20) / BRICK_COLS;
  const bh = 18;
  const build = () => {
    bricks = [];
    for (let r = 0; r < BRICK_ROWS; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        // 第二關以後上排要打兩下
        bricks.push({
          x: 10 + c * bw,
          y: 70 + r * (bh + 4),
          hp: level > 1 && r < 2 ? 2 : 1,
          row: r,
        });
      }
    }
  };
  build();
  const speed = () => 280 + level * 30;
  const launch = () => {
    const a = rand(-0.5, 0.5);
    ball = { ...ball, vx: Math.sin(a) * speed(), vy: -Math.cos(a) * speed(), stuck: false };
  };

  const run: ArcadeRun = {
    score: 0,
    over: false,
    status: '♥♥♥',
    update(dt, input) {
      padX = steer(padX, input, 320, dt, padW / 2, ARCADE_W - padW / 2);
      if (input.pointer && !input.pointerDown && input.pointerMoved) {
        // 滑鼠移動（沒按著）也能控制球拍
        padX = clamp(input.pointer.x, padW / 2, ARCADE_W - padW / 2);
      }
      if (ball.stuck) {
        ball.x = padX;
        ball.y = padY - 12;
        if (input.action || input.taps.length) launch();
      } else {
        // 分成小步，球快的時候也不會穿過磚塊
        const steps = 4;
        for (let i = 0; i < steps; i++) {
          const h = dt / steps;
          ball.x += ball.vx * h;
          ball.y += ball.vy * h;
          if (ball.x < 6) {
            ball.x = 6;
            ball.vx = Math.abs(ball.vx);
          }
          if (ball.x > ARCADE_W - 6) {
            ball.x = ARCADE_W - 6;
            ball.vx = -Math.abs(ball.vx);
          }
          if (ball.y < 40) {
            ball.y = 40;
            ball.vy = Math.abs(ball.vy);
          }
          // 球拍：依打到的位置決定反彈角度
          if (
            ball.vy > 0 &&
            ball.y > padY - 12 &&
            ball.y < padY + 6 &&
            Math.abs(ball.x - padX) < padW / 2 + 6
          ) {
            const off = clamp((ball.x - padX) / (padW / 2), -1, 1);
            const a = off * 1.05;
            ball.vx = Math.sin(a) * speed();
            ball.vy = -Math.cos(a) * speed();
            ball.y = padY - 12;
          }
          for (const b of bricks) {
            if (b.hp <= 0) continue;
            if (
              ball.x > b.x - 6 &&
              ball.x < b.x + bw - 2 + 6 &&
              ball.y > b.y - 6 &&
              ball.y < b.y + bh + 6
            ) {
              b.hp -= 1;
              // 從哪一邊撞進來就往那一邊彈
              const fromSide = ball.x < b.x || ball.x > b.x + bw - 2;
              if (fromSide) ball.vx = -ball.vx;
              else ball.vy = -ball.vy;
              if (b.hp <= 0) {
                const pts = (BRICK_ROWS - b.row) * 5;
                run.score += pts;
                floaters.push({ x: b.x + bw / 2, y: b.y, t: 0, s: `+${pts}`, color: C.cream });
              }
              break;
            }
          }
        }
        if (ball.y > ARCADE_H + 10) {
          lives -= 1;
          ball.stuck = true;
          if (lives <= 0) run.over = true;
        }
        if (bricks.every((b) => b.hp <= 0)) {
          level += 1;
          run.score += 100;
          floaters.push({
            x: ARCADE_W / 2,
            y: 240,
            t: 0,
            s: `第 ${level} 關 +100`,
            color: C.amber,
          });
          build();
          ball.stuck = true;
        }
      }
      updateFloaters(floaters, dt);
      run.status = `第 ${level} 關 ${'♥'.repeat(Math.max(0, lives))}`;
    },
    draw(g) {
      const bg = g.createLinearGradient(0, 0, 0, ARCADE_H);
      bg.addColorStop(0, '#1b2238');
      bg.addColorStop(1, '#2c1f3d');
      g.fillStyle = bg;
      g.fillRect(0, 0, ARCADE_W, ARCADE_H);
      g.strokeStyle = 'rgba(92,194,201,0.08)';
      g.lineWidth = 1;
      for (let x = 0; x < ARCADE_W; x += 24) {
        g.beginPath();
        g.moveTo(x, 40);
        g.lineTo(x, ARCADE_H);
        g.stroke();
      }
      g.fillStyle = 'rgba(242,218,182,0.25)';
      g.fillRect(0, 36, ARCADE_W, 4);
      for (const b of bricks) {
        if (b.hp <= 0) continue;
        g.fillStyle = BRICK_COLORS[b.row]!;
        roundRect(g, b.x, b.y, bw - 3, bh, 4);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(b.x + 3, b.y + 3, bw - 9, 4);
        if (b.hp > 1) {
          g.strokeStyle = C.cream;
          g.lineWidth = 2;
          roundRect(g, b.x + 1, b.y + 1, bw - 5, bh - 2, 3);
          g.stroke();
        }
      }
      g.fillStyle = C.cream;
      roundRect(g, padX - padW / 2, padY, padW, 10, 5);
      g.fill();
      g.fillStyle = C.red;
      g.fillRect(padX - 8, padY + 2, 16, 6);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(ball.x, ball.y, 6, 0, Math.PI * 2);
      g.fill();
      if (ball.stuck && !run.over)
        text(g, '按一下發球', ARCADE_W / 2, 300, 18, 'rgba(242,218,182,0.8)');
      drawFloaters(g, floaters);
    },
  };
  return run;
}

// ── 街頭投籃 ───────────────────────────────────────────

const HOOP_SECONDS = 45;
const HOOP_Y = 150;
const BALL_START = { x: ARCADE_W / 2, y: 440 };
const FLIGHT = 0.75;

interface Shot {
  t: number;
  targetX: number;
  /** 進框後往下掉、或彈出去 */
  result: 'flying' | 'in' | 'out';
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
}

function createHoops(): ArcadeRun {
  let left = HOOP_SECONDS;
  let aimT = 0;
  let cd = 0;
  let streak = 0;
  let netWiggle = 0;
  const shots: Shot[] = [];
  const floaters: Floater[] = [];
  const hoopX = () => {
    // 後半場籃框開始左右移動
    const moving = Math.max(0, HOOP_SECONDS / 2 - left);
    return ARCADE_W / 2 + Math.sin(moving * 1.4) * Math.min(90, moving * 12);
  };
  const aimX = () => ARCADE_W / 2 + Math.sin(aimT * 2.6) * 130;

  const run: ArcadeRun = {
    score: 0,
    over: false,
    status: `${HOOP_SECONDS} 秒`,
    update(dt, input) {
      left -= dt;
      aimT += dt;
      cd -= dt;
      netWiggle = Math.max(0, netWiggle - dt);
      if ((input.action || input.taps.length > 0) && cd <= 0 && left > 0 && shots.length < 4) {
        cd = 0.32;
        shots.push({
          t: 0,
          targetX: aimX(),
          result: 'flying',
          x: BALL_START.x,
          y: BALL_START.y,
          vx: 0,
          vy: 0,
          s: 1,
        });
      }
      const hx = hoopX();
      for (const s of shots) {
        if (s.result === 'flying') {
          s.t += dt / FLIGHT;
          const t = Math.min(1, s.t);
          s.x = BALL_START.x + (s.targetX - BALL_START.x) * t;
          // 拋物線：先往上超過籃框，最後落到籃框高度
          s.y = BALL_START.y + (HOOP_Y - BALL_START.y) * t - Math.sin(t * Math.PI) * 130;
          s.s = 1 - t * 0.45;
          if (t >= 1) {
            const dx = s.x - hx;
            const ad = Math.abs(dx);
            const lucky = ad < 24 && Math.random() < 0.5;
            if (ad < 11 || lucky) {
              s.result = 'in';
              s.vx = -dx * 2;
              s.vy = 120;
              streak += 1;
              const pts = (left <= 10 ? 3 : 2) + (streak >= 3 ? 1 : 0);
              run.score += pts;
              netWiggle = 0.4;
              floaters.push({
                x: hx,
                y: HOOP_Y - 40,
                t: 0,
                s: ad < 11 ? `空心 +${pts}` : `+${pts}`,
                color: ad < 11 ? C.amber : C.cream,
              });
            } else {
              s.result = 'out';
              streak = 0;
              s.vx = ad < 34 ? Math.sign(dx || 1) * 140 : Math.sign(dx || 1) * 40;
              s.vy = ad < 34 ? -160 : 40;
            }
          }
        } else {
          s.vy += 700 * dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
        }
      }
      for (let i = shots.length - 1; i >= 0; i--)
        if (shots[i]!.y > ARCADE_H + 40) shots.splice(i, 1);
      updateFloaters(floaters, dt);
      run.status = `${Math.max(0, Math.ceil(left))} 秒${left <= 10 && left > 0 ? ' · 3 分球！' : ''}`;
      if (left <= 0 && shots.every((s) => s.result !== 'flying')) run.over = true;
    },
    draw(g, time) {
      // 機台內部：木地板球道 + 霓虹背板
      const bg = g.createLinearGradient(0, 0, 0, ARCADE_H);
      bg.addColorStop(0, '#1d2740');
      bg.addColorStop(0.45, '#2b2440');
      bg.addColorStop(0.46, '#b5763f');
      bg.addColorStop(1, '#8a5530');
      g.fillStyle = bg;
      g.fillRect(0, 0, ARCADE_W, ARCADE_H);
      g.strokeStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.moveTo(ARCADE_W / 2 + (i - 4) * 14, 218);
        g.lineTo(ARCADE_W / 2 + (i - 4) * 70, ARCADE_H);
        g.stroke();
      }
      // 側邊護網
      g.strokeStyle = 'rgba(242,218,182,0.12)';
      for (let y = 0; y < 220; y += 12) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(ARCADE_W, y + 12);
        g.stroke();
      }
      const hx = hoopX();
      // 籃板
      g.fillStyle = 'rgba(242,218,182,0.92)';
      roundRect(g, hx - 60, HOOP_Y - 92, 120, 80, 6);
      g.fill();
      g.strokeStyle = C.red;
      g.lineWidth = 3;
      g.strokeRect(hx - 22, HOOP_Y - 52, 44, 32);
      // 籃網
      const wig = Math.sin(time * 40) * netWiggle * 6;
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 1.5;
      for (let i = -3; i <= 3; i++) {
        g.beginPath();
        g.moveTo(hx + i * 7, HOOP_Y);
        g.lineTo(hx + i * 4 + wig, HOOP_Y + 30);
        g.stroke();
      }
      for (const yy of [10, 20]) {
        g.beginPath();
        g.moveTo(hx - 20 + yy * 0.4, HOOP_Y + yy);
        g.lineTo(hx + 20 - yy * 0.4, HOOP_Y + yy);
        g.stroke();
      }
      // 球（後面的先畫：還沒到籃框的球在籃框後面）
      const drawBall = (s: Shot) => {
        const r = 16 * s.s;
        g.fillStyle = '#e8743b';
        g.beginPath();
        g.arc(s.x, s.y, r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#4a2416';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(s.x, s.y, r, 0, Math.PI * 2);
        g.moveTo(s.x - r, s.y);
        g.lineTo(s.x + r, s.y);
        g.moveTo(s.x, s.y - r);
        g.lineTo(s.x, s.y + r);
        g.stroke();
      };
      for (const s of shots) if (s.result === 'in') drawBall(s);
      // 籃框
      g.strokeStyle = C.red;
      g.lineWidth = 5;
      g.beginPath();
      g.ellipse(hx, HOOP_Y, 24, 6, 0, 0, Math.PI * 2);
      g.stroke();
      for (const s of shots) if (s.result !== 'in') drawBall(s);
      // 瞄準
      if (left > 0) {
        const ax = aimX();
        g.strokeStyle = 'rgba(242,218,182,0.5)';
        g.setLineDash([6, 6]);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(BALL_START.x, BALL_START.y - 20);
        g.quadraticCurveTo((BALL_START.x + ax) / 2, HOOP_Y - 120, ax, HOOP_Y);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = C.amber;
        g.beginPath();
        g.arc(ax, HOOP_Y, 5, 0, Math.PI * 2);
        g.fill();
        if (cd <= 0)
          drawBall({
            t: 0,
            targetX: 0,
            result: 'flying',
            x: BALL_START.x,
            y: BALL_START.y,
            vx: 0,
            vy: 0,
            s: 1,
          });
      }
      if (streak >= 3) text(g, `${streak} 連進！`, ARCADE_W / 2, 250, 20, C.amber);
      drawFloaters(g, floaters);
    },
  };
  return run;
}

// ── 機台表 ─────────────────────────────────────────────

export const ARCADE_SPECS: Record<ArcadeGame, ArcadeSpec> = {
  claw: {
    title: '幸運夾娃娃',
    howto: '← → 移動夾子，空白鍵下爪。對準娃娃正中間比較夾得牢，一局 6 次。',
    howtoTouch: '按住 ◀ ▶ 或在畫面上拖曳移動夾子，按「下爪」。一局 6 次。',
    buttons: [
      { label: '◀', kind: 'left' },
      { label: '下爪', kind: 'action' },
      { label: '▶', kind: 'right' },
    ],
    accent: C.pink,
    create: createClaw,
  },
  mole: {
    title: '敲敲地鼠',
    howto: '點地鼠，或用數字鍵 1～9（數字鍵盤排列）。金色 +3、炸彈 -3，30 秒。',
    howtoTouch: '地鼠冒出來就點牠！金色 +3、炸彈 -3，30 秒。',
    buttons: [],
    accent: C.amber,
    create: createMole,
  },
  blaster: {
    title: '星際巡航',
    howto: '← → 或滑鼠拖曳移動，會自動射擊。閃開粉紅色子彈，三條命。',
    howtoTouch: '按住畫面左右拖曳移動，會自動射擊。三條命。',
    buttons: [
      { label: '◀', kind: 'left' },
      { label: '▶', kind: 'right' },
    ],
    accent: C.cyan,
    create: createBlaster,
  },
  bricks: {
    title: '磚塊爆破',
    howto: '← → 或滑鼠移動球拍，空白鍵發球。打到球拍邊緣角度比較斜，三條命。',
    howtoTouch: '在畫面上拖曳移動球拍，點一下發球。三條命。',
    buttons: [
      { label: '◀', kind: 'left' },
      { label: '發球', kind: 'action' },
      { label: '▶', kind: 'right' },
    ],
    accent: C.violet,
    create: createBricks,
  },
  hoops: {
    title: '街頭投籃',
    howto: '瞄準點會左右擺動，對準籃框時按空白鍵投籃。後半場籃框會動，最後 10 秒 3 分球！',
    howtoTouch: '瞄準點左右擺動，對準籃框時點畫面投籃。後半場籃框會動。',
    buttons: [{ label: '投籃', kind: 'action' }],
    accent: C.red,
    create: createHoops,
  },
};

// ── 最高分（只存在這台裝置） ───────────────────────────

const BEST_KEY = 'xa:arcadeBest';

export function loadBest(game: ArcadeGame): number {
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    const v = raw ? (JSON.parse(raw) as Record<string, unknown>)[game] : 0;
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/** 存最高分；回傳是否破紀錄 */
export function saveBest(game: ArcadeGame, score: number): boolean {
  if (score <= loadBest(game)) return false;
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    all[game] = score;
    window.localStorage.setItem(BEST_KEY, JSON.stringify(all));
  } catch {
    /* 無痕模式：不存 */
  }
  return true;
}
