import { describe, expect, it } from "vitest";
import { getTeamsCredits, getTeamsIndex, getTeamsSeason, TEAMS_PAGE_SIZE } from "../teams";

describe("getTeamsIndex", () => {
  it("українською: країна, alt фото, прізвища пілотів", async () => {
    const cards = await getTeamsIndex("uk");
    const mclaren = cards.find((c) => c.id === "mclaren")!;
    expect(mclaren.name).toBe("McLaren");
    expect(mclaren.country).toBe("Велика Британія");
    expect(mclaren.photo?.alt).toBe("Болід McLaren");
    expect(mclaren.current?.drivers.map((d) => d.name).sort()).toEqual(["Норріс", "Піастрі"]);
  });

  it("англійською: ті самі картки тим самим порядком", async () => {
    const [uk, en] = await Promise.all([getTeamsIndex("uk"), getTeamsIndex("en")]);
    expect(en.map((c) => c.id)).toEqual(uk.map((c) => c.id));
    const mclaren = en.find((c) => c.id === "mclaren")!;
    expect(mclaren.country).toBe("United Kingdom");
    expect(mclaren.photo?.alt).toBe("McLaren car");
    expect(mclaren.current?.drivers.map((d) => d.name).sort()).toEqual(["Norris", "Piastri"]);
  });

  it("поле пошуку: назва, країна обома мовами, нижній регістр", async () => {
    const ferrari = (await getTeamsIndex("en")).find((c) => c.id === "ferrari")!;
    for (const part of ["ferrari", "italy", "італія"]) expect(ferrari.search).toContain(part);
    expect(ferrari.search).toBe(ferrari.search.toLowerCase());
  });

  it("порядок за замовчуванням — як у макеті: перемоги ↓, потім Гран-прі ↓", async () => {
    const cards = await getTeamsIndex("en");
    for (let i = 1; i < cards.length; i++) {
      const [a, b] = [cards[i - 1]!, cards[i]!];
      expect(a.wins > b.wins || (a.wins === b.wins && a.grandsPrix >= b.grandsPrix), `${a.id} → ${b.id}`).toBe(true);
    }
  });

  it("поточний сезон — рік дати знімка (а не число в коді)", () => {
    expect(getTeamsSeason()).toBe(2026);
  });

  it("розмір сторінки — 24", () => {
    expect(TEAMS_PAGE_SIZE).toBe(24);
  });
});

describe("getTeamsCredits", () => {
  it("фото болідів і портрети — лише показані, з автором і ліцензією, за алфавітом", async () => {
    const credits = getTeamsCredits();
    expect(credits.cars).toHaveLength(131);
    expect(credits.avatars).toHaveLength(22);
    const names = credits.cars.map((c) => c.team);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
    expect(credits.cars.find((c) => c.team === "Ferrari")?.license).toBeTruthy();
    expect(credits.avatars.find((c) => c.driver === "Lewis Hamilton")?.license).toBe("OGL 3");
  });
});
