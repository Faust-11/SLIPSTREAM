/**
 * «Гаряче коло» — малювання сцени (лише браузер; фізику не чіпає). Порт макета: асфальт, поребрики, декор за
 * стінами (сосни / квартали / чагарник), трибуни, клітчаста лінія, болід і привид, мінікарта.
 * Math.random/atan2 тут дозволені: на час кола не впливають.
 */
import type { Car, Track, TrackKey } from "@/lib/game/physics";

type Theme = { bg: string; run: [string, string]; wall: string; deco: "blocks" | "scrub" | "trees" | null };
const THEME: Record<TrackKey, Theme> = {
  lyman: { bg: "#0b1a10", run: ["#123a1f", "#15432a"], wall: "#59606a", deco: null },
  port: { bg: "#0f1216", run: ["#2a2f36", "#30353d"], wall: "#d9dce0", deco: "blocks" },
  plateau: { bg: "#5a4020", run: ["#c9a66b", "#c09c60"], wall: "#1b1c1f", deco: "scrub" },
  forest: { bg: "#0b1b10", run: ["#1a4626", "#1d4c2a"], wall: "#8a8f96", deco: "trees" },
};

export const GHOST_COLOR = "#B98CFF";
const CROWD = ["#e8e3d3", "#ffc400", "#3d7bff", "#e0301e", "#27d9c2", "#9aa4ad"];

export type Scenery = {
  tr: Track;
  theme: Theme;
  track: Path2D;
  kerb: Path2D;
  stands: { base: Path2D; roof: Path2D; crowd: Path2D[] };
  deco: { paths: Path2D[]; colors: string[]; lit?: Path2D } | null;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  runFill: [string, string];
};

type Pt = [number, number];

export function buildScenery(tr: Track): Scenery {
  const { P, N, WALL, len, key } = tr;
  const theme = THEME[key];
  const track = new Path2D();
  track.moveTo(P[0]!, P[1]!);
  for (let i = 1; i < N; i++) track.lineTo(P[2 * i]!, P[2 * i + 1]!);
  track.closePath();

  // Поребрики — там, де кривизна осі більша за поріг (±8 точок).
  const kerb = new Path2D();
  const mark = new Uint8Array(N);
  const seg = (i: number) => {
    const j = (i + 1) % N;
    return Math.atan2(P[2 * j + 1]! - P[2 * i + 1]!, P[2 * j]! - P[2 * i]!);
  };
  const sp = len / N;
  for (let i = 0; i < N; i++) {
    let d = seg(i) - seg((i - 1 + N) % N);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) / sp > 0.011) for (let k = -8; k <= 8; k++) mark[(((i + k) % N) + N) % N] = 1;
  }
  let s0 = mark.indexOf(0);
  if (s0 < 0) s0 = 0;
  let open = false;
  for (let k = 0; k <= N; k++) {
    const i = (s0 + k) % N;
    if (mark[i]) {
      if (!open) {
        kerb.moveTo(P[2 * i]!, P[2 * i + 1]!);
        open = true;
      } else kerb.lineTo(P[2 * i]!, P[2 * i + 1]!);
    } else open = false;
  }

  // Детермінований «випадок» для декору: однаковий вигляд траси при кожному відкритті.
  let seed = 20261110;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const clear = (x: number, y: number, r: number) => {
    for (let i = 0; i < N; i += 2) {
      const dx = P[2 * i]! - x;
      const dy = P[2 * i + 1]! - y;
      if (dx * dx + dy * dy < r * r) return false;
    }
    return true;
  };

  // Трибуни на прямих.
  const base = new Path2D();
  const roof = new Path2D();
  const crowd = CROWD.map(() => new Path2D());
  const quad = (p: Path2D, a: Pt, b: Pt, c: Pt, d: Pt) => {
    p.moveTo(a[0], a[1]);
    p.lineTo(b[0], b[1]);
    p.lineTo(c[0], c[1]);
    p.lineTo(d[0], d[1]);
    p.closePath();
  };
  const D0 = WALL + 4;
  const D1 = WALL + 18;
  const add = (i: number, side: number) => {
    const j = (i + 6) % N;
    const dx = P[2 * j]! - P[2 * i]!;
    const dy = P[2 * j + 1]! - P[2 * i + 1]!;
    const l = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / l;
    const uy = dy / l;
    const nx = -uy * side;
    const ny = ux * side;
    const pt = (a: number, o: number): Pt => [P[2 * i]! + ux * a + nx * o, P[2 * i + 1]! + uy * a + ny * o];
    for (const o of [D0, (D0 + D1) / 2, D1]) {
      const p = pt(l / 2, o);
      if (!clear(p[0], p[1], WALL + 3)) return false;
    }
    quad(base, pt(0, D0), pt(l, D0), pt(l, D1 - 2), pt(0, D1 - 2));
    quad(roof, pt(0, D1 - 2), pt(l, D1 - 2), pt(l, D1), pt(0, D1));
    for (let r = 0; r < 6; r++)
      for (let a = 0.6; a < l - 0.4; a += 1.1) {
        if (rnd() < 0.2) continue;
        const p = pt(a + (rnd() - 0.5) * 0.3, D0 + 1 + r * 2.1);
        crowd[Math.floor(rnd() * 6)]!.rect(p[0] - 0.4, p[1] - 0.4, 0.8, 0.8);
      }
    return true;
  };
  for (let i = 0; i < N; i += 6) {
    if (mark[i] || mark[(i + 6) % N]) continue;
    if (i > N - 80 || i < 160) {
      add(i, 1);
      add(i, -1);
    } else if (key !== "forest" && i % 240 < 150) {
      if (!add(i, 1)) add(i, -1);
    }
  }

  let minX = 1e9;
  let minY = 1e9;
  let maxX = -1e9;
  let maxY = -1e9;
  for (let i = 0; i < N; i++) {
    minX = Math.min(minX, P[2 * i]!);
    maxX = Math.max(maxX, P[2 * i]!);
    minY = Math.min(minY, P[2 * i + 1]!);
    maxY = Math.max(maxY, P[2 * i + 1]!);
  }

  let deco: Scenery["deco"] = null;
  if (theme.deco === "trees") {
    const g = [new Path2D(), new Path2D(), new Path2D()];
    for (let y = minY - 140; y < maxY + 140; y += 9)
      for (let x = minX - 140; x < maxX + 140; x += 9) {
        const px = x + (rnd() - 0.5) * 7;
        const py = y + (rnd() - 0.5) * 7;
        const r = 2.6 + rnd() * 2.2;
        if (rnd() < 0.25 || !clear(px, py, WALL + 3 + r)) continue;
        const k = Math.floor(rnd() * 3);
        g[k]!.moveTo(px + r, py);
        g[k]!.arc(px, py, r, 0, 7);
      }
    deco = { paths: g, colors: ["#0f3a1c", "#14482a", "#1d5a33"] };
  } else if (theme.deco === "blocks") {
    const g = [new Path2D(), new Path2D()];
    const lit = new Path2D();
    for (let y = minY - 160; y < maxY + 160; y += 34)
      for (let x = minX - 160; x < maxX + 160; x += 34) {
        const w = 18 + rnd() * 12;
        const h = 18 + rnd() * 12;
        const cx = x + (rnd() - 0.5) * 6;
        const cy = y + (rnd() - 0.5) * 6;
        if (!clear(cx, cy, WALL + 4 + Math.max(w, h) * 0.75)) continue;
        g[rnd() < 0.5 ? 0 : 1]!.rect(cx - w / 2, cy - h / 2, w, h);
        for (let q = 0; q < 4; q++) if (rnd() < 0.5) lit.rect(cx - w / 2 + 2 + rnd() * (w - 6), cy - h / 2 + 2 + rnd() * (h - 6), 1.4, 1.4);
      }
    deco = { paths: g, colors: ["#1b2027", "#232a33"], lit };
  } else if (theme.deco === "scrub") {
    const g = [new Path2D(), new Path2D()];
    for (let y = minY - 160; y < maxY + 160; y += 11)
      for (let x = minX - 160; x < maxX + 160; x += 11) {
        const px = x + (rnd() - 0.5) * 10;
        const py = y + (rnd() - 0.5) * 10;
        const r = 0.8 + rnd() * 1.8;
        if (rnd() < 0.55 || !clear(px, py, WALL + 2 + r)) continue;
        const k = rnd() < 0.7 ? 0 : 1;
        g[k]!.moveTo(px + r, py);
        g[k]!.arc(px, py, r, 0, 7);
      }
    deco = { paths: g, colors: ["#6b5a2c", "#3e3220"] };
  }

  return { tr, theme, track, kerb, stands: { base, roof, crowd }, deco, bounds: { minX, minY, maxX, maxY }, runFill: theme.run };
}

/** Смугаста заливка зони вибігу (патерн на конкретному контексті). */
export function runPattern(ctx: CanvasRenderingContext2D, sc: Scenery): CanvasPattern | string {
  const c = document.createElement("canvas");
  c.width = c.height = 24;
  const g = c.getContext("2d");
  if (!g) return sc.runFill[0];
  g.fillStyle = sc.runFill[0];
  g.fillRect(0, 0, 24, 24);
  g.fillStyle = sc.runFill[1];
  g.fillRect(0, 0, 12, 24);
  return ctx.createPattern(c, "repeat") ?? sc.runFill[0];
}

function crossLine(ctx: CanvasRenderingContext2D, tr: Track, i: number, draw: () => void) {
  const { P, N } = tr;
  const j = (i + 1) % N;
  const dx = P[2 * j]! - P[2 * i]!;
  const dy = P[2 * j + 1]! - P[2 * i + 1]!;
  const l = Math.sqrt(dx * dx + dy * dy);
  ctx.save();
  ctx.transform(dx / l, dy / l, -dy / l, dx / l, P[2 * i]!, P[2 * i + 1]!);
  draw();
  ctx.restore();
}

function drawCar(ctx: CanvasRenderingContext2D, s: Car, ghost: boolean) {
  ctx.save();
  ctx.transform(s.hx, s.hy, -s.hy, s.hx, s.x, s.y);
  ctx.globalAlpha = ghost ? 0.5 : 1;
  const body = ghost ? GHOST_COLOR : "#F3F0E8";
  const acc = ghost ? GHOST_COLOR : "#FFC400";
  const tyre = ghost ? "#5b3a85" : "#121416";
  if (!ghost) {
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(-2.6, -1.1, 5.4, 2.3);
  }
  ctx.fillStyle = tyre;
  const steer = s.st * 0.35;
  for (const [wx, wy, front] of [
    [1.7, 0.82, 1],
    [1.7, -0.82, 1],
    [-1.6, 0.85, 0],
    [-1.6, -0.85, 0],
  ] as const) {
    ctx.save();
    ctx.translate(wx, wy);
    if (front) ctx.rotate(steer);
    ctx.fillRect(-0.36, -0.22, 0.72, 0.44);
    ctx.restore();
  }
  ctx.fillStyle = acc;
  ctx.fillRect(2.35, -0.95, 0.32, 1.9);
  ctx.fillRect(-2.7, -0.7, 0.38, 1.4);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(2.5, 0);
  ctx.lineTo(1.2, 0.28);
  ctx.lineTo(0.2, 0.6);
  ctx.lineTo(-1.9, 0.55);
  ctx.lineTo(-2.3, 0.3);
  ctx.lineTo(-2.3, -0.3);
  ctx.lineTo(-1.9, -0.55);
  ctx.lineTo(0.2, -0.6);
  ctx.lineTo(1.2, -0.28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = acc;
  ctx.fillRect(-1.6, -0.12, 3.4, 0.24);
  ctx.fillStyle = "#0b0d0f";
  ctx.beginPath();
  ctx.ellipse(-0.2, 0, 0.45, 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export type View = { camRotate: boolean; camAng: number };

/** Кадр сцени: камера за болідом (або «північ угорі»), масштаб падає зі швидкістю. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  sc: Scenery,
  run: CanvasPattern | string,
  car: Car,
  ghost: Car | null,
  view: View,
) {
  const { tr } = sc;
  const { HW, WALL, N3, N23, GRID } = tr;
  const z = (Math.min(W, H * 1.2) / 115) * (1 - (Math.min(car.v, 85) / 85) * 0.28);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = sc.theme.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H * (view.camRotate ? 0.66 : 0.5));
  ctx.rotate(-view.camAng - Math.PI / 2);
  ctx.scale(z, z);
  ctx.translate(-car.x, -car.y);
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
  if (sc.deco) {
    sc.deco.paths.forEach((p, k) => {
      ctx.fillStyle = sc.deco!.colors[k]!;
      ctx.fill(p);
    });
    if (sc.deco.lit) {
      ctx.fillStyle = "#f2c230";
      ctx.fill(sc.deco.lit);
    }
  }
  ctx.fillStyle = "#262d36";
  ctx.fill(sc.stands.base);
  ctx.fillStyle = "#3a424c";
  ctx.fill(sc.stands.roof);
  sc.stands.crowd.forEach((p, k) => {
    ctx.fillStyle = CROWD[k]!;
    ctx.fill(p);
  });
  ctx.lineWidth = 2 * WALL + 1.6;
  ctx.strokeStyle = sc.theme.wall;
  ctx.stroke(sc.track);
  ctx.lineWidth = 2 * WALL;
  ctx.strokeStyle = run;
  ctx.stroke(sc.track);
  ctx.lineWidth = Math.min(2 * (HW + 11), 2 * WALL - 1);
  ctx.strokeStyle = tr.key === "port" ? "#3a3f47" : "#5f513e";
  ctx.stroke(sc.kerb);
  ctx.lineWidth = 2 * (HW + 1.3);
  ctx.strokeStyle = "#e9e6df";
  ctx.stroke(sc.kerb);
  ctx.setLineDash([1.1, 1.1]);
  ctx.strokeStyle = "#d8342b";
  ctx.stroke(sc.kerb);
  ctx.setLineDash([]);
  ctx.lineWidth = 2 * HW + 0.5;
  ctx.strokeStyle = "#e9e6df";
  ctx.stroke(sc.track);
  ctx.lineWidth = 2 * HW;
  ctx.strokeStyle = "#2b2f35";
  ctx.stroke(sc.track);
  crossLine(ctx, tr, 0, () => {
    for (let r = 0; r < 2; r++)
      for (let c = -Math.ceil(HW); c < Math.ceil(HW); c++) {
        ctx.fillStyle = (r + c) & 1 ? "#f3f0e8" : "#111";
        ctx.fillRect(-1 + r, c, 1, 1);
      }
  });
  crossLine(ctx, tr, GRID, () => {
    ctx.strokeStyle = "#f3f0e8";
    ctx.lineWidth = 0.25;
    ctx.beginPath();
    ctx.moveTo(3, -2);
    ctx.lineTo(3, 2);
    ctx.moveTo(3, -2);
    ctx.lineTo(-3, -2);
    ctx.moveTo(3, 2);
    ctx.lineTo(-3, 2);
    ctx.stroke();
  });
  for (const i of [N3, N23])
    crossLine(ctx, tr, i, () => {
      ctx.fillStyle = "#FFC400";
      ctx.fillRect(-0.15, -HW, 0.3, 0.9);
      ctx.fillRect(-0.15, HW - 0.9, 0.3, 0.9);
    });
  if (ghost) drawCar(ctx, ghost, true);
  drawCar(ctx, car, false);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

export function drawMini(m: CanvasRenderingContext2D, S: number, dpr: number, sc: Scenery, car: Car, ghost: Car | null) {
  const { P, N } = sc.tr;
  const { minX, minY, maxX, maxY } = sc.bounds;
  const pad = 8 * dpr;
  const k = Math.min((S - 2 * pad) / (maxX - minX), (S - 2 * pad) / (maxY - minY));
  const ox = (S - (maxX - minX) * k) / 2;
  const oy = (S - (maxY - minY) * k) / 2;
  const X = (x: number) => ox + (x - minX) * k;
  const Y = (y: number) => oy + (y - minY) * k;
  m.setTransform(1, 0, 0, 1, 0, 0);
  m.clearRect(0, 0, S, S);
  m.fillStyle = "rgba(8,10,12,.6)";
  m.fillRect(0, 0, S, S);
  m.beginPath();
  m.moveTo(X(P[0]!), Y(P[1]!));
  for (let i = 1; i < N; i++) m.lineTo(X(P[2 * i]!), Y(P[2 * i + 1]!));
  m.closePath();
  m.lineWidth = 3 * dpr;
  m.strokeStyle = "rgba(236,239,241,.55)";
  m.lineJoin = "round";
  m.stroke();
  m.fillStyle = "#f3f0e8";
  m.fillRect(X(P[0]!) - 1.5 * dpr, Y(P[1]!) - 4 * dpr, 3 * dpr, 8 * dpr);
  if (ghost) {
    m.fillStyle = GHOST_COLOR;
    m.beginPath();
    m.arc(X(ghost.x), Y(ghost.y), 3 * dpr, 0, 7);
    m.fill();
  }
  m.fillStyle = "#FFC400";
  m.beginPath();
  m.arc(X(car.x), Y(car.y), 4 * dpr, 0, 7);
  m.fill();
}
