import { describe, expect, it, vi } from "vitest";
import { getCalendarPage, getCalendarSeason, roundStates } from "../calendar";

vi.mock("@/lib/data/db", async () => {
  const fx = await import("@/lib/data/__tests__/db-fixture");
  return { dbSelect: fx.dbSelect, dbSelectAll: fx.dbSelect };
});

describe("roundStates", () => {
  it("проведені — done, перший непроведений — next, решта — later", () => {
    expect(roundStates([true, true, false, false])).toEqual(["done", "done", "next", "later"]);
    expect(roundStates([true, true])).toEqual(["done", "done"]);
    expect(roundStates([false])).toEqual(["next"]);
  });
});

describe("getCalendarPage — 2026 (еталон — макет «Календар 2026» і db.yml)", () => {
  const page = async () => getCalendarPage("uk");

  it("сезон 2026: 23 етапи, проведено 20, спринтів 6; чемпіон Антонеллі, Кубок Mercedes — вирішено", async () => {
    expect(await getCalendarSeason()).toBe(2026);
    const p = await page();
    expect([p.season, p.total, p.done, p.sprints, p.inProgress, p.decided]).toEqual([2026, 23, 20, 6, true, true]);
    expect([p.champion?.id, p.cup?.team.id, p.cup?.decided]).toEqual(["antonelli", "mercedes", true]);
  });

  it("скасований етап — окремо (Саудівська Аравія), не картка", async () => {
    const p = await page();
    expect(p.cancelled.map((c) => c.gp)).toEqual(["Гран-прі Саудівської Аравії"]);
    expect(p.cards.map((c) => c.round)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
  });

  it("стани: 1–20 done, 21 next (Лас-Вегас), 22–23 later", async () => {
    const p = await page();
    expect(p.cards.filter((c) => c.state === "done")).toHaveLength(20);
    const next = p.cards.find((c) => c.state === "next")!;
    expect([next.round, next.gp, next.raceAt]).toEqual([21, "Гран-прі Лас-Вегаса", "2026-11-22T04:00:00+00:00"]);
    expect(p.cards.filter((c) => c.state === "later").map((c) => c.round)).toEqual([22, 23]);
  });

  it("етап 1: Расселл з поулу, Mercedes; етап 2 (спринт): Антонеллі, спринт — Расселл (макет)", async () => {
    const p = await page();
    const r1 = p.cards[0]!;
    expect([r1.winners.map((w) => w.id), r1.poles.flat().map((d) => d.id), r1.winners[0]?.team?.id, r1.circuitSlug]).toEqual([
      ["russell"], ["russell"], "mercedes", "albert-park",
    ]);
    expect(r1.color).not.toBeNull();
    const r2 = p.cards[1]!;
    expect([r2.sprint, r2.winners.map((w) => w.id), r2.sprintWinners.map((d) => d.id)]).toEqual([true, ["antonelli"], ["russell"]]);
  });

  it("розклад: Лас-Вегас — FP1 20.11 00:30 UTC … гонка 22.11 04:00 UTC; у кожного етапу є час гонки", async () => {
    const p = await page();
    const lv = p.cards.find((c) => c.round === 21)!;
    expect(lv.sessions.map((s) => [s.kind, s.at])).toEqual([
      ["FP1", "2026-11-20T00:30:00+00:00"],
      ["FP2", "2026-11-20T04:00:00+00:00"],
      ["FP3", "2026-11-21T00:30:00+00:00"],
      ["Q1", "2026-11-21T04:00:00+00:00"],
      ["R", "2026-11-22T04:00:00+00:00"],
    ]);
    expect(p.cards.filter((c) => !c.raceAt).map((c) => c.round)).toEqual([]);
  });

  it("легенда смуги — команди-переможці за кількістю перемог; сума = проведені етапи з одним переможцем", async () => {
    const p = await page();
    expect(p.legend[0]?.team.id).toBe("mercedes");
    expect(p.legend.reduce((s, l) => s + l.wins, 0)).toBe(p.cards.filter((c) => c.color !== null).length);
  });

  it("залік: лідер — Антонеллі; сусідній сезон — 2025", async () => {
    const p = await page();
    expect(p.drivers[0]?.driver.id).toBe("antonelli");
    expect(p.prev?.year).toBe(2025);
  });
});
