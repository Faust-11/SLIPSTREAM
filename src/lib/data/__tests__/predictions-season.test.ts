import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Рев'ю 21.11 (A): сезон прогнозу беремо з ТОГО Ж календаря, з якого етапи. Розбіжність, яка буде після Абу-Дабі: календар
 * (calendar_sessions) уже 2027, а site_meta.current_season (і результати) — ще 2026. Тоді сторінка показувала етапи 2027 з
 * year=2026 у запитах → база відповідала 409/unknown_round. Результати для «команди без фінішу» — останнього сезону, де вони є.
 */
const calls = vi.hoisted(() => ({ results: [] as string[], views: [] as string[] }));

vi.mock("../calendar", () => ({
  getCalendarPage: async () => ({
    season: 2027,
    cards: [
      {
        round: 1,
        gp: "Гран-прі Австралії",
        place: "Мельбурн",
        date: "2027-03-14",
        state: "next",
        sprint: false,
        sessions: [{ kind: "Q1", at: "2027-03-13T05:00:00+00:00", real: true }],
      },
    ],
  }),
}));
vi.mock("../drivers", () => ({
  loadDriverIndex: async () => [{ id: "max_verstappen", forename: "Max", surname: "Verstappen", code: "VER", current_number: 3, current_position: 1 }],
  driverName: () => "Макс Ферстаппен",
}));
vi.mock("../teams", () => ({
  curatedTeams: [{ id: "red-bull", name: "Red Bull", color: "#1B2B6B" }],
  curatedDrivers: {},
}));
vi.mock("../db", () => ({
  dbSelect: async (view: string) => {
    calls.views.push(view);
    if (view === "site_meta") return [{ current_season: 2026 }];
    if (view === "team_index") return [{ id: "red-bull", current_position: 1, current_drivers: ["max_verstappen"] }];
    if (view === "drivers") return [{ id: 831, ref: "max_verstappen" }];
    throw new Error(`несподіване подання ${view}`);
  },
  dbSelectAll: async (view: string, query: string) => {
    calls.results.push(`${view}?${query}`);
    return [{ driver_id: 831, team_id: 191, sessions: { type: "R", rounds: { season_year: 2026, number: 23 } } }];
  },
}));

beforeEach(() => {
  calls.results.length = 0;
  calls.views.length = 0;
});

describe("getPredictionsData: сезон прогнозу = сезон календаря", () => {
  it("календар 2027, site_meta і результати 2026: сезон і етапи — 2027, команди — з результатів 2026", async () => {
    const { getPredictionsData } = await import("../predictions");
    const data = await getPredictionsData("uk");
    expect(data.season).toBe(2027);
    expect(data.rounds.map((r) => r.round)).toEqual([1]);
    expect(data.rounds[0]!.deadlineAt).toBe("2027-03-13T04:55:00.000Z");
    // «Команда без фінішу» — із результатів останнього сезону, де вони є (2026): саме ці team_id є в f1.results.
    expect(calls.results).toHaveLength(1);
    expect(calls.results[0]).toContain("sessions.rounds.season_year=eq.2026");
    expect(data.teams).toEqual([{ id: 191, slug: "red-bull", name: "Red Bull", color: "#1B2B6B" }]);
    expect(data.drivers.map((d) => d.id)).toEqual([831]);
  });
});
