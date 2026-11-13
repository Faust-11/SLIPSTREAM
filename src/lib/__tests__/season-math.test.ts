import { describe, expect, it } from "vitest";
import seasonIndex from "../../../e2e/fixtures/db/season_index.json";
import seasonPoints from "../../../e2e/fixtures/db/season_points.json";
import seasonRounds from "../../../e2e/fixtures/db/season_rounds.json";
import seasonRules from "../../../e2e/fixtures/db/season_rules.json";
import {
  counted,
  decidingRound,
  halfPointRounds,
  jolpicaRule,
  leadersByRound,
  leadSpells,
  maxDeficit,
  observedMax,
  reproduces,
  seasonRules as rulesFor,
  type SeasonData,
  type SeasonPointsRow,
} from "../season-math";

// Фікстура — та сама, що для e2e (e2e/fixtures/db, вивантажена з CI-бази db.yml). Еталони — docs/decisions.md (3f).
type RoundRow = (typeof seasonRounds)[number];
const pointsOf = (y: number) => (seasonPoints as (SeasonPointsRow & { year: number })[]).filter((r) => r.year === y);
const roundsOf = (y: number) =>
  (seasonRounds as RoundRow[]).filter((r) => r.year === y && r.round !== null && !r.cancelled).sort((a, b) => a.round! - b.round!);
function season(y: number): SeasonData {
  const rs = roundsOf(y);
  return { rounds: rs.map((r) => r.round!), sprintRounds: new Set(rs.filter((r) => r.sprint).map((r) => r.round!)), rows: pointsOf(y) };
}
const ruleOf = (y: number) => {
  const r = seasonRules.find((x) => x.year === y)!;
  return jolpicaRule(r.driver_best_results, r.driver_season_split, roundsOf(y).length);
};
const completed = seasonIndex.filter((s) => !s.in_progress).map((s) => s.year);

describe("правило заліку", () => {
  it("1988: Прост — 105 усього, 87 зарахованих (11 кращих)", () => {
    const vals = roundsOf(1988).map((r) => pointsOf(1988).find((p) => p.driver === "prost" && p.round === r.round));
    const v = vals.map((p) => (p ? p.race_points + p.sprint_points : 0));
    expect(counted(v, { kind: "all" })).toBe(105);
    expect(counted(v, { kind: "best", n: 11 })).toBe(87);
  });

  it("правило Jolpica відтворює залік усіх пілотів у всіх завершених сезонах, крім 1955, 1956, 1967, 1977 (замір 13.11)", () => {
    const bad = completed.filter((y) => !reproduces(season(y), ruleOf(y)!));
    expect(bad).toEqual([1955, 1956, 1967, 1977]);
  });

  it("де правило Jolpica не відтворює — виводимо з даних: 1967 і 1977 знаходяться, 1955 і 1956 — ні (спільні машини)", () => {
    expect(rulesFor(season(1967), ruleOf(1967)).length).toBeGreaterThan(0);
    expect(rulesFor(season(1977), ruleOf(1977)).length).toBeGreaterThan(0);
    expect(rulesFor(season(1955), ruleOf(1955))).toEqual([]);
    expect(rulesFor(season(1956), ruleOf(1956))).toEqual([]);
  });
});

describe("вирішальний етап", () => {
  const decided = (y: number) => {
    const s = season(y);
    return decidingRound(s, rulesFor(s, ruleOf(y)), observedMax(s.rows));
  };

  it.each([
    [1964, 10, "surtees"],
    [1977, 15, "lauda"],
    [1985, 14, "prost"],
    [1988, 15, "senna"], // нічия за очками можлива (87), але перемог у Сенни більше — вирішено в Сузуці
    [1992, 11, "mansell"],
    [2002, 11, "michael_schumacher"],
    [2004, 14, "michael_schumacher"],
    [2011, 15, "vettel"],
    [2020, 14, "hamilton"],
    [2021, 22, "max_verstappen"],
    [2023, 17, "max_verstappen"],
    [2024, 22, "max_verstappen"],
    [2025, 24, "norris"],
  ])("%i — після етапу %i (%s)", (y, round, driver) => {
    expect(decided(y)).toEqual({ round, driver });
  });

  it("1960 — етап 9: після Португалії Мак-Ларен ще міг набрати 42 проти 40 (математика, а не переказ)", () => {
    expect(decided(1960)).toEqual({ round: 9, driver: "jack_brabham" });
  });

  it("1955 і 1956 — без висновку (правило не відтворює залік)", () => {
    expect(decided(1955)).toBeNull();
    expect(decided(1956)).toBeNull();
  });

  it("кожен завершений сезон, де висновок є: чемпіон — той, хто вирішив титул", () => {
    const wrong = completed.flatMap((y) => {
      const d = decided(y);
      const champ = seasonIndex.find((s) => s.year === y)!.driver;
      return d && d.driver !== champ ? [[y, d.driver, champ]] : [];
    });
    expect(wrong).toEqual([]);
  });
});

describe("лідери, відставання, половина очок", () => {
  it("2025: Норріс 1–4, Піастрі 5–19, Норріс 20–24 (макет)", () => {
    expect(leadSpells(leadersByRound(pointsOf(2025)))).toEqual([
      { driver: "norris", from: 1, to: 4 },
      { driver: "piastri", from: 5, to: 19 },
      { driver: "norris", from: 20, to: 24 },
    ]);
  });

  it("2025: найбільше відставання Ферстаппена — 104 очки після 15-го етапу (Зандворт, макет)", () => {
    expect(maxDeficit(pointsOf(2025), "max_verstappen")).toEqual({ round: 15, points: 104 });
  });

  it("половина очок 1950–2025 — рівно 6 гонок (замір на дампі)", () => {
    const all = completed.flatMap((y) => [...halfPointRounds(roundsOf(y))].map((r) => [y, r]));
    expect(all).toEqual([
      [1975, 4],
      [1975, 12],
      [1984, 6],
      [1991, 16],
      [2009, 2],
      [2021, 12],
    ]);
  });
});
