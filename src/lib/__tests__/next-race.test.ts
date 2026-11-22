import { describe, expect, it } from "vitest";
import { followingShown, nextSwitchScript, raceEndAt, RACE_WINDOW_MS, UNTIMED_WINDOW_MS } from "../next-race";

describe("raceEndAt", () => {
  it("гонка з часом: старт + 3 год", () => {
    expect(raceEndAt("2026-11-22T04:00:00.000Z", true)).toBe(Date.parse("2026-11-22T07:00:00.000Z"));
    expect(RACE_WINDOW_MS).toBe(3 * 3600_000);
  });
  it("гонка без часу (raceAt — кінець дня UTC): ще 12 год", () => {
    expect(raceEndAt("2026-11-22T23:59:59.000Z", false)).toBe(Date.parse("2026-11-22T23:59:59.000Z") + UNTIMED_WINDOW_MS);
  });
  it("немає дати чи некоректна — null", () => {
    expect(raceEndAt(null, true)).toBeNull();
    expect(raceEndAt("не дата", true)).toBeNull();
  });
});

describe("followingShown", () => {
  const end = Date.parse("2026-11-22T07:00:00.000Z");
  it("до кінця — панель за збіркою; з кінця — наступна", () => {
    expect(followingShown(end - 1, end)).toBe(false);
    expect(followingShown(end, end)).toBe(true);
    expect(followingShown(end + 86_400_000, end)).toBe(true);
  });
  it("без часу кінця перемикати нічого", () => {
    expect(followingShown(Date.now(), null)).toBe(false);
  });
});

describe("nextSwitchScript", () => {
  it("ставить data-hm-next=b на корені головної, коли час настав, і нічого — коли ні", () => {
    document.body.innerHTML = '<div data-section="home"><script id="s" data-end="1000"></script></div>';
    const s = document.getElementById("s") as HTMLScriptElement;
    const run = (now: number) => {
      const root = document.querySelector("[data-section=home]")!;
      root.removeAttribute("data-hm-next");
      const orig = Date.now;
      Date.now = () => now;
      Object.defineProperty(document, "currentScript", { value: s, configurable: true });
      new Function(nextSwitchScript)();
      Date.now = orig;
      return root.getAttribute("data-hm-next");
    };
    expect(run(999)).toBeNull();
    expect(run(1000)).toBe("b");
  });
});
