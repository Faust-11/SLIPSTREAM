import { describe, expect, it, vi } from "vitest";
import circuitsJson from "@/data/curated/circuits.json";
import { circuitSlug, leaders, modeOf, ranking, spansLabel, yearSpans } from "@/lib/circuit-math";
import { circuitBySlug, getCircuitPage, getCircuitRefs, getCircuitsIndex } from "../circuits";

vi.mock("@/lib/data/db", async () => {
  const fx = await import("@/lib/data/__tests__/db-fixture");
  return { dbSelect: fx.dbSelect, dbSelectAll: fx.dbSelect };
});

describe("circuit-math", () => {
  it("проміжки років і підпис (макет «Список трас»)", () => {
    expect(yearSpans([1953, 1950, 1951, 1951])).toEqual([[1950, 1951], [1953, 1953]]);
    expect(spansLabel([[1950, 1979], [1981, 2026]])).toBe("1950–1979, 1981–2026");
    expect(spansLabel([[1950, 1950], [1955, 2019], [2021, 2026]])).toBe("1950, 1955–2019, 2021–2026");
    expect(spansLabel([[1950, 1954], [1956, 1956], [1958, 1958], [1987, 2026]])).toBe("1950–1954 … 1987–2026");
  });
  it("лідери з нічиїми, рейтинг, мода", () => {
    expect(leaders(new Map([["a", 2], ["b", 3], ["c", 3]]))).toEqual({ ids: ["b", "c"], n: 3 });
    expect(leaders(new Map())).toBeNull();
    expect(ranking(new Map([["a", 1], ["b", 3], ["c", 3], ["d", 2]]), 3)).toEqual([{ id: "b", n: 3 }, { id: "c", n: 3 }, { id: "d", n: 2 }]);
    expect(modeOf([58, 58, 55, 1])).toBe(58);
    expect(modeOf([])).toBeNull();
  });
  it("слаг: «_» → «-», унікальний для всіх трас бази", async () => {
    expect(circuitSlug("yas_marina")).toBe("yas-marina");
    const refs = await getCircuitRefs();
    expect(new Set(refs.map(circuitSlug)).size).toBe(refs.length);
    expect(await circuitBySlug("yas-marina")).toBe("yas_marina");
    expect(await circuitBySlug("nope")).toBeNull();
  });
});

describe("getCircuitsIndex (макет «Список трас»)", () => {
  it("числа вступу: 78 трас, 34 країни, 23 у календарі 2026", async () => {
    const { facts } = await getCircuitsIndex("uk");
    expect(facts).toEqual({ circuits: 78, countries: 34, onCalendar: 23, season: 2026 });
  });
  it("картки: гонки, роки, найбільше перемог", async () => {
    const { cards } = await getCircuitsIndex("uk");
    const by = (ref: string) => cards.find((c) => c.ref === ref)!;
    expect(cards[0]!.ref).toBe("monza");
    expect([by("monza").races, by("monza").spansLabel, by("monza").topWinners!.drivers.map((d) => d.id), by("monza").topWinners!.wins]).toEqual([
      76, "1950–1979, 1981–2026", ["michael_schumacher", "hamilton"], 5,
    ]);
    expect([by("monaco").races, by("monaco").spansLabel, by("monaco").topWinners!.drivers.map((d) => d.id), by("monaco").topWinners!.wins]).toEqual([
      72, "1950, 1955–2019, 2021–2026", ["senna"], 6,
    ]);
    expect([by("silverstone").spansLabel, by("silverstone").topWinners!.wins]).toEqual(["1950–1954 … 1987–2026", 9]);
    expect([by("yas_marina").place, by("yas_marina").country, by("yas_marina").onCalendar]).toEqual(["Абу-Дабі", "ОАЕ", true]);
    expect(by("pescara").onCalendar).toBe(false);
  });
  it("у кожної траси — місце й країна обома мовами (новий код країни ловить тест)", async () => {
    const places = (circuitsJson as unknown as { places: Record<string, unknown> }).places;
    for (const l of ["uk", "en"] as const) {
      const { cards } = await getCircuitsIndex(l);
      expect(cards.filter((c) => !c.country || !places[c.ref]).map((c) => c.ref)).toEqual([]);
    }
  });
  it("пошук: обидві мови й код країни", async () => {
    const { cards } = await getCircuitsIndex("en");
    const yas = cards.find((c) => c.ref === "yas_marina")!;
    expect(yas.search).toContain("абу-дабі");
    expect(yas.search).toContain("abu dhabi");
    expect(yas.search).toContain("are");
  });
});

describe("getCircuitPage — Яс-Марина (еталон — макет)", () => {
  const page = async () => (await getCircuitPage("yas_marina", "uk"))!;

  it("смуга: 17 Гран-прі, 7 переможців, 12 з поулу, P4 — Райкконен 2012, 14 фіналів, 5 титулів", async () => {
    const { strip } = await page();
    expect([strip.races, strip.winners, strip.fromPole, strip.finales, strip.titles]).toEqual([17, 7, 12, 14, 5]);
    expect([strip.furthest?.grid, strip.furthest?.year, strip.furthest?.driver.id]).toEqual([4, 2012, "raikkonen"]);
  });

  it("факти enwiki: 5,281 км, 16 поворотів, 58 кіл, ≈306,3 км, рекорд 1:25.637 Магнуссена 2024", async () => {
    const { facts } = await page();
    expect([facts!.lengthKm, facts!.turns, facts!.laps, facts!.distanceKm, facts!.layoutFrom]).toEqual([5.281, 16, 58, 306.3, 2021]);
    expect([facts!.record?.ms, facts!.record?.driver.id, facts!.record?.year]).toEqual([85637, "kevin_magnussen", 2024]);
    expect([facts!.opened, facts!.architects, facts!.capacity]).toEqual(["2009-10-30", ["Hermann Tilke"], 60000]);
    expect(facts!.source.href).toMatch(/^https:\/\/en\.wikipedia\.org\/w\/index\.php\?oldid=\d+$/);
  });

  it("наступна гонка: етап 23 сезону 2026, 6 грудня", async () => {
    expect((await page()).next).toEqual({ season: 2026, round: 23, date: "2026-12-06" });
  });

  it("таблиця гонок: від новішої; 2012 — Райкконен з P4, поул Гамілтон, коло Феттеля 1:43.964", async () => {
    const { races } = await page();
    expect(races.map((r) => r.year)).toEqual([2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2009]);
    const r12 = races.find((r) => r.year === 2012)!;
    expect([r12.winners.map((w) => w.id), r12.grid, r12.poles.flat().map((d) => d.id), r12.fastest?.driver.id, r12.fastest?.ms]).toEqual([
      ["raikkonen"], 4, ["hamilton"], "vettel", 103964,
    ]);
    expect(races.filter((r) => r.title).map((r) => r.year)).toEqual([2025, 2021, 2016, 2014, 2010]);
    expect([races.find((r) => r.year === 2021)!.current, races.find((r) => r.year === 2020)!.current]).toEqual([true, false]);
  });

  it("титули тут: 2021 — 369,5 = 369,5 до, 395,5 : 387,5 після (половина очків Бельгії; макет округлював); 2025 — Норріс 408 → 423", async () => {
    const { titles } = await page();
    const t21 = titles.find((t) => t.year === 2021)!;
    expect(t21.champion.id).toBe("max_verstappen");
    expect(t21.before.slice(0, 2).map((x) => x.points)).toEqual([369.5, 369.5]);
    expect(t21.after.slice(0, 2).map((x) => [x.driver.id, x.points])).toEqual([["max_verstappen", 395.5], ["hamilton", 387.5]]);
    const t25 = titles.find((t) => t.year === 2025)!;
    expect([t25.champion.id, t25.before[0]!.driver.id, t25.before[0]!.points, t25.after[0]!.points]).toEqual(["norris", "norris", 408, 423]);
  });

  it("найуспішніші: перемоги Гамілтон 5 = Ферстаппен 5, Феттель 3; команди Red Bull 8, Mercedes 6; подіуми Гамілтон 10", async () => {
    const { leaders: l } = await page();
    expect(l.drivers.slice(0, 3).map((x) => [x.driver.id, x.n])).toEqual([["hamilton", 5], ["max_verstappen", 5], ["vettel", 3]]);
    expect(l.teams.slice(0, 3).map((x) => [x.team.id, x.n])).toEqual([["red-bull", 8], ["mercedes", 6], ["mclaren", 2]]);
    expect(l.podiums.slice(0, 3).map((x) => [x.driver.id, x.n])).toEqual([["hamilton", 10], ["vettel", 7], ["max_verstappen", 7]]);
  });

  it("Гран-прі траси: Абу-Дабі з 2009, триває", async () => {
    expect((await page()).gp).toEqual({ name: "Гран-прі Абу-Дабі", from: 2009, to: 2025, ongoing: true });
  });
});

describe("getCircuitPage — особливі випадки", () => {
  it("Пескара: одна гонка, поза календарем, без наступної гонки", async () => {
    const p = (await getCircuitPage("pescara", "en"))!;
    expect([p.strip.races, p.next, p.gp?.ongoing]).toEqual([1, null, false]);
  });
  it("найшвидше коло до 2004 — немає (дані неповні)", async () => {
    const p = (await getCircuitPage("monaco", "en"))!;
    expect(p.races.filter((r) => r.year < 2004).every((r) => r.fastest === null)).toBe(true);
    expect(p.races.find((r) => r.year === 2004)?.fastest).not.toBeNull();
  });
  it("неіснуюча траса — null", async () => {
    expect(await getCircuitPage("nope", "uk")).toBeNull();
  });
});
