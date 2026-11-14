// Сезон календаря без результатів (рев'ю PR #19, висока): календар 2027 у дампі після фіналу 2026 — сторінка будується
// з season_rounds без заліку, а не падає (getSeasonPage(2027) = null: сезону немає в season_index).
import { describe, expect, it, vi } from "vitest";
import { getCalendarPage, raceStart } from "../calendar";

vi.mock("@/lib/data/db", async () => {
  const fx = await import("@/lib/data/__tests__/db-fixture");
  const r2027 = (round: number, date: string, sprint = false) => ({
    year: 2027, round, name: round === 1 ? "Australian Grand Prix" : "Chinese Grand Prix", date, cancelled: false,
    circuit: round === 1 ? "albert_park" : "shanghai", locality: round === 1 ? "Melbourne" : "Shanghai",
    country: round === 1 ? "Australia" : "China", sprint, winners: null, winner_points: null, poles: null,
    sprint_winners: null, disqualified: [],
  });
  const select = async <T,>(view: string, query = ""): Promise<T[]> => {
    if (view === "calendar_sessions")
      return [
        { year: 2027, round: 1, sessions: [{ k: "FP1", n: 1, at: "2027-03-05T01:30:00+00:00", real: true }, { k: "R", n: 7, at: "2027-03-07T04:00:00+00:00", real: true }] },
        // Час гонки ще невідомий (північ у базі) — raceAt = кінець дня, а не 00:00.
        { year: 2027, round: 2, sessions: [{ k: "R", n: 7, at: "2027-03-14T00:00:00+00:00", real: false }] },
      ] as T[];
    const rows = await fx.dbSelect<T>(view, query);
    return view === "season_rounds" ? ([...rows, r2027(1, "2027-03-07"), r2027(2, "2027-03-14", true)] as T[]) : rows;
  };
  return { dbSelect: select, dbSelectAll: select };
});

describe("getCalendarPage — сезон без результатів (2027)", () => {
  it("будується з season_rounds: усі етапи попереду, без заліку, легенди й чемпіона; попередній сезон — 2026", async () => {
    const p = await getCalendarPage("uk");
    expect([p.season, p.started, p.total, p.done, p.sprints, p.champion, p.cup, p.drivers, p.teams, p.legend]).toEqual([
      2027, false, 2, 0, 1, null, null, [], null, [],
    ]);
    expect(p.cards.map((c) => [c.round, c.state])).toEqual([[1, "next"], [2, "later"]]);
    expect(p.prev?.year).toBe(2026);
  });

  it("raceAt лише зі справжнього часу; невідомий — кінець дня гонки (UTC)", async () => {
    const p = await getCalendarPage("uk");
    expect(p.cards.map((c) => [c.raceAt, c.raceTimed])).toEqual([
      ["2027-03-07T04:00:00+00:00", true],
      ["2027-03-14T23:59:59Z", false],
    ]);
  });
});

describe("raceStart", () => {
  it("без сесії гонки — кінець дня етапу; без дати — null", () => {
    expect(raceStart([], "2027-03-21")).toEqual({ at: "2027-03-21T23:59:59Z", timed: false });
    expect(raceStart([], null)).toEqual({ at: null, timed: false });
  });
});

describe("liveStates (клієнтський стан етапів за часом)", async () => {
  const { liveStates } = await import("@/components/calendar/clock");
  const ats = ["2026-11-22T04:00:00+00:00", "2026-11-29T16:00:00+00:00", "2026-12-06T13:00:00+00:00"];
  it("до старту — перший next; після старту Лас-Вегаса — started, next — Катар; після фіналу — усі started", () => {
    expect(liveStates(ats, Date.parse("2026-11-15T12:00:00Z"))).toEqual(["next", "later", "later"]);
    expect(liveStates(ats, Date.parse("2026-11-22T04:00:00Z"))).toEqual(["started", "next", "later"]);
    expect(liveStates(ats, Date.parse("2026-12-06T13:00:10Z"))).toEqual(["started", "started", "started"]);
  });
});
