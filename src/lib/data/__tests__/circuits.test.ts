import { describe, expect, it, vi } from "vitest";
import circuitsJson from "@/data/curated/circuits.json";
import { circuitSlug, leaders, modeOf, ranking, rankingWithTies, spansLabel, yearSpans } from "@/lib/circuit-math";
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
  it("рейтинг з нічиїми: рівні на межі — усі (≤ cap) або «і ще» (рев'ю 13.11)", () => {
    const m = (xs: number[]) => new Map(xs.map((n, i) => [`d${i}`, n]));
    expect(rankingWithTies(m([5, 4, 3]), 7, 10)).toEqual({ rows: [{ id: "d0", n: 5 }, { id: "d1", n: 4 }, { id: "d2", n: 3 }], more: null });
    expect(rankingWithTies(m([6, 5, 5, 4, 3, 3, 3, 3]), 7, 10).rows).toHaveLength(8);
    expect(rankingWithTies(m([9, 5, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2]), 7, 10)).toEqual({
      rows: [{ id: "d0", n: 9 }, { id: "d1", n: 5 }, { id: "d2", n: 3 }, { id: "d3", n: 3 }],
      more: { count: 9, n: 2 },
    });
    expect(rankingWithTies(m([3, 2, 2, 2, 2, 2, 2, 1, 1]), 7, 10)).toEqual({ rows: rankingWithTies(m([3, 2, 2, 2, 2, 2, 2]), 7, 10).rows, more: null });
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
    expect(by("long_beach").topWinners).toEqual({ drivers: [], count: 8, wins: 1 }); // 8 переможців по 1 — лише кількість
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
  it("у кожної траси — коротка назва обома мовами (circuit_short_names.py)", () => {
    const places = (circuitsJson as unknown as { places: Record<string, { short?: { uk?: string; en?: string } }> }).places;
    expect(Object.entries(places).filter(([, p]) => !p.short?.uk || !p.short?.en).map(([k]) => k)).toEqual([]);
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
    expect([facts!.lengthKm, facts!.turns, facts!.laps, facts!.distanceKm, facts!.layoutYears]).toEqual([5.281, 16, 58, 306.3, { from: 2021, to: null }]);
    expect([facts!.record?.ms, facts!.record?.driver.id, facts!.record?.year]).toEqual([85637, "kevin_magnussen", 2024]);
    expect([facts!.opened, facts!.architects, facts!.capacity]).toEqual(["2009-10-30", ["Hermann Tilke"], 60000]);
    expect(facts!.source!.href).toMatch(/^https:\/\/en\.wikipedia\.org\/w\/index\.php\?oldid=\d+$/);
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
    expect(l.drivers.rows.slice(0, 3).map((x) => [x.driver.id, x.n])).toEqual([["hamilton", 5], ["max_verstappen", 5], ["vettel", 3]]);
    expect(l.teams.rows.slice(0, 3).map((x) => [x.team.id, x.n])).toEqual([["red-bull", 8], ["mercedes", 6], ["mclaren", 2]]);
    expect(l.podiums.rows.slice(0, 3).map((x) => [x.driver.id, x.n])).toEqual([["hamilton", 10], ["vettel", 7], ["max_verstappen", 7]]);
  });

  it("коротка назва в заголовку — «Яс-Марина» (рішення користувача 13.11), місце — «Абу-Дабі»", async () => {
    const p = await page();
    expect([p.short, p.place]).toEqual(["Яс-Марина", "Абу-Дабі"]);
    expect((await getCircuitPage("yas_marina", "en"))!.short).toBe("Yas Marina");
  });
  it("Гран-прі траси: Абу-Дабі з 2009, триває", async () => {
    expect((await page()).gp).toEqual({ name: "Гран-прі Абу-Дабі", from: 2009, to: 2025, ongoing: true });
  });
});

describe("getCircuitPage — правки рев'ю 13.11", () => {
  const pg = async (ref: string) => (await getCircuitPage(ref, "uk"))!;
  it("Гран-прі — нинішня назва в календарі: Мехіко з 2021 (не «Мексики з 1963»), Сепанг 2026 — Гран-прі Бахрейну", async () => {
    expect((await pg("rodriguez")).gp).toEqual({ name: "Гран-прі Мехіко", from: 2021, to: 2026, ongoing: true });
    expect((await pg("sepang")).gp?.name).toBe("Гран-прі Бахрейну в Малайзії");
    expect((await pg("rodriguez")).gpNames).toBe(2);
  });
  it("конфігурація — проміжок останньої гонки F1: Аделаїда 1985–1995, К'ялямі 1992–1993, Інтерлагос з 1999 (71 коло)", async () => {
    expect((await pg("adelaide")).facts!.layoutYears).toEqual({ from: 1985, to: 1995 });
    expect((await pg("kyalami")).facts!.layoutYears).toEqual({ from: 1992, to: 1993 });
    const i = await pg("interlagos");
    expect([i.facts!.layoutYears, i.facts!.laps]).toEqual([{ from: 1999, to: null }, 71]);
  });
  it("титули у фіналі: Сузука 4 з 6 фіналів (усього 12), Яс-Марина 5 з 14", async () => {
    const s = (await pg("suzuka")).strip;
    expect([s.finaleTitles, s.finales, s.titles]).toEqual([4, 6, 12]);
    const y = (await pg("yas_marina")).strip;
    expect([y.finaleTitles, y.finales]).toEqual([5, 14]);
  });
  it("«Перед гонкою» — трійка заліку до етапу (2010: Алонсо 246, Веббер 238, Феттель 231 — макет)", async () => {
    const t = (await pg("yas_marina")).titles.find((x) => x.year === 2010)!;
    expect(t.before.map((x) => [x.driver.id, x.points])).toEqual([["alonso", 246], ["webber", 238], ["vettel", 231]]);
  });
  it("рейтинг Монако не відкидає рівних: Росберг (3) поруч із Гамілтоном (3)", async () => {
    const ids = (await pg("monaco")).leaders.drivers.rows.map((x) => x.driver.id);
    expect(ids).toContain("rosberg");
    expect(ids).toContain("hamilton");
  });
  it("підпис фото — місце, а не URL Commons; JSON-LD — код країни й координати", async () => {
    const p = await getCircuitPage("americas", "en");
    expect(p!.credits.media[0]!.label).toBe("Austin");
    expect(p!.geo.country).toBe("US");
    expect(p!.geo.lat).not.toBeNull();
  });
});

describe("getCircuitPage — прогалини даних (відгук користувача 14.11)", () => {
  it("Лас-Вегас: картка «Las Vegas Strip Circuit» — 6,201 км, 17 поворотів, 50 кіл, рекорд 1:33.365 Ферстаппена 2025 (= formula1.com)", async () => {
    const f = (await getCircuitPage("vegas", "uk"))!.facts!;
    expect([f.lengthKm, f.turns, f.laps, f.record?.ms, f.record?.driver.id, f.record?.year, f.source?.title]).toEqual([
      6.201, 17, 50, 93365, "max_verstappen", 2025, "Las Vegas Strip Circuit",
    ]);
    expect(f.distanceKm).toBe(310); // ≈ (кола × довжина); formula1.com — 309,958 км (точна дистанція зі зміщенням старту)
  });

  it("Caesars Palace (1981–82): статті з карткою траси немає — кола й перший ГП з бази, без джерела Вікіпедії", async () => {
    const p = (await getCircuitPage("las_vegas", "uk"))!;
    expect([p.firstGp, p.facts?.laps, p.facts?.lengthKm, p.facts?.source]).toEqual([1981, 75, null, null]);
  });

  it("Лонг-Біч: конфігурація останньої гонки F1 (1983), а не нинішня IndyCar", async () => {
    const f = (await getCircuitPage("long_beach", "uk"))!.facts!;
    expect([f.lengthKm, f.layoutYears, f.record?.driver.id, f.record?.year]).toEqual([3.275, { from: 1983, to: 1983 }, "lauda", 1983]);
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
