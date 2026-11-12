import { describe, expect, it } from "vitest";
import type { DriverRow } from "@/lib/data/drivers";
import {
  DEFAULT_DRIVERS_QUERY,
  driversQueryString,
  firstLetter,
  paginate,
  parseDriversQuery,
  selectDrivers,
} from "@/lib/drivers-list";

const row = (id: string, p: Partial<DriverRow>): DriverRow => ({
  id, name: id, latin: id, surname: id, initials: "XX", avatar: null, countryCode: "GBR", team: "McLaren",
  starts: 10, wins: 0, podiums: 0, poles: 0, titles: 0, years: [2000, 2005], current: null, search: id.toLowerCase(), ...p,
});
const rows = [
  row("senna", { surname: "Senna", starts: 161, wins: 41, titles: 3, years: [1984, 1994], search: "сенна senna bra mclaren" }),
  row("prost", { surname: "Prost", starts: 199, wins: 51, titles: 4, years: [1980, 1993] }),
  row("norris", { surname: "Norris", starts: 150, wins: 12, years: [2019, 2026], current: { position: 6, points: 246, team: "McLaren", color: "#FF8000", number: 1 } }),
  row("ahrens", { surname: "Ahrens", starts: 4, years: [1956, 1960] }),
  row("ostrich", { surname: "Österreich", starts: 4, years: [1956, 1956] }),
];

describe("parseDriversQuery — сміття в адресі → типові значення", () => {
  it("коректні значення", () => {
    expect(parseDriversQuery(new URLSearchParams("q=senna&f=ch&d=1980&l=s&sort=st&dir=asc&p=2"))).toEqual({
      q: "senna", f: "ch", d: 1980, l: "S", sort: "st", dir: 1, p: 2,
    });
  });
  it("сміття", () => {
    expect(parseDriversQuery(new URLSearchParams("f=evil&d=1985&l=<s>&sort=x&dir=up&p=-3"))).toEqual(DEFAULT_DRIVERS_QUERY);
  });
  it("рядок адреси — лише відмінне від типового, і назад той самий стан", () => {
    const q = { ...DEFAULT_DRIVERS_QUERY, f: "win" as const, sort: "n" as const, dir: 1 as const };
    expect(driversQueryString(q)).toBe("?f=win&sort=n");
    expect(parseDriversQuery(new URLSearchParams(driversQueryString(q).slice(1)))).toEqual(q);
    expect(driversQueryString(DEFAULT_DRIVERS_QUERY)).toBe("");
  });
});

describe("selectDrivers", () => {
  it("за замовчуванням — перемоги ↓", () => {
    expect(selectDrivers(rows, DEFAULT_DRIVERS_QUERY, "uk").map((r) => r.id).slice(0, 3)).toEqual(["prost", "senna", "norris"]);
  });
  it("фільтри: чемпіони, сезон, переможці", () => {
    expect(selectDrivers(rows, { ...DEFAULT_DRIVERS_QUERY, f: "ch" }, "uk").map((r) => r.id)).toEqual(["prost", "senna"]);
    expect(selectDrivers(rows, { ...DEFAULT_DRIVERS_QUERY, f: "cur" }, "uk").map((r) => r.id)).toEqual(["norris"]);
    expect(selectDrivers(rows, { ...DEFAULT_DRIVERS_QUERY, f: "win" }, "uk")).toHaveLength(3);
  });
  it("десятиліття — хто виступав у ньому хоч рік", () => {
    expect(selectDrivers(rows, { ...DEFAULT_DRIVERS_QUERY, d: 1990 }, "uk").map((r) => r.id).sort()).toEqual(["prost", "senna"]);
  });
  it("пошук кирилицею; літера без діакритики (Ö → O)", () => {
    expect(selectDrivers(rows, { ...DEFAULT_DRIVERS_QUERY, q: "СЕННА" }, "uk").map((r) => r.id)).toEqual(["senna"]);
    expect(firstLetter("Österreich")).toBe("O");
    expect(selectDrivers(rows, { ...DEFAULT_DRIVERS_QUERY, l: "O" }, "uk").map((r) => r.id)).toEqual(["ostrich"]);
  });
  it("сортування за ім'ям ↑ і за стартами ↓", () => {
    expect(selectDrivers(rows, { ...DEFAULT_DRIVERS_QUERY, sort: "n", dir: 1 }, "en").map((r) => r.id)).toEqual(["ahrens", "norris", "ostrich", "prost", "senna"]);
    expect(selectDrivers(rows, { ...DEFAULT_DRIVERS_QUERY, sort: "st" }, "en")[0]!.id).toBe("prost");
  });
});

describe("paginate", () => {
  it("сторінки по 25; номер поза межами — найближча", () => {
    const items = Array.from({ length: 60 }, (_, i) => i);
    expect(paginate(items, 1)).toMatchObject({ page: 1, pages: 3 });
    expect(paginate(items, 3).items).toEqual(items.slice(50));
    expect(paginate(items, 9).page).toBe(3);
    expect(paginate([], 1)).toEqual({ items: [], page: 1, pages: 1 });
  });
});
