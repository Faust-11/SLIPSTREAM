import { describe, expect, it, vi } from "vitest";
import grandsPrix from "@/data/curated/grands-prix.json";
import teamWins from "../../../../e2e/fixtures/db/team_wins.json";
import teamTotals from "../../../../e2e/fixtures/db/team_totals.json";
import { getTeamIds, getTeamPage, gpName, insights } from "../team-page";
import type { TeamSeasonRow } from "../types";

vi.mock("@/lib/data/db", () => import("@/lib/data/__tests__/db-fixture"));

describe("getTeamPage — McLaren (еталон: Вікіпедія 12.11 — 1013 стартів, 206 перемог, 566 подіумів, 181 поул, 10 + 13 титулів)", () => {
  it("підсумки", async () => {
    const p = (await getTeamPage("mclaren", "uk"))!;
    const t = p.totals;
    expect([t.grands_prix, t.wins, t.podiums, t.poles, t.constructors_titles, t.drivers_titles]).toEqual([1013, 206, 566, 181, 10, 13]);
    expect(p.debut).toEqual({ year: 1966, name: "Гран-прі Монако" });
  });

  it("сезони — від нових до старих; 2007 виключена; 2026 триває; Кубки — 10 сезонів", async () => {
    const p = (await getTeamPage("mclaren", "en"))!;
    expect(p.seasons[0]!.year).toBe(p.currentSeason);
    expect(p.seasons[0]!.in_progress).toBe(true);
    const s2007 = p.seasons.find((s) => s.year === 2007)!;
    expect([s2007.excluded, s2007.position, s2007.wins]).toEqual([true, null, 8]);
    expect(p.seasons.filter((s) => s.champion).map((s) => s.year).sort()).toEqual([1974, 1984, 1985, 1988, 1989, 1990, 1991, 1998, 2024, 2025]);
  });

  it("висновки: 4 Кубки поспіль 1988–1991; 15 перемог із 16 гонок 1988; перерва 26 років 1998→2024; виключення 2007", async () => {
    const { insights: i } = (await getTeamPage("mclaren", "uk"))!;
    expect(i.titleStreak).toEqual({ count: 4, from: 1988, to: 1991 });
    expect(i.bestSeason).toEqual({ wins: 15, races: 16, year: 1988 });
    expect(i.longestWait).toEqual({ years: 26, from: 1998, to: 2024 });
    expect(i.excluded).toEqual([2007]);
  });

  it("чемпіони — 8 пілотів, 13 титулів, по першому титулу; імена українською", async () => {
    const p = (await getTeamPage("mclaren", "uk"))!;
    expect(p.champions).toHaveLength(8);
    expect(p.champions.reduce((n, c) => n + c.years.length, 0)).toBe(13);
    expect(p.champions[0]!.driver.name).toBe("Емерсон Фіттіпальді");
    expect(p.champions.find((c) => c.driver.id === "senna")!.years).toEqual([1988, 1990, 1991]);
  });

  it("перемоги: перша — Бельгія 1968, Брюс Макларен; 200-та й остання; за пілотами — сума = перемоги (без спільних)", async () => {
    const { wins } = (await getTeamPage("mclaren", "uk"))!;
    expect(wins.list).toHaveLength(206);
    expect(wins.featured.map((f) => [f.kind, f.win.n])).toEqual([["first", 1], ["milestone", 200], ["latest", 206]]);
    expect(wins.featured[0]!.win).toMatchObject({ year: 1968, name: "Гран-прі Бельгії" });
    expect(wins.featured[0]!.win.drivers[0]!.id).toBe("mclaren");
    expect(wins.byDriver.reduce((n, d) => n + d.count, 0)).toBe(206);
    expect(wins.byDriver[0]!.driver.id).toBe("senna");
  });

  it("пара поточного сезону — двоє, з очками й «хто попереду»", async () => {
    const p = (await getTeamPage("mclaren", "en"))!;
    expect(p.pairing!.drivers.map((d) => d.id)).toEqual(["norris", "piastri"]);
    expect(p.pairing!.drivers[0]!.name).toBe("Lando Norris");
    for (const d of p.pairing!.drivers) expect(d.race_ahead).toBeLessThanOrEqual(d.races);
  });
});

describe("межові команди", () => {
  it("Andrea Moda — 1 Гран-прі, без перемог і Кубків: порожні блоки, а не нулі", async () => {
    const p = (await getTeamPage("andrea-moda", "uk"))!;
    expect(p.totals.grands_prix).toBe(1);
    expect(p.wins.list).toEqual([]);
    expect(p.wins.featured).toEqual([]);
    expect(p.champions).toEqual([]);
    expect(p.pairing).toBeNull();
    expect(p.insights).toEqual({ titleStreak: null, bestSeason: null, longestWait: null, excluded: [] });
  });

  it("невідома команда — null (сторінка 404)", async () => {
    expect(await getTeamPage("nope", "uk")).toBeNull();
  });

  it("сторінки для всіх 165 команд; кожна має підсумки в базі", async () => {
    const ids = getTeamIds();
    expect(ids).toHaveLength(165);
    const totals = new Set(teamTotals.map((t) => t.id));
    expect(ids.filter((id) => !totals.has(id))).toEqual([]);
  });
});

describe("переклади", () => {
  it("кожна назва Гран-прі з фікстури має український переклад", () => {
    const names = new Set([...teamWins.map((w) => w.name), ...teamTotals.flatMap((t) => [t.debut_name, t.last_name])]);
    const dict = (grandsPrix as { names: Record<string, string> }).names;
    expect([...names].filter((n) => !dict[n])).toEqual([]);
    expect(gpName("Belgian Grand Prix", "en")).toBe("Belgian Grand Prix");
  });
});

describe("insights — рівність і краї", () => {
  const s = (year: number, champion: boolean, wins = 0, races = 10): TeamSeasonRow => ({
    id: "x", year, entries: ["X"], grands_prix: races, wins, podiums: 0, position: champion ? 1 : 5,
    points: 0, excluded: false, champion, in_progress: false, season_races: races,
  });
  it("однакова кількість перемог — вищий відсоток, далі раніший сезон", () => {
    expect(insights([s(1990, false, 8, 16), s(1991, false, 8, 10), s(1992, false, 8, 10)]).bestSeason).toEqual({ wins: 8, races: 10, year: 1991 });
  });
  it("один Кубок — ні серії, ні перерви", () => {
    expect(insights([s(1990, true)])).toMatchObject({ titleStreak: null, longestWait: null });
  });
});
