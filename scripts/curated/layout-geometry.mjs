// Геометрія схем трас (фаза 3h/3j): спрощення, нормування у viewBox, поворот під горизонтальну рамку. Без мережі й
// браузера — генератор scripts/curated/circuit_layouts.mjs і unit-тест src/lib/__tests__/layout-geometry.test.ts.

export const SIDE = 1000;
export const TOLERANCE = 1.5; // одиниць viewBox (з 1000): на картці списку (~280 px) — менше 0,5 px
// Схема на сторінці траси (фаза 3j): до ~800 px завширшки — допуск менший, контур повернуто під горизонтальну рамку.
export const PAGE_TOLERANCE = 0.5;
export const PAGE_ASPECT = 1.7;

/** Дуглас — Пекер (ітеративно). */
export function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let best = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      // Замкнений контур: перша й остання точки збігаються — відстань до точки, а не до відрізка нульової довжини
      // (інакше все спрощувалось до 2 точок).
      const d = len < 1e-9 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay) : Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > best) [best, at] = [d, i];
    }
    if (best > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Точки → шлях у viewBox з довшою стороною SIDE; замкнений контур — «Z». */
export function toLayout(raw) {
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = SIDE / Math.max(x1 - x0, y1 - y0);
  const pts = simplify(raw.map(([x, y]) => [(x - x0) * k, (y - y0) * k]), TOLERANCE);
  const w = Math.round((x1 - x0) * k);
  const h = Math.round((y1 - y0) * k);
  const closed = Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < SIDE * 0.03;
  const body = (closed ? pts.slice(0, -1) : pts).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  return { d: body + (closed ? "Z" : ""), w, h, points: pts.length };
}

/**
 * Кут повороту (°, −89…90), за якого контур найбільше в рамці PAGE_ASPECT:1 (відгук користувача 14.11: витягнуті траси
 * займали третину ширини — Яс-Марина, Лас-Вегас). Рамка при θ і θ−180° однакова, тож пошук — у −89…90, а серед кутів,
 * що дають ≥ 99 % найкращого заповнення, — найменший за модулем: без зайвого повороту від півночі (рев'ю PR #21: пошук у
 * 0…179 повертав Імолу на 177° — майже догори дриґом — замість −3°).
 */
export function bestRotation(raw) {
  const fits = [];
  for (let deg = -89; deg <= 90; deg++) {
    const r = (deg * Math.PI) / 180;
    const [c, s] = [Math.cos(r), Math.sin(r)];
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, y] of raw) {
      const X = x * c - y * s;
      const Y = x * s + y * c;
      x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
    }
    fits.push({ deg, scale: Math.min(PAGE_ASPECT / (x1 - x0), 1 / (y1 - y0)) });
  }
  const top = Math.max(...fits.map((f) => f.scale));
  return fits.filter((f) => f.scale >= top * 0.99).sort((a, b) => Math.abs(a.deg) - Math.abs(b.deg) || a.deg - b.deg)[0].deg;
}

/**
 * Детальна повернута схема для сторінки. Лінію старту й напрям руху НЕ позначаємо: f1-circuits не гарантує, що перша
 * точка — старт, а порядок — напрям гонки (README мовчить; замір 14.11) — непідтверджене не малюємо.
 */
export function toPageLayout(raw) {
  const deg = bestRotation(raw);
  const r = (deg * Math.PI) / 180;
  const rot = raw.map(([x, y]) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]);
  const xs = rot.map((p) => p[0]);
  const ys = rot.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = SIDE / Math.max(x1 - x0, y1 - y0);
  const pts = simplify(rot.map(([x, y]) => [(x - x0) * k, (y - y0) * k]), PAGE_TOLERANCE);
  const closed = Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < SIDE * 0.03;
  const body = (closed ? pts.slice(0, -1) : pts).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  return { d: body + (closed ? "Z" : ""), w: Math.round((x1 - x0) * k), h: Math.round((y1 - y0) * k), rot: deg, points: pts.length };
}

