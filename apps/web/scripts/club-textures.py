#!/usr/bin/env python3
"""
暮光遊樂館街口的 PBR 貼圖產生器（docs/ART_BIBLE_LOBBY.md §4）。

每組貼圖輸出三張 WebP 到 public/club/textures/<name>/：
  albedo.webp  sRGB 底色
  normal.webp  切線空間法線（OpenGL / three.js 慣例，+Y 向上）
  orm.webp     R = AO、G = roughness、B = metalness（glTF 慣例，線性）

所有雜訊都是用 FFT 濾出來的週期性場，所以每張貼圖四邊無縫。固定種子，重跑結果相同。
這是程式繪製的第一版材質，之後掃描或手繪的貼圖用同樣的檔名與通道直接替換即可。

用法：python3 scripts/club-textures.py   （需要 numpy、Pillow）
"""
from __future__ import annotations

import os
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'club', 'textures')


def field(n: int, rng: np.random.Generator, lo: float, hi: float = 0.0, power: float = 1.0) -> np.ndarray:
    """週期性雜訊：只保留波長在 [n/lo, n/hi] 之間的頻率，回傳 0～1"""
    white = rng.standard_normal((n, n))
    f = np.fft.fftfreq(n) * n
    k = np.sqrt(f[:, None] ** 2 + f[None, :] ** 2)
    k[0, 0] = 1
    amp = k ** (-power)
    amp[k < hi] = 0
    amp[k > lo] = 0
    out = np.real(np.fft.ifft2(np.fft.fft2(white) * amp))
    out -= out.min()
    return out / max(out.max(), 1e-9)


def blur(a: np.ndarray, r: float) -> np.ndarray:
    """週期性高斯模糊（FFT）"""
    n = a.shape[0]
    f = np.fft.fftfreq(n)
    g = np.exp(-2 * (np.pi * r) ** 2 * (f[:, None] ** 2 + f[None, :] ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def normal_from_height(h: np.ndarray, strength: float) -> np.ndarray:
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    # 影像的 y 向下，OpenGL 法線的 +Y 向上
    nrm = np.stack([-dx, dy, np.ones_like(h)], -1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    return nrm * 0.5 + 0.5


def cavity_ao(h: np.ndarray, r: float, amount: float) -> np.ndarray:
    """低於周圍平均高度的地方變暗（縫、裂痕、凹洞）"""
    d = h - blur(h, r)
    return np.clip(1 + np.minimum(d, 0) * amount, 0, 1)


def save(name: str, albedo: np.ndarray, height: np.ndarray, rough: np.ndarray, ao: np.ndarray,
         strength: float, metal: np.ndarray | None = None) -> None:
    d = os.path.join(OUT, name)
    os.makedirs(d, exist_ok=True)
    to8 = lambda a: (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(to8(albedo)).save(os.path.join(d, 'albedo.webp'), quality=88, method=6)
    Image.fromarray(to8(normal_from_height(height, strength))).save(
        os.path.join(d, 'normal.webp'), quality=92, method=6)
    m = np.zeros_like(rough) if metal is None else metal
    Image.fromarray(to8(np.stack([ao, rough, m], -1))).save(
        os.path.join(d, 'orm.webp'), quality=92, method=6)
    print('wrote', name)


def srgb(hexes: str) -> np.ndarray:
    return np.array([int(hexes[i:i + 2], 16) / 255 for i in (1, 3, 5)])


def tiles(n: int, cols: int, rows: int, grout: float, bevel: float, offset_rows: bool,
          rng: np.random.Generator):
    """磚格：回傳 (每塊磚的編號, 磚面高度 0～1, 磚內 u, v)"""
    y, x = np.mgrid[0:n, 0:n] / n
    row = np.floor(y * rows).astype(int)
    xs = x * cols + (0.5 * (row % 2) if offset_rows else 0)
    col = np.floor(xs).astype(int) % cols
    u = xs % 1
    v = (y * rows) % 1
    # 到縫的距離（以磚尺寸為單位，橫向與縱向分開，因為磚是長方形）
    gw = grout * cols
    gh = grout * rows
    du = np.minimum(u, 1 - u) / max(gw, 1e-6)
    dv = np.minimum(v, 1 - v) / max(gh, 1e-6)
    d = np.minimum(du, dv)
    face = np.clip((d - 0.5) / max(bevel, 1e-6), 0, 1)
    face = face * face * (3 - 2 * face)
    tid = row * cols + col
    return tid, face, u, v


def asphalt(n: int = 1024) -> None:
    """柏油：粗骨材、修補塊、細裂痕；低窪處積水（粗糙度低）讓夜晚招牌有反光"""
    rng = np.random.default_rng(11)
    aggregate = field(n, rng, n / 2, n / 10, 0.2)
    grains = field(n, rng, n / 1.5, n / 4, 0.0)
    macro = field(n, rng, 10, 1, 1.4)
    patches = field(n, rng, 6, 1, 1.6)
    patch = np.clip((patches - 0.7) * 14, 0, 1)
    # 裂痕：細窄的等高線
    c = field(n, rng, 40, 3, 1.1)
    crack = np.clip(1 - np.abs(c - 0.5) * 90, 0, 1) * np.clip((macro - 0.45) * 5, 0, 1)
    height = aggregate * 0.55 + grains * 0.25 + macro * 0.6 - crack * 0.5 + patch * 0.08
    # 積水：只在最低窪的幾處，邊緣柔和（模糊過），不要變成斑點
    puddle = np.clip(blur(np.clip((0.25 - macro) * 7, 0, 1), 6) * 1.3, 0, 1) * (1 - patch)
    base = np.array([0.20, 0.195, 0.205])
    tone = 0.9 + (macro[..., None] - 0.5) * 0.12 + aggregate[..., None] * 0.3 + (grains[..., None] - 0.5) * 0.25
    albedo = base * tone
    albedo = albedo * (1 - patch[..., None] * 0.5) + patch[..., None] * np.array([0.15, 0.148, 0.155])
    albedo *= (1 - crack[..., None] * 0.55)
    albedo *= (1 - puddle[..., None] * 0.25)
    # 白色骨材點
    spark = (grains > 0.82).astype(float) * (aggregate > 0.55)
    albedo = albedo * (1 - spark[..., None] * 0.6) + spark[..., None] * 0.42
    rough = np.clip(0.86 - aggregate * 0.1 - puddle * 0.5 - patch * 0.06 + crack * 0.08, 0.12, 1)
    ao = cavity_ao(height, 6, 2.6)
    height = height * (1 - puddle * 0.7)
    save('asphalt', albedo, height, rough, ao, 3.2)


def arcade_tile(n: int = 1024) -> None:
    """騎樓地磚：6×6 片 20cm 陶磚（一張貼圖 1.2m）。以紅陶磚為主、深淺兩色交錯（低對比，近看不花），
    每 3 片一條米色磚分隔帶，磚邊磨圓"""
    rng = np.random.default_rng(23)
    cols = rows = 6
    tid, face, u, v = tiles(n, cols, rows, 0.006, 1.2, False, rng)
    per = rng.random(cols * rows + cols)
    tone = per[tid]
    r_, c_ = tid // cols, tid % cols
    checker = ((r_ + c_) % 2 == 0)
    band = (r_ % 3 == 2)
    red = srgb('#a65a43')
    red2 = srgb('#b46a50')
    cream = srgb('#c9a882')
    col = np.where(checker[..., None], red, red2)
    col = np.where(band[..., None], cream, col)
    col = col * (0.88 + tone[..., None] * 0.2)
    clay = field(n, rng, n / 3, n / 40, 0.3)
    wear = field(n, rng, 8, 1, 1.3)
    col = col * (0.92 + clay[..., None] * 0.14)
    # 人走過的地方被磨亮、顏色淡一點
    col = col * (1 + (wear[..., None] - 0.5) * 0.12)
    grout_c = srgb('#6f655c')
    albedo = col * face[..., None] + grout_c * (1 - face[..., None])
    dirt = field(n, rng, 30, 2, 1.2)
    albedo *= (0.9 + dirt[..., None] * 0.12)
    # 磚面微微不平（每片傾斜一點）
    tilt = (per[tid] - 0.5) * 0.06 * (u - 0.5) + (per[(tid + 7) % len(per)] - 0.5) * 0.06 * (v - 0.5)
    height = face * 0.7 + clay * 0.06 + tilt
    rough = np.clip(0.72 - wear * 0.22 + (1 - face) * 0.2 + clay * 0.06, 0.25, 1)
    ao = np.clip(0.55 + face * 0.45, 0, 1) * cavity_ao(height, 4, 1.5)
    save('arcade_tile', albedo, height, rough, ao, 6)


def facade_tile(n: int = 1024) -> None:
    """二丁掛外牆磁磚（1m × 1m）：22.7×6cm 長磚交丁，釉面略反光；
    底色接近白，由材質 color 乘上各棟的牆色，所有建築共用一組。上方雨水留下的直向污漬讓牆面有年代感。"""
    rng = np.random.default_rng(31)
    cols, rows = 4, 14
    tid, face, u, v = tiles(n, cols, rows, 0.007, 0.9, True, rng)
    per = rng.random(cols * rows * 2 + 8)
    tone = per[tid % len(per)]
    col = np.ones((n, n, 3)) * (0.86 + tone[..., None] * 0.14)
    # 窯燒色差：一點點偏暖或偏灰
    warm = (per[(tid + 3) % len(per)] - 0.5)[..., None] * np.array([0.05, 0.02, -0.03])
    col = col + warm
    glaze = field(n, rng, n / 4, n / 30, 0.4)
    col *= (0.96 + glaze[..., None] * 0.06)
    grout_c = np.array([0.62, 0.6, 0.57])
    albedo = col * face[..., None] + grout_c * (1 - face[..., None])
    # 雨痕：x 方向高頻、y 方向拉長的污漬
    s = field(n, rng, 60, 4, 1.0)
    streak = blur(s, 1.5)
    streak = np.repeat(streak.mean(axis=0, keepdims=True), n, 0) * 0.6 + s * 0.4
    streak = np.clip((streak - 0.55) * 3, 0, 1) * 0.5
    albedo *= (1 - streak[..., None] * 0.35)
    height = face * 0.8 + glaze * 0.03
    rough = np.clip(0.42 + (1 - face) * 0.45 + streak * 0.3 - glaze * 0.08, 0.2, 1)
    ao = np.clip(0.6 + face * 0.4, 0, 1)
    save('facade_tile', albedo, height, rough, ao, 5)


def concrete(n: int = 512) -> None:
    """洗石子／水泥（緣石、側牆、遠處地面），底色偏中性，由材質 color 調色"""
    rng = np.random.default_rng(41)
    pores = field(n, rng, n / 1.5, n / 6, 0.0)
    pit = (pores > 0.83).astype(float)
    macro = field(n, rng, 10, 1, 1.3)
    mid = field(n, rng, 60, 6, 0.8)
    height = macro * 0.3 + mid * 0.2 - pit * 0.3
    albedo = np.ones((n, n, 3)) * (0.72 + macro[..., None] * 0.14 + (mid[..., None] - 0.5) * 0.08)
    albedo *= (1 - pit[..., None] * 0.35)
    albedo *= np.array([1.0, 0.98, 0.95])
    rough = np.clip(0.88 - macro * 0.08 + pit * 0.1, 0.4, 1)
    ao = cavity_ao(height, 3, 2.5)
    save('concrete', albedo, height, rough, ao, 2.2)


if __name__ == '__main__':
    asphalt()
    arcade_tile()
    facade_tile()
    concrete()
