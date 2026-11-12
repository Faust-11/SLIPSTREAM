import { describe, expect, it, vi } from "vitest";
import seasonsJson from "@/data/curated/seasons.json";
import seasonIndex from "../../../../e2e/fixtures/db/season_index.json";
import { getSeasonsIndex, mainTeams } from "../seasons";

vi.mock("@/lib/data/db", () => import("@/lib/data/__tests__/db-fixture"));

describe("getSeasonsIndex", () => {
  it("вступні числа: сезонів — як у базі; 7 титулів — Шумахер і Гамілтон; чемпіонів — різних пілотів з вирішеним титулом", async () => {
    const { facts } = await getSeasonsIndex("uk");
    expect(facts.seasons).toBe(seasonIndex.length);
    expect(facts.maxTitles).toBe(7);
    expect([...facts.maxTitleHolders].sort()).toEqual(["Гамілтон", "Шумахер"]);
    expect(facts.champions).toBe(new Set(seasonIndex.filter((r) => r.driver_decided).map((r) => r.driver)).size);
  });

  it("десятиліття від нових до старих; картки всередині — теж; разом — усі сезони", async () => {
    const { decades } = await getSeasonsIndex("en");
    expect(decades.map((d) => d.decade)).toEqual([2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950]);
    const years = decades.flatMap((d) => d.cards.map((c) => c.year));
    expect(years).toEqual([...years].sort((a, b) => b - a));
    expect(years).toHaveLength(seasonIndex.length);
    expect(years.at(-1)).toBe(1950);
  });

  it("2010-ті: 10 сезонів, 3 чемпіони — Гамілтон, Росберг, Феттель (від нових, без повторів)", async () => {
    const d = (await getSeasonsIndex("uk")).decades.find((x) => x.decade === 2010)!;
    expect([d.seasons, d.champions, d.running]).toEqual([10, 3, null]);
    expect(d.names).toEqual(["Гамілтон", "Росберг", "Феттель"]);
  });

  it("картки: 2023 — Ферстаппен, Red Bull, 19 перемог з 22, Кубок Red Bull; 1950 — Фаріна, Кубка ще не було", async () => {
    const cards = (await getSeasonsIndex("uk")).decades.flatMap((d) => d.cards);
    const c = (y: number) => cards.find((x) => x.year === y)!;
    expect(c(2023)).toMatchObject({
      driver: { id: "max_verstappen", slug: "max-verstappen", name: "Макс Ферстаппен" },
      teams: [{ id: "red-bull", name: "Red Bull" }],
      wins: 19,
      races: 22,
      inProgress: false,
      decided: true,
      cup: { team: { id: "red-bull" }, decided: true },
    });
    expect(c(1950).driver!.id).toBe("farina");
    expect(c(1950).cup).toBeNull();
    expect(c(1958).cup!.team.id).toBe("vanwall");
    // 1997: Шумахера виключено з заліку — чемпіон Вільньов; 1970: Ріндт.
    expect([c(1997).driver!.id, c(1970).driver!.id]).toEqual(["villeneuve", "rindt"]);
  });

  it("поточний сезон — перша картка: триває, гонок менше, ніж етапів", async () => {
    const first = (await getSeasonsIndex("en")).decades[0]!.cards[0]!;
    const row = seasonIndex.at(-1)!;
    expect(first.year).toBe(row.year);
    expect(first.inProgress).toBe(row.in_progress);
    expect(first.races).toBeLessThanOrEqual(first.rounds);
  });

  it("фото: кураторське — лише якщо на ньому чемпіон сезону; колір — з того самого запису; автор кожного фото — у переліку", async () => {
    const data = await getSeasonsIndex("en");
    const cards = data.decades.flatMap((d) => d.cards);
    const curated = (seasonsJson as unknown as { seasons: Record<string, { driver: string; color: string }> }).seasons;
    for (const c of cards.filter((x) => !x.inProgress)) {
      const cur = curated[String(c.year)]!;
      expect(cur.driver.toLowerCase().endsWith(seasonIndex.find((r) => r.year === c.year)!.surname!.toLowerCase()), String(c.year)).toBe(true);
      expect(c.photo?.src, String(c.year)).toBe(`/img/seasons/${c.year}-560.webp`);
      expect(c.color, String(c.year)).toBe(cur.color);
    }
    expect(data.credits).toHaveLength(cards.filter((c) => c.photo).length);
  });
});

describe("mainTeams", () => {
  it("одна команда; друга — лише від третини гонок пілота", () => {
    expect(mainTeams([{ id: "a", races: 16 }])).toEqual(["a"]);
    expect(mainTeams([{ id: "mercedes", races: 6 }, { id: "maserati", races: 2 }])).toEqual(["mercedes"]);
    expect(mainTeams([{ id: "a", races: 5 }, { id: "b", races: 4 }])).toEqual(["a", "b"]);
    expect(mainTeams([])).toEqual([]);
  });
});
