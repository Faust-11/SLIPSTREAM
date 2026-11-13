import { describe, expect, it, vi } from "vitest";
import circuitsJson from "@/data/curated/circuits.json";
import seasonIndex from "../../../../e2e/fixtures/db/season_index.json";
import seasonRounds from "../../../../e2e/fixtures/db/season_rounds.json";
import { getSeasonPage, getSeasonYears, poleCars } from "../season-page";

vi.mock("@/lib/data/db", async () => {
  const fx = await import("@/lib/data/__tests__/db-fixture");
  return { dbSelect: fx.dbSelect, dbSelectAll: fx.dbSelect };
});

const page = async (y: number, l: "uk" | "en" = "uk") => (await getSeasonPage(y, l))!;

describe("getSeasonPage — 2025 (еталон — макет)", () => {
  it("ключові числа: 24 гонки, 6 спринтів, 4 переможці, 2 очки між першим і другим, 14 перемог McLaren", async () => {
    const p = await page(2025);
    expect(p.keys).toMatchObject({ races: 24, sprints: 6, winners: 4, margin: 2 });
    expect(p.keys.teamWins).toMatchObject({ team: { id: "mclaren" }, wins: 14 });
    expect(p.champion?.id).toBe("norris");
    expect(p.cup).toMatchObject({ team: { id: "mclaren" }, decided: true });
  });

  it("графік: Норріс 423, Ферстаппен 421, Піастрі 410, Расселл 319; смуга лідерів 24 етапи", async () => {
    const { chart } = await page(2025);
    expect(chart.lines.map((l) => [l.driver.id, l.final])).toEqual([
      ["norris", 423],
      ["max_verstappen", 421],
      ["piastri", 410],
      ["russell", 319],
    ]);
    expect(chart.rounds).toHaveLength(24);
    expect(chart.leaders).toEqual([...Array(4).fill(0), ...Array(15).fill(2), ...Array(5).fill(0)]);
    expect(chart.rounds[0]).toEqual({ round: 1, place: "Мельбурн" });
  });

  it("претенденти: очки, відставання, перемоги, поули, подіуми (макет)", async () => {
    const c = (await page(2025)).contenders.map((x) => [x.driver.id, x.points, x.gap, x.wins, x.poles, x.podiums]);
    expect(c).toEqual([
      ["norris", 423, 0, 7, 7, 18],
      ["max_verstappen", 421, 2, 8, 8, 15],
      ["piastri", 410, 13, 7, 6, 16],
    ]);
  });

  it("календар: Лас-Вегас — обидва McLaren дискваліфіковано; вирішальна гонка — Абу-Дабі (24-й етап)", async () => {
    const { calendar, facts } = await page(2025);
    const lv = calendar.find((c) => c.place === "Лас-Вегас")!;
    expect(lv.disqualified.map((d) => d.id).sort()).toEqual(["norris", "piastri"]);
    expect(lv.winners.map((w) => w.id)).toEqual(["max_verstappen"]);
    expect(calendar.filter((c) => c.decider).map((c) => c.round)).toEqual([24]);
    expect(facts.decider).toMatchObject({ round: 24, place: "Абу-Дабі", last: true });
    expect(calendar.filter((c) => c.sprint)).toHaveLength(6);
  });

  it("факти: відрив 2, лідери 1–4 / 5–19 / 20–24, Ферстаппен −104 після Зандворта, потім 6 перемог з 9", async () => {
    const { facts } = await page(2025);
    expect(facts.margin).toMatchObject({ first: { id: "norris" }, second: { id: "max_verstappen" }, points: 2 });
    expect(facts.spells.map((s) => [s.driver.id, s.from, s.to])).toEqual([
      ["norris", 1, 4],
      ["piastri", 5, 19],
      ["norris", 20, 24],
    ]);
    expect(facts.deficit).toMatchObject({ driver: { id: "max_verstappen" }, round: 15, place: "Зандворт", points: 104, winsAfter: 6, racesAfter: 9, champion: false });
    expect(facts.disqualified.map((d) => [d.place, d.winner?.id])).toEqual([["Лас-Вегас", "max_verstappen"]]);
    expect(facts.dropped).toBeNull();
  });

  it("сусіди 2024 і 2026; таблиця пілотів — від першого місця, конструктори — з McLaren", async () => {
    const p = await page(2025);
    expect([p.prev?.year, p.next?.year]).toEqual([2024, 2026]);
    expect(p.drivers[0]).toMatchObject({ position: 1, driver: { id: "norris" }, points: 423 });
    expect(p.teams?.[0]).toMatchObject({ position: 1, team: { id: "mclaren" } });
  });
});

describe("getSeasonPage — межові сезони", () => {
  it("1988: зараховано 11 кращих — Прост набрав більше загалом (105 проти 94); вирішено в Сузуці (15-й етап)", async () => {
    const { facts } = await page(1988);
    expect(facts.dropped).toMatchObject({ champion: { id: "senna" }, championCounted: 90, rival: { id: "prost" }, rivalTotal: 105, rivalCounted: 87 });
    expect(facts.decider).toMatchObject({ round: 15, place: "Судзука", last: false });
  });

  it("1997: Шумахер виключений — у таблиці наприкінці з позначкою, на графіку (очолював залік)", async () => {
    const p = await page(1997);
    const ms = p.drivers.find((d) => d.driver.id === "michael_schumacher")!;
    expect(ms).toMatchObject({ position: null, excluded: true });
    expect(p.drivers.at(-1)!.driver.id).toBe("michael_schumacher");
    expect(p.chart.lines.map((l) => l.driver.id)).toContain("michael_schumacher");
    expect(p.contenders.map((c) => c.driver.id)).toEqual(["villeneuve", "frentzen", "coulthard"]);
  });

  it("1950: Кубка ще немає; Indy 500 — у календарі; без спринтів", async () => {
    const p = await page(1950);
    expect(p.teams).toBeNull();
    expect(p.cup).toBeNull();
    expect(p.calendar.some((c) => c.place === "Індіанаполіс")).toBe(true);
    expect(p.keys.sprints).toBe(0);
  });

  it("1955 і 1956: правило заліку не відтворюється — вирішальної гонки не показуємо", async () => {
    expect((await page(1955)).facts.decider).toBeNull();
    expect((await page(1956)).facts.decider).toBeNull();
  });

  it("поточний сезон: триває, майбутні етапи без переможця, скасований етап — з позначкою; вирішальна — лише якщо титул вирішено", async () => {
    const cur = seasonIndex.find((s) => s.in_progress)!;
    const p = await page(cur.year);
    expect(p.inProgress).toBe(true);
    expect(p.calendar.filter((c) => !c.done && !c.cancelled).length).toBe(cur.rounds - cur.races);
    expect(p.calendar.some((c) => c.cancelled)).toBe(seasonRounds.some((r) => r.year === cur.year && r.cancelled));
    // Титул вирішено — вирішальний етап є і він уже відбувся; не вирішено — висновку немає.
    if (cur.driver_decided) {
      expect(p.facts.decider).not.toBeNull();
      expect(p.facts.decider!.round).toBeLessThanOrEqual(cur.races);
    } else expect(p.facts.decider).toBeNull();
    // Календар — за датою; скасований етап без номера — на своєму місці, а не в кінці.
    const dates = p.calendar.map((c) => c.date ?? "9999");
    expect(dates).toEqual([...dates].sort());
    expect(p.calendar.at(-1)!.cancelled).toBe(false);
  });

  it("невідомий рік — null; років сторінок стільки ж, скільки сезонів", async () => {
    expect(await getSeasonPage(1949, "uk")).toBeNull();
    expect(await getSeasonYears()).toEqual(seasonIndex.map((s) => s.year));
  });

  it("англійською: місця й назви Гран-прі — англійською", async () => {
    const r = (await page(2025, "en")).calendar[0]!;
    expect([r.place, r.gp]).toEqual(["Melbourne", "Australian Grand Prix"]);
  });
});

describe("кураторські місця етапів", () => {
  it("кожна траса з календарів 1950–2026 має місце українською й англійською (нова траса — тест падає)", () => {
    const places = (circuitsJson as unknown as { places: Record<string, { uk: string; en: string }> }).places;
    const missing = [...new Set(seasonRounds.map((r) => r.circuit).filter((c): c is string => !!c))].filter((c) => !places[c]?.uk || !places[c]?.en);
    expect(missing).toEqual([]);
  });
});

describe("поул по машинах (1950-ті: машину ділили кілька пілотів)", () => {
  const w = (driver: string, car: number | null) => ({ driver, team: "x", car });
  it("екіпаж однієї машини — одна група (1955 Аргентина, №12)", () => {
    expect(poleCars([w("farina", 12), w("gonzalez", 12), w("trintignant", 12)])).toEqual([["farina", "gonzalez", "trintignant"]]);
  });
  it("пілот у двох машинах — машину, де він уже є, відкидаємо (1964 Італія: Кларк №1 і №2 зі Спенсом)", () => {
    expect(poleCars([w("clark", 1), w("clark", 2), w("spence", 2)])).toEqual([["clark"]]);
  });
  it("на фікстурі бази: 1955 етап 1 — екіпаж №12; 1964 етап 9 — лише Кларк", async () => {
    const ids = (y: number, r: number) => async () => (await page(y)).calendar.find((c) => c.round === r)!.poles.map((car) => car.map((d) => d.id));
    expect(await (await ids(1955, 1))()).toEqual([["farina", "gonzalez", "trintignant"]]);
    expect(await (await ids(1964, 9))()).toEqual([["clark"]]);
  });
  it("різні машини з grid = 1 — обидві (помилка даних 1952, показуємо як є); звичайний етап — один пілот", () => {
    expect(poleCars([w("ascari", 12), w("moss", 32)])).toEqual([["ascari"], ["moss"]]);
    expect(poleCars([w("norris", 4)])).toEqual([["norris"]]);
  });
});

describe("тексти: правки рев'ю 13.11", () => {
  it("сусідній сезон, що триває, але з вирішеним титулом — не «лідер»", async () => {
    const cur = seasonIndex.find((s) => s.in_progress)!;
    const prev = await page(cur.year - 1);
    expect(prev.next?.inProgress).toBe(!cur.driver_decided);
  });
  it("відставання на останньому етапі (= підсумковий відрив) окремим фактом не показуємо", async () => {
    for (const y of [2013, 2014, 2019, 2023]) {
      const p = await page(y);
      if (p.facts.deficit) expect(p.facts.deficit.round).not.toBe(p.chart.rounds.at(-1)!.round);
    }
  });
});
