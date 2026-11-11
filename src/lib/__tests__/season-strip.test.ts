import { describe, expect, it } from "vitest";
import { seasonStripGradient } from "../season-strip";

const ON = "var(--strip-on)";
const OFF = "var(--strip-off)";

describe("seasonStripGradient", () => {
  it("один діапазон на початку: «on» 0–50 %, далі «off»", () => {
    expect(seasonStripGradient([[1950, 1951]], 1950, 1953)).toBe(
      `linear-gradient(to right, ${ON} 0% 50%, ${OFF} 50% 100%)`,
    );
  });

  it("суміжні й перетинні діапазони зливаються в один сегмент", () => {
    expect(seasonStripGradient([[1950, 1950], [1951, 1951]], 1950, 1953)).toBe(
      seasonStripGradient([[1950, 1951]], 1950, 1953),
    );
    expect(seasonStripGradient([[1951, 1952], [1950, 1951]], 1950, 1953)).toBe(
      `linear-gradient(to right, ${ON} 0% 75%, ${OFF} 75% 100%)`,
    );
  });

  it("порожньо → лише «off»; усе → лише «on»", () => {
    expect(seasonStripGradient([], 1950, 1953)).toBe(`linear-gradient(to right, ${OFF} 0% 100%)`);
    expect(seasonStripGradient([[1950, 1953]], 1950, 1953)).toBe(`linear-gradient(to right, ${ON} 0% 100%)`);
  });

  it("роки поза межами обрізаються", () => {
    expect(seasonStripGradient([[1940, 1950], [2026, 2030]], 1950, 1953)).toBe(
      `linear-gradient(to right, ${ON} 0% 25%, ${OFF} 25% 100%)`,
    );
  });

  it("за замовчуванням 1950–2026 (77 сезонів); відсотки — до 3 знаків", () => {
    expect(seasonStripGradient([[2026, 2026]])).toBe(
      `linear-gradient(to right, ${OFF} 0% 98.701%, ${ON} 98.701% 100%)`,
    );
    expect(seasonStripGradient([[1975, 1976], [1978, 2026]])).toBe(
      `linear-gradient(to right, ${OFF} 0% 32.468%, ${ON} 32.468% 35.065%, ${OFF} 35.065% 36.364%, ${ON} 36.364% 100%)`,
    );
  });
});
