import { describe, expect, it, vi } from "vitest";
import driverIndex from "../../../../e2e/fixtures/db/driver_index.json";
import { countryName } from "@/lib/countries";
import { driverSlug } from "@/lib/driver-slug";
import { ageAt, getDriverPage, getDriverSlugs, numberPeriods, splitName, teamStints, yearRanges } from "../driver-page";

vi.mock("@/lib/data/db", () => import("@/lib/data/__tests__/db-fixture"));

const TODAY = "2026-11-12";

describe("адреси сторінок пілотів", () => {
  it("slug: нижній регістр і дефіси; унікальний для кожного з пілотів фікстури; не збігається з /drivers/all і /drivers/credits", async () => {
    expect(driverSlug("max_verstappen")).toBe("max-verstappen");
    expect(driverSlug("Cannoc")).toBe("cannoc");
    expect(driverSlug("scott_Brown")).toBe("scott-brown");
    const slugs = await getDriverSlugs();
    expect(slugs).toHaveLength(driverIndex.length);
    expect(new Set(slugs).size).toBe(driverIndex.length);
    expect(slugs.filter((s) => s === "all" || s === "credits" || !/^[a-z0-9-]+$/.test(s))).toEqual([]);
  });

  it("невідомий slug — null; id з підкресленням — не адреса", async () => {
    expect(await getDriverPage("nope", "en", TODAY)).toBeNull();
    expect(await getDriverPage("max_verstappen", "en", TODAY)).toBeNull();
  });

  it("назва країни є для кожного коду країни з бази (новий код має потрапити в таблицю)", () => {
    const codes = [...new Set(driverIndex.map((r) => r.country_code).filter(Boolean))] as string[];
    expect(codes.filter((c) => !countryName(c, "uk") || !countryName(c, "en"))).toEqual([]);
    expect(countryName("GBR", "uk")).toBe("Велика Британія");
    expect(countryName(null, "en")).toBeNull();
  });
});

describe("чисті функції", () => {
  it("yearRanges: сусідні роки — діапазон", () => {
    expect(yearRanges([2015, 2007, 2016])).toBe("2007, 2015–2016");
    expect(yearRanges([2019, 2020])).toBe("2019–2020");
  });

  it("teamStints: команда в сусідніх сезонах — один період; дві команди в сезоні — обидві", () => {
    const t = (id: string) => ({ id, races: 1 });
    expect(
      teamStints([
        { year: 2007, teams: [t("a")] },
        { year: 2008, teams: [t("a")] },
        { year: 2009, teams: [t("a"), t("b")] },
        { year: 2010, teams: [t("b")] },
        { year: 2012, teams: [t("a")] },
      ]),
    ).toEqual([
      { team: "a", from: 2007, to: 2009 },
      { team: "b", from: 2009, to: 2010 },
      { team: "a", from: 2012, to: 2012 },
    ]);
  });

  it("teamStints: та сама команда після перерви — новий період (Брандл: Brabham 1989 і 1991)", async () => {
    expect(teamStints([{ year: 1989, teams: [{ id: "a", races: 1 }] }, { year: 1991, teams: [{ id: "a", races: 1 }] }])).toEqual([
      { team: "a", from: 1989, to: 1989 },
      { team: "a", from: 1991, to: 1991 },
    ]);
    const p = (await getDriverPage("brundle", "en", TODAY))!;
    const brabham = p.stints.filter((s) => s.name === "Brabham").map((s) => [s.from, s.to]);
    expect(brabham).toEqual([
      [1989, 1989],
      [1991, 1991],
    ]);
  });

  it("numberPeriods: від останнього сезону назад, не більше двох періодів; сезон з кількома номерами обриває", () => {
    const s = (year: number, ...numbers: number[]) => ({ year, numbers });
    expect(numberPeriods([s(2019, 4), s(2020, 4), s(2025, 4), s(2026, 1)])).toEqual([
      { n: 1, from: 2026, to: 2026 },
      { n: 4, from: 2025, to: 2025 },
    ]);
    // Перерва в кар'єрі рве період: Алонсо не виступав у 2019–2020.
    expect(numberPeriods([s(2017, 14), s(2018, 14), s(2021, 14), s(2022, 14)], 1)).toEqual([{ n: 14, from: 2021, to: 2022 }]);
    expect(numberPeriods([s(2012, 4), s(2013, 10), s(2014, 44), s(2015, 44)])).toEqual([
      { n: 44, from: 2014, to: 2015 },
      { n: 10, from: 2013, to: 2013 },
    ]);
    expect(numberPeriods([s(1955, 2, 8, 10), s(1956, 1, 30)])).toEqual([]);
    expect(numberPeriods([s(1970, 5, 6), s(1975, 12)])).toEqual([{ n: 12, from: 1975, to: 1975 }]);
  });

  it("ageAt: день народження ще не настав — на рік менше", () => {
    expect(ageAt("1999-11-13", "2026-11-12")).toBe(26);
    expect(ageAt("1999-11-13", "2026-11-13")).toBe(27);
    expect(ageAt("1985-01-07", "2026-11-12")).toBe(41);
  });

  it("splitName: прізвище — стільки останніх слів, скільки в прізвищі з бази", () => {
    expect(splitName("Льюїс Гамілтон", "Hamilton")).toEqual(["Льюїс", "Гамілтон"]);
    expect(splitName("Педро де ла Роса", "de la Rosa")).toEqual(["Педро", "де ла Роса"]);
    expect(splitName("Біра", "Bira")).toEqual(["", "Біра"]);
  });
});

describe("getDriverPage — Гамілтон (еталони: Вікіпедія, макет 10.11)", () => {
  it("підсумки збігаються з рядком списку; найшвидші кола відомі (кар'єра з 2007)", async () => {
    const p = (await getDriverPage("hamilton", "uk", TODAY))!;
    const row = driverIndex.find((r) => r.id === "hamilton")!;
    expect([p.totals.starts, p.totals.wins, p.totals.podiums, p.totals.poles, p.totals.titles]).toEqual([
      row.starts, row.wins, row.podiums, row.poles, row.titles,
    ]);
    expect(p.totals.titleYears).toEqual([2008, 2014, 2015, 2017, 2018, 2019, 2020]);
    expect(p.totals.fastestLaps).toBeGreaterThan(60);
    expect(p.name).toBe("Льюїс Гамілтон");
    expect(p.nameParts).toEqual(["Льюїс", "Гамілтон"]);
    expect(p.country).toBe("Велика Британія");
    expect([p.born, p.died, p.age]).toEqual(["1985-01-07", null, 41]);
  });

  it("сезони від старих до нових: 2007 P2 109, 2008 чемпіон, 2021 — 387,5 очка", async () => {
    const p = (await getDriverPage("hamilton", "en", TODAY))!;
    expect(p.seasons[0]!.year).toBe(2007);
    const s = (y: number) => p.seasons.find((x) => x.year === y)!;
    expect([s(2007).position, s(2007).points, s(2007).teams[0]!.name]).toEqual([2, 109, "McLaren"]);
    expect([s(2008).champion, s(2008).position]).toEqual([true, 1]);
    expect(s(2021).points).toBe(387.5);
    expect(p.seasons.reduce((n, x) => n + x.races, 0)).toBe(p.totals.starts);
  });

  it("команди: McLaren 2007–2012, Mercedes 2013–2024, Ferrari з 2025; номер 44 з 2014", async () => {
    const p = (await getDriverPage("hamilton", "en", TODAY))!;
    expect(p.stints.map((s) => [s.name, s.from, s.to]).slice(0, 2)).toEqual([
      ["McLaren", 2007, 2012],
      ["Mercedes", 2013, 2024],
    ]);
    expect(p.stints[2]).toMatchObject({ name: "Ferrari", from: 2025 });
    expect(p.numbers[0]).toMatchObject({ n: 44, from: 2014 });
  });

  it("напарники в порядку років; Алонсо 2007 — 7:10 у гонках і 9:8 у кваліфікаціях; Баттон 32:26 і 44:14", async () => {
    const p = (await getDriverPage("hamilton", "en", TODAY))!;
    expect(p.teammates.slice(0, 5).map((m) => m.mate.id)).toEqual(["alonso", "kovalainen", "button", "rosberg", "bottas"]);
    const alonso = p.teammates[0]!;
    expect([alonso.years, alonso.ahead, alonso.behind, alonso.quali]).toEqual(["2007", 7, 10, { ahead: 9, behind: 8 }]);
    const button = p.teammates.find((m) => m.mate.id === "button")!;
    expect([button.years, button.ahead, button.behind, button.quali]).toEqual(["2010–2012", 32, 26, { ahead: 44, behind: 14 }]);
    expect(button.mate.slug).toBe("button");
  });

  it("перемоги: перша — Канада 2007 з поулу; «з далекого старту» — Німеччина 2018 з P14; за командами в сумі всі", async () => {
    const p = (await getDriverPage("hamilton", "uk", TODAY))!;
    expect(p.wins.list).toHaveLength(p.totals.wins);
    expect(p.wins.featured[0]).toMatchObject({ kind: "first", win: { year: 2007, name: "Гран-прі Канади", grid: 1 } });
    expect(p.wins.featured.find((f) => f.kind === "fromGrid")).toMatchObject({ win: { year: 2018, name: "Гран-прі Німеччини", grid: 14 } });
    expect(p.wins.featured.at(-1)!.kind).toBe("latest");
    expect(p.wins.byTeam.reduce((n, t) => n + t.count, 0)).toBe(p.totals.wins);
    expect(p.wins.byTeam.slice(0, 2).map((t) => [t.name, t.count])).toEqual([
      ["McLaren", 21],
      ["Mercedes", 84],
    ]);
    expect(p.wins.byGrandPrix[0]).toEqual({ name: "Гран-прі Великої Британії", count: 9 });
  });

  it("віхи: дебют, подіум (Австралія 2007, P3), поул і перемога (Канада 2007), 7 титулів", async () => {
    const p = (await getDriverPage("hamilton", "en", TODAY))!;
    expect(p.milestones.map((m) => m.kind)).toEqual(["debut", "firstPodium", "firstPole", "firstWin", "titles"]);
    expect(p.milestones[1]).toEqual({ kind: "firstPodium", year: 2007, round: 1, gp: "Australian Grand Prix", position: 3 });
    expect(p.milestones[4]).toMatchObject({ year: 2008, years: [2008, 2014, 2015, 2017, 2018, 2019, 2020] });
  });
});

describe("getDriverPage — межові пілоти", () => {
  it("кар'єра до 2004: найшвидші кола не показуємо (дані неповні) — Шумахер, Сенна, Фанхіо", async () => {
    for (const slug of ["michael-schumacher", "senna", "fangio"]) {
      expect((await getDriverPage(slug, "en", TODAY))!.totals.fastestLaps).toBeNull();
    }
  });

  it("Сенна: роки життя, вік не показуємо; з Простом — лише гонки (кваліфікацій до 1994 немає в даних)", async () => {
    const p = (await getDriverPage("senna", "uk", TODAY))!;
    expect([p.born, p.died, p.age]).toEqual(["1960-03-21", "1994-05-01", null]);
    expect(p.totals.points).toBe(610);
    const prost = p.teammates.find((m) => m.mate.id === "prost")!;
    expect([prost.years, prost.team.name, prost.quali]).toEqual(["1988–1989", "McLaren", null]);
    expect(p.current).toBeNull();
    expect(p.color).toBeNull();
  });

  it("Шумахер 1997 — виключений з заліку: без місця, очки збережено", async () => {
    const p = (await getDriverPage("michael-schumacher", "en", TODAY))!;
    const s = p.seasons.find((x) => x.year === 1997)!;
    expect([s.position, s.points, s.excluded]).toEqual([null, 78, true]);
  });

  it("Норріс — учасник сезону: колір команди, поточний сезон, одна команда, номери 1 і 4", async () => {
    const p = (await getDriverPage("norris", "uk", TODAY))!;
    expect(p.color?.toLowerCase()).toBe("#ff8000");
    expect(p.current).toMatchObject({ year: p.currentSeason });
    expect(p.stints).toHaveLength(1);
    expect(p.numbers).toEqual([
      { n: 1, from: 2026, to: 2026 },
      { n: 4, from: 2019, to: 2025 },
    ]);
    expect(p.totals.fastestLaps).not.toBeNull();
    expect(p.portrait).not.toBeNull();
  });

  it("три перемоги: виділених дві (перша й остання), тож повний перелік показує всі три — Фізікелла", async () => {
    const p = (await getDriverPage("fisichella", "en", TODAY))!;
    expect(p.wins.list).toHaveLength(3);
    // Сторінка показує повний перелік, коли перемог більше, ніж виділених.
    expect(p.wins.list.length).toBeGreaterThan(p.wins.featured.length);
  });

  it("віхи — за часом; перший подіум, що був перемогою, окремо не показуємо (Ферстаппен: Іспанія 2016)", async () => {
    const p = (await getDriverPage("max-verstappen", "en", TODAY))!;
    expect(p.milestones.map((m) => [m.kind, m.year])).toEqual([
      ["debut", 2015],
      ["firstWin", 2016],
      ["firstPole", 2019],
      ["titles", 2021],
    ]);
    for (const slug of await getDriverSlugs()) {
      const ms = (await getDriverPage(slug, "en", TODAY))!.milestones;
      expect(ms[0]!.kind, slug).toBe("debut");
      expect(ms.map((m) => m.year * 1000 + m.round), slug).toEqual([...ms.map((m) => m.year * 1000 + m.round)].sort((a, b) => a - b));
    }
  });

  it("кваліфікації пари — лише коли дані є для ≥ 90 % спільних гонок: Шумахер — Баррікелло (60 зі 104) без рядка", async () => {
    const p = (await getDriverPage("michael-schumacher", "en", TODAY))!;
    expect(p.teammates.find((m) => m.mate.id === "barrichello")!.quali).toBeNull();
    expect(p.teammates.find((m) => m.mate.id === "rosberg")!.quali).not.toBeNull();
  });

  it("пілот з одним стартом: без перемог, напарників і графіка; сторінка збирається", async () => {
    const one = driverIndex.find((r) => r.starts === 1 && r.wins === 0)!;
    const p = (await getDriverPage(driverSlug(one.id), "uk", TODAY))!;
    expect(p.seasons).toHaveLength(1);
    expect(p.wins.list).toEqual([]);
    expect(p.wins.featured).toEqual([]);
    expect(p.teammates).toEqual([]);
    expect(p.milestones.map((m) => m.kind)).toEqual(["debut"]);
  });

  it("усі пілоти фікстури збираються обома мовами; сума сезонів = старти; вік — лише в живих і не понад 100", async () => {
    for (const slug of await getDriverSlugs()) {
      for (const lang of ["uk", "en"] as const) {
        const p = (await getDriverPage(slug, lang, TODAY))!;
        expect(p.seasons.reduce((n, s) => n + s.races, 0), slug).toBe(p.totals.starts);
        expect(p.wins.list.length, slug).toBe(p.totals.wins);
        if (p.age !== null) {
          expect(p.died, slug).toBeNull();
          expect(p.age, slug).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});
