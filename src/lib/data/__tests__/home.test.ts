import { describe, expect, it, vi } from "vitest";
import { pathClockwise } from "@/lib/circuit-math";
import { getHomePage, latestKey, layoutMotion, rankRecords } from "../home";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/db", async () => {
  const fx = await import("@/lib/data/__tests__/db-fixture");
  return { dbSelect: fx.dbSelect, dbSelectAll: fx.dbSelect };
});
// Міжсезоння: календар нового року вже є, гонок ще не було — підміна getCalendarPage (рев'ю PR #25).
const ahead = { on: false };
vi.mock("@/lib/data/calendar", async (orig) => {
  const real = await orig<typeof import("@/lib/data/calendar")>();
  return {
    ...real,
    getCalendarPage: async (locale: "uk" | "en") => {
      const p = await real.getCalendarPage(locale);
      if (!ahead.on) return p;
      return {
        ...p,
        season: 2027,
        started: false,
        inProgress: false,
        done: 0,
        champion: null,
        decided: false,
        drivers: [],
        teams: [],
        cards: p.cards.map((c, i) => ({ ...c, state: i === 0 ? ("next" as const) : ("later" as const), winners: [] })),
      };
    },
  };
});

describe("rankRecords", () => {
  it("спільні місця (1, 2, 2, 4), лідерів кілька, рівні на межі не відкидаються, нулі — ні", () => {
    const r = rankRecords(
      [
        { who: "a", n: 7 },
        { who: "b", n: 7 },
        { who: "c", n: 5 },
        { who: "d", n: 4 },
        { who: "e", n: 4 },
        { who: "f", n: 3 },
        { who: "z", n: 0 },
      ],
      4,
    );
    expect(r.top.map((x) => [x.who, x.rank])).toEqual([
      ["a", 1],
      ["b", 1],
    ]);
    expect(r.rest.map((x) => [x.who, x.rank])).toEqual([
      ["c", 3],
      ["d", 4],
      ["e", 4],
    ]);
  });
  it("порожньо — порожньо", () => {
    expect(rankRecords([{ who: "a", n: 0 }])).toEqual({ top: [], rest: [] });
  });
});

describe("pathClockwise / layoutMotion", () => {
  // y донизу: (0,0) → (10,0) → (10,10) → (0,10) — на екрані за годинниковою стрілкою.
  const cw = "M0 0L10 0L10 10L0 10Z";
  const ccw = "M0 0L0 10L10 10L10 0Z";
  it("знак площі: за годинниковою — true, проти — false, менше трьох точок — null", () => {
    expect(pathClockwise(cw)).toBe(true);
    expect(pathClockwise(ccw)).toBe(false);
    expect(pathClockwise("M0 0L1 1")).toBeNull();
  });
  it("значок: напрям гонки = обхід шляху — forward, інакше reverse; траса без запису — null", () => {
    expect(layoutMotion("vegas", ccw)).toBe("forward"); // Лас-Вегас — проти годинникової (користувач 15.11)
    expect(layoutMotion("vegas", cw)).toBe("reverse");
    expect(layoutMotion("monza", cw)).toBe("forward");
    expect(layoutMotion("pescara", cw)).toBeNull();
  });
});

describe("latestKey", () => {
  it("найпізніша гонка: рік, потім етап; порожньо — null", () => {
    expect(latestKey([{ year: 2025, round: 24 }, { year: 2026, round: 3 }, { year: 2026, round: 20 }])).toEqual({ year: 2026, round: 20 });
    expect(latestKey([])).toBeNull();
  });
});

describe("getHomePage — 2026 (фікстура db.yml)", () => {
  it("сезон: 20 з 23, чемпіон Антонеллі (вирішено), смуга 23 етапи — 20 done, 21 next", async () => {
    const p = await getHomePage("uk");
    expect([p.season, p.done, p.total, p.phase]).toEqual([2026, 20, 23, "running"]);
    expect([p.champion?.driver.id, p.champion?.decided]).toEqual(["antonelli", true]);
    expect(p.rail).toHaveLength(23);
    expect(p.rail.filter((r) => r.state === "done")).toHaveLength(20);
    expect(p.rail.find((r) => r.state === "next")?.round).toBe(21);
  });

  it("остання гонка — етап 20 (Бразилія; назва Jolpica 2026 — «Brazilian Grand Prix»), перша десятка з місцями 1–10; наступна — 21 Лас-Вегас з часом старту", async () => {
    const p = await getHomePage("uk");
    expect([p.last?.year, p.last?.round, p.last?.gp]).toEqual([2026, 20, "Гран-прі Бразилії"]);
    expect(p.last?.results.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([p.next?.round, p.next?.gp, p.next?.raceAt]).toEqual([21, "Гран-прі Лас-Вегаса", "2026-11-22T04:00:00+00:00"]);
    expect(p.next?.circuit?.slug).toBe("vegas");
    expect(p.next?.circuit?.layout?.d).toMatch(/^M/);
    // Лас-Вегас — проти годинникової; значок рухається так, щоб збігтися з напрямом гонки (не null).
    expect(["forward", "reverse"]).toContain(p.next?.circuit?.motion);
  });

  it("рекорди: перемоги — Гамільтон; титули — Шумахер і Гамільтон по 7; Кубки — Ferrari", async () => {
    const p = await getHomePage("uk");
    expect(p.records.wins.top.map((r) => r.who.id)).toEqual(["hamilton"]);
    expect(p.records.titles.top.map((r) => r.who.id).sort()).toEqual(["hamilton", "michael_schumacher"]);
    expect(p.records.titles.top[0]?.n).toBe(7);
    expect(p.records.cups.top.map((r) => r.who.id)).toEqual(["ferrari"]);
  });

  it("залік — усі пілоти поточного сезону після 20-го етапу (прокручуваний список, як у макеті); відлік — етапи 21–23", async () => {
    const p = await getHomePage("uk");
    expect([p.phase, p.standings.season, p.standings.final, p.standings.afterRound]).toEqual(["running", 2026, false, 20]);
    expect(p.standings.drivers.length).toBeGreaterThan(10);
    expect(p.standings.drivers.map((r) => r.position).slice(0, 3)).toEqual([1, 2, 3]);
    expect(p.upcoming.map((r) => r.round)).toEqual([21, 22, 23]);
  });

  it("міжсезоння (календар 2027 без результатів): чемпіон і залік — 2026, фаза «ahead», остання гонка — 2026", async () => {
    ahead.on = true;
    try {
      const p = await getHomePage("uk");
      expect([p.season, p.phase]).toEqual([2027, "ahead"]);
      expect([p.champion?.season, p.champion?.driver.id]).toEqual([2026, "antonelli"]);
      expect(p.standings.season).toBe(2026);
      expect(p.standings.drivers.length).toBeGreaterThan(10);
      expect(p.last?.year).toBe(2026);
    } finally {
      ahead.on = false;
    }
  });

  it("цифри героя: сезони з 1950, трас 78; атрибуція фото без дублів", async () => {
    const p = await getHomePage("uk");
    expect(p.stats.first).toBe(1950);
    expect(p.stats.circuits).toBe(78);
    const hrefs = p.credits.photos.map((c) => c.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
