import { describe, expect, it } from "vitest";
import { fmtSession } from "../fmt";
import { kyivIso, kyivOffsetHours, kyivOffsetLabel, toKyiv } from "../kyiv-time";

/** Еталон: tz-база Node (Intl, Europe/Kyiv). */
const ref = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function refParts(d: Date) {
  const p = Object.fromEntries(ref.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

describe("київський час без Intl", () => {
  it("збігається з Intl Europe/Kyiv: 2024–2031 кожні 3 год 31 хв + щохвилини навколо кожного переходу", () => {
    const check = (t: number) => {
      const d = new Date(t);
      expect(toKyiv(d.toISOString()).toISOString().slice(0, 16), d.toISOString()).toBe(refParts(d));
    };
    let n = 0;
    for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2031, 11, 31); t += 211 * 60_000) {
      check(t);
      n++;
    }
    // Переходи: остання неділя березня й жовтня, 01:00 UTC; перевіряємо ±90 хв щохвилини (по 8 років × 2 переходи).
    for (let y = 2024; y <= 2031; y++) {
      for (const m of [2, 9]) {
        const last = new Date(Date.UTC(y, m + 1, 0));
        const edge = Date.UTC(y, m, last.getUTCDate() - last.getUTCDay(), 1);
        for (let t = edge - 90 * 60_000; t <= edge + 90 * 60_000; t += 60_000) {
          check(t);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(20_000);
  }, 60_000);

  it("межі літнього часу 2026: 29 березня 01:00 UTC і 25 жовтня 01:00 UTC", () => {
    expect(kyivOffsetHours(new Date("2026-03-29T00:59:59Z"))).toBe(2);
    expect(kyivOffsetHours(new Date("2026-03-29T01:00:00Z"))).toBe(3);
    expect(kyivOffsetHours(new Date("2026-10-25T00:59:59Z"))).toBe(3);
    expect(kyivOffsetHours(new Date("2026-10-25T01:00:00Z"))).toBe(2);
  });

  it("Лас-Вегас 2026: FP1 00:30 UTC = 02:30 за Києвом (UTC+2), «пт, 20 лист. · 02:30»", () => {
    expect(kyivOffsetLabel("2026-11-20T00:30:00Z")).toBe("UTC+2");
    expect(fmtSession(toKyiv("2026-11-20T00:30:00Z").toISOString(), "uk", true)).toBe("пт, 20 лист. · 02:30");
    expect(fmtSession(toKyiv("2026-11-20T00:30:00Z").toISOString(), "en", true)).toBe("Fri 20 Nov · 02:30");
  });

  it("гонка пізно ввечері UTC переходить на наступну київську добу", () => {
    expect(toKyiv("2026-07-04T23:30:00Z").toISOString()).toBe("2026-07-05T02:30:00.000Z");
  });

  it("kyivIso: ISO із зсувом для JSON-LD", () => {
    expect(kyivIso("2026-11-20T00:30:00Z")).toBe("2026-11-20T02:30:00+02:00");
    expect(kyivIso("2026-07-05T12:00:00Z")).toBe("2026-07-05T15:00:00+03:00");
  });
});
