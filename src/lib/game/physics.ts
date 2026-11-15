/**
 * «Гаряче коло» — траса й фізика боліда (порт макета https://claude.ai/artifact/SJSnoWCqbF6VfBDDMJiSpw).
 *
 * Детермінізм: фіксований крок 1/120 с, лише + − × ÷ і Math.sqrt (специфікація JS вимагає для них точного
 * округлення IEEE 754), без Math.sin/cos/pow/random. Тому повтор однакового вводу дає той самий час у будь-якому
 * рушії — на цьому тримаються бот і перевірка збереженого рекорду. Відхилення від макета: `**2` у buildTrack
 * замінено на множення (pow не зобов'язаний бути точним — план фази 6).
 */
import TRACKS_JSON from "./tracks.json";

export const TRACK_KEYS = ["lyman", "port", "plateau", "forest"] as const;
export type TrackKey = (typeof TRACK_KEYS)[number];

export type TrackSpec = {
  /** Опорні точки осі траси (м), замкнений контур. */
  raw: [number, number][];
  /** Довжина кола (м): вісь масштабується рівно до неї. */
  len: number;
  /** Кількість точок осі після перерозбиття. */
  N: number;
  /** Скільки проміжних точок Catmull-Rom між опорними. */
  sub: number;
  /** Пів ширини асфальту (м). */
  HW: number;
  /** Відстань від осі до стіни (м). */
  WALL: number;
  /** Опір поза асфальтом (трава / пісок). */
  OFFDRAG: number;
  /** Час бота в тіках (1/120 с) і його ввід (RLE). */
  botTicks: number;
  botInputs: string;
};

export const TRACK_SPECS = TRACKS_JSON as unknown as Record<TrackKey, TrackSpec>;

export const isTrackKey = (k: string): k is TrackKey => (TRACK_KEYS as readonly string[]).includes(k);

export const DT = 1 / 120;
export const TPS = 120;

/** Біти вводу: газ, гальмо, ліворуч, праворуч. */
export const IN_UP = 1;
export const IN_DOWN = 2;
export const IN_LEFT = 4;
export const IN_RIGHT = 8;

export type Track = {
  key: TrackKey;
  HW: number;
  WALL: number;
  OFFDRAG: number;
  len: number;
  N: number;
  /** Точки осі: x0, y0, x1, y1… */
  P: Float64Array;
  /** Межі секторів (індекси точок) і місце старту. */
  N3: number;
  N23: number;
  GRID: number;
};

const cr = (a: number, b: number, c: number, d: number, t: number) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
};

export function buildTrack(key: TrackKey): Track {
  const t = TRACK_SPECS[key];
  const N = t.N;
  const P = new Float64Array(N * 2);
  const RAW = t.raw;
  const n = RAW.length;
  const SUB = t.sub;
  const dense: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p0 = RAW[(i - 1 + n) % n]!;
    const p1 = RAW[i]!;
    const p2 = RAW[(i + 1) % n]!;
    const p3 = RAW[(i + 2) % n]!;
    for (let k = 0; k < SUB; k++) {
      const u = k / SUB;
      dense.push([cr(p0[0], p1[0], p2[0], p3[0], u), cr(p0[1], p1[1], p2[1], p3[1], u)]);
    }
  }
  const m = dense.length;
  const cum = [0];
  let Ls = 0;
  for (let i = 0; i < m; i++) {
    const a = dense[i]!;
    const b = dense[(i + 1) % m]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    Ls += Math.sqrt(dx * dx + dy * dy);
    cum.push(Ls);
  }
  const sc = t.len / Ls;
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = (i * Ls) / N;
    while (cum[j + 1]! < s) j++;
    const a = dense[j]!;
    const b = dense[(j + 1) % m]!;
    const f = (s - cum[j]!) / (cum[j + 1]! - cum[j]!);
    P[2 * i] = (a[0] + (b[0] - a[0]) * f) * sc;
    P[2 * i + 1] = (a[1] + (b[1] - a[1]) * f) * sc;
  }
  return { key, HW: t.HW, WALL: t.WALL, OFFDRAG: t.OFFDRAG, len: t.len, N, P, N3: Math.floor(N / 3), N23: Math.floor((2 * N) / 3), GRID: N - 12 };
}

/** Найближча точка осі (пошук ±30 точок від попередньої). */
export function nearest(tr: Track, x: number, y: number, i0: number) {
  const { N, P } = tr;
  let bi = i0;
  let bd = 1e18;
  let bx = 0;
  let by = 0;
  for (let k = -30; k <= 30; k++) {
    const i = (((i0 + k) % N) + N) % N;
    const j = (i + 1) % N;
    const ax = P[2 * i]!;
    const ay = P[2 * i + 1]!;
    const dx = P[2 * j]! - ax;
    const dy = P[2 * j + 1]! - ay;
    let t = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t;
    const py = ay + dy * t;
    const d2 = (x - px) * (x - px) + (y - py) * (y - py);
    if (d2 < bd) {
      bd = d2;
      bi = i;
      bx = px;
      by = py;
    }
  }
  return { i: bi, d: Math.sqrt(bd), px: bx, py: by };
}

export type Car = {
  x: number;
  y: number;
  /** Напрям (одиничний вектор). */
  hx: number;
  hy: number;
  /** Швидкість, м/с. */
  v: number;
  /** Кермо −1…1. */
  st: number;
  idx: number;
  /** Відстань від осі, м. */
  d: number;
  /** Тіки з перетину лінії старту (до перетину — з початку заїзду). */
  t: number;
  /** Пройдено чекпойнтів (3 = фініш). */
  cp: number;
  crossed: boolean;
  done: boolean;
  /** Штрафи «+1 с». */
  pen: number;
  wasOff: boolean;
  split: [number, number, number];
  /** Тік, на якому болід уперше пройшов точку осі (для дельти до привида), −1 — ще ні. */
  at: Int32Array;
  penEvent: boolean;
};

export function newCar(tr: Track): Car {
  const { P, N, GRID: i } = tr;
  const j = (i + 1) % N;
  const dx = P[2 * j]! - P[2 * i]!;
  const dy = P[2 * j + 1]! - P[2 * i + 1]!;
  const l = Math.sqrt(dx * dx + dy * dy);
  const at = new Int32Array(N);
  at.fill(-1);
  return { x: P[2 * i]!, y: P[2 * i + 1]!, hx: dx / l, hy: dy / l, v: 0, st: 0, idx: i, d: 0, t: 0, cp: 0, crossed: false, done: false, pen: 0, wasOff: false, split: [0, 0, 0], at, penEvent: false };
}

/** Один крок фізики (1/120 с) з вводом b (біти IN_*). */
export function step(tr: Track, s: Car, b: number): void {
  const { HW, WALL, OFFDRAG, N, N3, N23 } = tr;
  const up = b & IN_UP;
  const dn = b & IN_DOWN;
  const lf = b & IN_LEFT;
  const rt = b & IN_RIGHT;
  const target = (rt ? 1 : 0) - (lf ? 1 : 0);
  const rate = 7 * DT;
  s.st += Math.max(-rate, Math.min(rate, target - s.st));
  const on = s.d <= HW + 1.6;
  let a = 0;
  if (up) a += (16 - 0.1 * s.v) * (on ? 1 : 0.45);
  if (dn) a -= on ? 38 : 22;
  a -= 0.0012 * s.v * s.v + 0.8;
  if (!on) a -= s.v * OFFDRAG;
  a -= Math.abs(s.st) * s.v * 0.18;
  s.v = Math.max(0, s.v + a * DT);
  const grip = on ? 36 : 13;
  const yaw = s.st * Math.min(2.3, grip / Math.max(s.v, 4)) * Math.min(1, s.v / 5);
  // Поворот рядом Тейлора замість sin/cos (детермінізм).
  const ang = yaw * DT;
  const a2 = ang * ang;
  const c = 1 - a2 / 2 + (a2 * a2) / 24;
  const sn = ang * (1 - a2 / 6 + (a2 * a2) / 120);
  const hx = s.hx * c - s.hy * sn;
  const hy = s.hx * sn + s.hy * c;
  const hl = Math.sqrt(hx * hx + hy * hy);
  s.hx = hx / hl;
  s.hy = hy / hl;
  s.x += s.hx * s.v * DT;
  s.y += s.hy * s.v * DT;
  const prev = s.idx;
  const n = nearest(tr, s.x, s.y, s.idx);
  s.idx = n.i;
  s.d = n.d;
  if (n.d > WALL) {
    s.x = n.px + ((s.x - n.px) / n.d) * WALL;
    s.y = n.py + ((s.y - n.py) / n.d) * WALL;
    s.d = WALL;
    s.v *= 0.985;
  }
  if (s.done) return;
  s.t++;
  s.penEvent = false;
  const off = n.d > HW + 2.5;
  if (off && !s.wasOff && s.crossed) {
    s.pen++;
    s.penEvent = true;
  }
  s.wasOff = off;
  const wrap = prev > N - 100 && s.idx < 100;
  if (!s.crossed && wrap) s.crossed = true;
  if (s.crossed && s.cp === 0 && prev < N3 && s.idx >= N3 && s.idx - prev < 100) {
    s.cp = 1;
    s.split[0] = s.t;
  } else if (s.cp === 1 && prev < N23 && s.idx >= N23 && s.idx - prev < 100) {
    s.cp = 2;
    s.split[1] = s.t;
  } else if (s.cp === 2 && wrap) {
    s.cp = 3;
    s.split[2] = s.t;
    s.done = true;
  }
  if (s.crossed && !s.done && s.at[s.idx]! < 0) s.at[s.idx] = s.t;
}

/** Час кола в тіках разом зі штрафами. */
export const total = (s: Car) => s.t + s.pen * TPS;

export function simulate(tr: Track, inputs: ArrayLike<number>): Car {
  const s = newCar(tr);
  for (let k = 0; k < inputs.length && !s.done; k++) step(tr, s, inputs[k]!);
  return s;
}

/** Ввід кола → рядок «біт.кількість,…» (hex-біт, як у макеті). */
export function rle(a: ArrayLike<number>): string {
  const out: string[] = [];
  for (let i = 0; i < a.length; ) {
    let j = i;
    while (j < a.length && a[j] === a[i]) j++;
    out.push(a[i]!.toString(16) + "." + (j - i));
    i = j;
  }
  return out.join(",");
}

/** Зворотне до rle. Кидає помилку на зіпсованому рядку (захист від підробленого сховища). */
export function unrle(str: string, max = 120 * 600): number[] {
  const a: number[] = [];
  for (const p of str.split(",")) {
    const m = /^([0-9a-f])\.(\d{1,6})$/.exec(p);
    if (!m) throw new Error("bad rle");
    const v = parseInt(m[1]!, 16);
    const c = Number(m[2]);
    if (a.length + c > max) throw new Error("rle too long");
    for (let k = 0; k < c; k++) a.push(v);
  }
  return a;
}

export type Lap = { inputs: number[]; total: number; split: [number, number, number]; at: Int32Array };

/** Перевірене коло з рядка вводу: фініш і час збігаються з очікуваним, інакше null. */
export function verifyLap(tr: Track, inputs: string, expected: number, requireClean = false): Lap | null {
  try {
    const inp = unrle(inputs);
    const r = simulate(tr, inp);
    if (!r.done || total(r) !== expected || (requireClean && r.pen !== 0)) return null;
    return { inputs: inp, total: expected, split: [...r.split], at: r.at };
  } catch {
    return null;
  }
}

/** Секторні часи з відміток перетину. */
export const sectorTimes = (sp: readonly number[]): [number, number, number] => [sp[0]!, sp[1]! - sp[0]!, sp[2]! - sp[1]!];

/** 0:29.933 */
export function fmtLap(ticks: number): string {
  const ms = Math.round((ticks * 1000) / TPS);
  const m = Math.floor(ms / 60000);
  const s = Math.floor(ms / 1000) % 60;
  const r = ms % 1000;
  return `${m}:${String(s).padStart(2, "0")}.${String(r).padStart(3, "0")}`;
}

/** 11.267 (секунди з тисячними). */
export const fmtSec = (ticks: number) => (ticks / TPS).toFixed(3);
