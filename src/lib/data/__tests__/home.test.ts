import { describe, expect, it, vi } from "vitest";
import { getHomePage, latestKey, rankRecords } from "../home";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/db", async () => {
  const fx = await import("@/lib/data/__tests__/db-fixture");
  return { dbSelect: fx.dbSelect, dbSelectAll: fx.dbSelect };
});
// Новини — окремі тести (news.test.ts); тут лише склейка сторінки.
vi.mock("@/lib/data/news", () => ({
  getNews: async () => ({ fetchedAt: "2026-11-14T00:00:00Z", headlines: [], posts: [], stats: { merged: 0, own: 0, f1: 0 }, failed: [] }),
}));

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

describe("latestKey", () => {
  it("найпізніша гонка: рік, потім етап; порожньо — null", () => {
    expect(latestKey([{ year: 2025, round: 24 }, { year: 2026, round: 3 }, { year: 2026, round: 20 }])).toEqual({ year: 2026, round: 20 });
    expect(latestKey([])).toBeNull();
  });
});

describe("getHomePage — 2026 (фікстура db.yml)", () => {
  it("сезон: 20 з 23, чемпіон Антонеллі (вирішено), смуга 23 етапи — 20 done, 21 next", async () => {
    const p = await getHomePage("uk");
    expect([p.season, p.done, p.total, p.inProgress]).toEqual([2026, 20, 23, true]);
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
  });

  it("рекорди: перемоги — Гамільтон; титули — Шумахер і Гамільтон по 7; Кубки — Ferrari", async () => {
    const p = await getHomePage("uk");
    expect(p.records.wins.top.map((r) => r.who.id)).toEqual(["hamilton"]);
    expect(p.records.titles.top.map((r) => r.who.id).sort()).toEqual(["hamilton", "michael_schumacher"]);
    expect(p.records.titles.top[0]?.n).toBe(7);
    expect(p.records.cups.top.map((r) => r.who.id)).toEqual(["ferrari"]);
  });

  it("цифри героя: сезони з 1950, трас 78; атрибуція фото без дублів", async () => {
    const p = await getHomePage("uk");
    expect(p.stats.first).toBe(1950);
    expect(p.stats.circuits).toBe(78);
    const hrefs = p.credits.photos.map((c) => c.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
