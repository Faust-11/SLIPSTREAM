import { describe, expect, it, vi } from "vitest";
import { getTeamsIndex } from "@/lib/data/teams";
import {

  normalizeSearch,
  parseTeamsQuery,
  selectTeams,
  TEAMS_FILTERS,
  TEAMS_SORTS,
  teamsQueryString,
  type TeamsQuery,
} from "../teams-list";

// Дані — з фікстури бази (без живого Supabase).
vi.mock("@/lib/data/db", () => import("@/lib/data/__tests__/db-fixture"));

const DEFAULT: TeamsQuery = { q: "", f: "all", sort: "p" };
const params = (s: string) => new URLSearchParams(s);

describe("parseTeamsQuery / teamsQueryString", () => {
  it("значення й порядок фільтрів і сортувань — як у макеті", () => {
    expect(TEAMS_FILTERS).toEqual(["all", "cur", "ch", "win"]);
    expect(TEAMS_SORTS).toEqual(["p", "w", "gp", "t", "y1", "y0", "a"]);
  });

  it("порожній і сміттєвий query → стан за замовчуванням", () => {
    expect(parseTeamsQuery(params(""))).toEqual(DEFAULT);
    expect(parseTeamsQuery(params("f=evil&sort=%3Cscript%3E"))).toEqual(DEFAULT);
    expect(parseTeamsQuery(params("f=ALL&sort=P"))).toEqual(DEFAULT);
  });

  it("q довший за 100 символів обрізається", () => {
    expect(parseTeamsQuery(params(`q=${"a".repeat(300)}`)).q).toHaveLength(100);
  });

  it("значення за замовчуванням у рядок не пишуться", () => {
    expect(teamsQueryString(DEFAULT)).toBe("");
    expect(teamsQueryString({ q: "   ", f: "all", sort: "p" })).toBe("");
    expect(teamsQueryString({ q: "lotus", f: "win", sort: "a" })).toBe("?q=lotus&f=win&sort=a");
    expect(teamsQueryString({ q: "", f: "ch", sort: "p" })).toBe("?f=ch");
  });

  it("кирилиця й пробіли кодуються; parse∘string — тотожність", () => {
    expect(teamsQueryString({ q: "red bull", f: "all", sort: "p" })).toBe("?q=red+bull");
    for (const q of ["", "lotus", "італія", "a&b=c"])
      for (const f of TEAMS_FILTERS)
        for (const sort of ["p", "a", "y0"] as const) {
          const query: TeamsQuery = { q, f, sort };
          expect(parseTeamsQuery(params(teamsQueryString(query).slice(1)))).toEqual(query);
        }
  });
});

describe("normalizeSearch", () => {
  it("регістр, діакритика, апострофи, пробіли", () => {
    expect(normalizeSearch("Citroën’s")).toBe("citroens");
    expect(normalizeSearch("  Red   BULL ")).toBe("red bull");
    expect(normalizeSearch("ІТАЛІЯ")).toBe(normalizeSearch("італія"));
    expect(normalizeSearch("П'єр")).toBe(normalizeSearch("Пʼєр"));
  });
});

describe("selectTeams на знімку", async () => {
  const uk = await getTeamsIndex("uk");
  const en = await getTeamsIndex("en");
  const ids = (q: Partial<TeamsQuery>, cards = uk, locale: "uk" | "en" = "uk") =>
    selectTeams(cards, { ...DEFAULT, ...q }, locale).map((c) => c.id);

  it("за замовчуванням (sort=p): спершу 11 команд сезону 2026 за позицією, далі решта", () => {
    const res = selectTeams(uk, DEFAULT, "uk");
    expect(res).toHaveLength(165);
    expect(res.slice(0, 11).map((c) => c.current?.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(res[11]!.current).toBeNull();
  });

  it("фільтри: cur = 11, ch = 15, win = 38", () => {
    expect(ids({ f: "cur" })).toHaveLength(11);
    expect(ids({ f: "ch" })).toHaveLength(15);
    expect(ids({ f: "win" })).toHaveLength(38);
  });

  it("пошук: регістр і мова країни не мають значення", () => {
    const italy = ids({ q: "італія" });
    expect(italy.length).toBeGreaterThan(5);
    expect(ids({ q: "ІТАЛІЯ" })).toEqual(italy);
    expect(ids({ q: "italy" })).toEqual(italy);
    expect(ids({ q: "Italy" }, en, "en")).toEqual(italy);
    expect(ids({ q: "ferr" })).toContain("ferrari");
    expect(ids({ q: "lotus" })).toEqual(expect.arrayContaining(["lotus", "lotus-f1"]));
    expect(ids({ q: "zzz" })).toEqual([]);
    expect(ids({ q: "   " })).toHaveLength(165);
  });

  it("пошук кирилицею, за пілотом і з опечатками (дизайн-рев'ю 11.11)", () => {
    // Українські й російські назви, транслітерація запиту.
    expect(ids({ q: "мерседес" })).toContain("mercedes");
    expect(ids({ q: "Макларен" })).toContain("mclaren");
    expect(ids({ q: "ред булл" })).toContain("red-bull");
    expect(ids({ q: "редбул" })).toContain("red-bull");
    expect(ids({ q: "лотус" })).toEqual(expect.arrayContaining(["lotus", "lotus-f1"]));
    expect(ids({ q: "феррарі" })).toContain("ferrari");
    expect(ids({ q: "феррари" })).toContain("ferrari");
    expect(ids({ q: "уильямс" })).toContain("williams");
    // Пілоти поточного складу — обома мовами.
    expect(ids({ q: "гамілтон" })).toEqual(["ferrari"]);
    expect(ids({ q: "Hamilton" }, en, "en")).toEqual(["ferrari"]);
    expect(ids({ q: "норріс" })).toEqual(["mclaren"]);
    // Опечатки — лише коли точних збігів немає.
    expect(ids({ q: "ferari" })).toContain("ferrari");
    expect(ids({ q: "mclarn" })).toContain("mclaren");
    // Без хибних збігів.
    expect(ids({ q: "zzz" })).toEqual([]);
    expect(ids({ q: "qwerty" })).toEqual([]);
    expect(ids({ q: "italy" })).toHaveLength(ids({ q: "італія" }).length);
  });

  it("сортування не залежить від порядку на вході — вторинні ключі (рев'ю: знімок уже відсортований)", () => {
    // Детерміноване «перемішування»: розворот + чергування.
    const shuffled = [...uk].reverse().sort((a, b) => (a.id.length % 3) - (b.id.length % 3));
    for (const sort of TEAMS_SORTS) {
      if (sort === "a") continue;
      expect(selectTeams(shuffled, { ...DEFAULT, sort }, "uk").map((c) => c.id), sort).toEqual(ids({ sort }));
    }
    // Рівні Кубки (Mercedes 9, Williams 9) → за перемогами, незалежно від входу.
    const pair = uk.filter((c) => c.id === "williams" || c.id === "mercedes");
    expect(selectTeams([...pair].reverse(), { ...DEFAULT, sort: "t" }, "uk").map((c) => c.id)).toEqual(["mercedes", "williams"]);
    expect(selectTeams(pair, { ...DEFAULT, sort: "t" }, "uk").map((c) => c.id)).toEqual(["mercedes", "williams"]);
  });

  it("q обрізається за символами, а не UTF-16 (емодзі не розрізається)", () => {
    const q = parseTeamsQuery(new URLSearchParams(`q=${"a".repeat(99)}🏎️x`)).q;
    expect(Array.from(q)).toHaveLength(100);
    expect(q.endsWith("🏎")).toBe(true);
  });

  it("сортування: перемоги, Гран-прі, Кубки, роки, А–Я", () => {
    expect(ids({ sort: "w" })[0]).toBe("ferrari");
    expect(ids({ sort: "gp" })[0]).toBe("ferrari");
    // Кубки ↓, при рівності — перемоги ↓: Mercedes (9, 143) перед Williams (9, 114).
    expect(ids({ sort: "t" }).slice(0, 4)).toEqual(["ferrari", "mclaren", "mercedes", "williams"]);
    const byY0 = selectTeams(uk, { ...DEFAULT, sort: "y0" }, "uk");
    expect(byY0[0]!.seasons[0]![0]).toBe(1950);
    const byY1 = selectTeams(uk, { ...DEFAULT, sort: "y1" }, "uk");
    expect(byY1[0]!.seasons.at(-1)![1]).toBe(2026);
    const az = selectTeams(uk, { ...DEFAULT, sort: "a" }, "uk").map((c) => c.name);
    expect(az).toEqual([...az].sort((a, b) => a.localeCompare(b, "uk")));
  });

  it("фільтр + пошук + сортування разом, вхідний масив не змінюється", () => {
    const before = uk.map((c) => c.id);
    const res = selectTeams(uk, { q: "брит", f: "win", sort: "a" }, "uk");
    expect(res.every((c) => c.wins > 0 && c.country === "Велика Британія")).toBe(true);
    expect(res.map((c) => c.name)).toEqual(res.map((c) => c.name).sort((a, b) => a.localeCompare(b, "uk")));
    expect(uk.map((c) => c.id)).toEqual(before);
  });
});
