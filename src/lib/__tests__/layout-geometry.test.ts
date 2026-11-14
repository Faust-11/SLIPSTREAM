import { describe, expect, it } from "vitest";
// Генератор схем — JS-модуль у scripts/ (allowJs): геометрія без мережі й браузера.
import { bestRotation, toLayout, toPageLayout } from "../../../scripts/curated/layout-geometry.mjs";

/** Прямокутник 1,6:1 (оптимум для рамки 1,7:1 — горизонталь), повернутий на deg (y — вниз, як на екрані); точки по сторонах. */
function rect(deg: number): [number, number][] {
  const corners: [number, number][] = [[-1.6, -1], [1.6, -1], [1.6, 1], [-1.6, 1]];
  const pts: [number, number][] = [];
  for (let k = 0; k < 4; k++) {
    const [a, b] = [corners[k]!, corners[(k + 1) % 4]!];
    for (let i = 0; i < 50; i++) pts.push([a[0] + ((b[0] - a[0]) * i) / 50, a[1] + ((b[1] - a[1]) * i) / 50]);
  }
  const r = (deg * Math.PI) / 180;
  return pts.map(([x, y]) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]);
}

describe("bestRotation — горизонтальна рамка без зайвого повороту від півночі (рев'ю PR #21)", () => {
  it("нахил −20° вирівнюється малим поворотом (+15…+20°), а не на ~160° (раніше пошук 0…179 — майже догори дриґом)", () => {
    const r = bestRotation(rect(-20));
    expect(r).toBeGreaterThanOrEqual(15);
    expect(r).toBeLessThanOrEqual(20);
    const l = bestRotation(rect(20));
    expect(l).toBeGreaterThanOrEqual(-20);
    expect(l).toBeLessThanOrEqual(-15);
  });

  it("вертикальний — поворот біля ±90°; горизонтальний — 0 (виграш < 1 % не повертаємо)", () => {
    expect(Math.abs(bestRotation(rect(90)))).toBeGreaterThanOrEqual(85);
    expect(bestRotation(rect(0))).toBe(0);
  });

  it("кут завжди в −89…90", () => {
    for (const d of [-80, -45, -10, 10, 45, 80, 120, 170]) {
      const r = bestRotation(rect(d));
      expect(r).toBeGreaterThanOrEqual(-89);
      expect(r).toBeLessThanOrEqual(90);
    }
  });
});

describe("toPageLayout / toLayout", () => {
  it("сторінка: довша сторона 1000, горизонтально; маска картки — без повороту", () => {
    const pts = rect(70);
    const page = toPageLayout(pts);
    expect(Math.max(page.w, page.h)).toBe(1000);
    expect(page.w).toBeGreaterThan(page.h);
    expect(page.rot).toBeGreaterThanOrEqual(-70);
    expect(page.rot).toBeLessThanOrEqual(-65);
    const card = toLayout(pts);
    expect(card.h).toBeGreaterThan(card.w);
  });

  it("поворот без дзеркалення: обхід контуру лишається в тому самому напрямку (знак площі)", () => {
    const area = (p: [number, number][]) => p.reduce((s, [x, y], i) => s + x * p[(i + 1) % p.length]![1] - p[(i + 1) % p.length]![0] * y, 0);
    const pts = rect(30);
    const page = toPageLayout(pts);
    const back = [...page.d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
    expect(Math.sign(area(back))).toBe(Math.sign(area(pts)));
  });
});
