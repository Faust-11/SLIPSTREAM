import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/contrast";

// Усі значення токена в globals.css (світла тема + обидва блоки темної).
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
function values(token: string): string[] {
  const found = [...css.matchAll(new RegExp(`${token}:\\s*(#[0-9a-f]{6})\\s*;`, "gi"))].map((m) => m[1]!);
  return [...new Set(found.map((v) => v.toLowerCase()))];
}

describe("кольори шапки (рішення 11.11: «Гра» — жовта плашка, поточний — жовте підкреслення)", () => {
  const headBg = values("--head-bg");
  const headFg = values("--head-fg");
  const yellow = values("--yellow");
  const onYellow = values("--on-yellow");

  it("токени знайдено", () => {
    for (const list of [headBg, headFg, yellow, onYellow]) expect(list.length).toBeGreaterThan(0);
  });

  it("текст плашки «Гра» на жовтому ≥ 4.5:1", () => {
    for (const bg of yellow) for (const fg of onYellow) expect(contrastRatio(fg, bg), `${fg}/${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it("жовта плашка й жовте підкреслення відрізняються від фону шапки ≥ 3:1 (WCAG 1.4.11)", () => {
    for (const bg of headBg) for (const y of yellow) expect(contrastRatio(y, bg), `${y}/${bg}`).toBeGreaterThanOrEqual(3);
  });

  it("текст і підкреслення наведення (head-fg) на шапці ≥ 4.5:1", () => {
    for (const bg of headBg) for (const fg of headFg) expect(contrastRatio(fg, bg), `${fg}/${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});
