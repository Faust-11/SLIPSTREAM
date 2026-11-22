import { describe, expect, it } from "vitest";
import { buildRows, makeMatcher, nameCase, nameKey, parseGap, splitOpenName, type OpenDriver, type OpenResult } from "../prelim";

describe("parseGap", () => {
  it("секунди → мс, «+N LAP(S)» → кола, решта → нічого", () => {
    expect(parseGap(0.639)).toEqual({ gapMs: 639, lapsDown: null });
    expect(parseGap("+1 LAP")).toEqual({ gapMs: null, lapsDown: 1 });
    expect(parseGap("+2 LAPS")).toEqual({ gapMs: null, lapsDown: 2 });
    expect(parseGap(null)).toEqual({ gapMs: null, lapsDown: null });
    expect(parseGap([1, 2])).toEqual({ gapMs: null, lapsDown: null });
    expect(parseGap("DNF")).toEqual({ gapMs: null, lapsDown: null });
  });
});

describe("імена", () => {
  it("nameCase: великі літери → з великої, змішаний регістр лишається", () => {
    expect(nameCase("VERSTAPPEN")).toBe("Verstappen");
    expect(nameCase("DE VRIES")).toBe("De Vries");
    expect(nameCase("McLaren")).toBe("McLaren");
  });
  it("nameKey без діакритики й розділових знаків", () => {
    expect(nameKey("Pérez")).toBe("perez");
    expect(nameKey("Hülkenberg")).toBe("hulkenberg");
    expect(nameKey("De Vries")).toBe("devries");
  });
  it("splitOpenName: поля first/last або «Max VERSTAPPEN»", () => {
    expect(splitOpenName({ driver_number: 1, first_name: "Max", last_name: "Verstappen" })).toEqual({ first: "Max", last: "Verstappen" });
    expect(splitOpenName({ driver_number: 1, full_name: "Max VERSTAPPEN" })).toEqual({ first: "Max", last: "VERSTAPPEN" });
    expect(splitOpenName({ driver_number: 1, full_name: "Nyck DE VRIES" })).toEqual({ first: "Nyck", last: "DE VRIES" });
  });
});

const known = [
  { id: "max_verstappen", forename: "Max", surname: "Verstappen", code: "VER" },
  { id: "lando_norris", forename: "Lando", surname: "Norris", code: "NOR" },
  { id: "kimi_antonelli", forename: "Kimi", surname: "Antonelli", code: "ANT" },
  { id: "kevin_magnussen", forename: "Kevin", surname: "Magnussen", code: "MAG" },
  { id: "jan_magnussen", forename: "Jan", surname: "Magnussen", code: "MAG" },
];
const match = makeMatcher(known);

describe("makeMatcher", () => {
  it("прізвище + ім'я; перший токен імені («Andrea Kimi» → Kimi)", () => {
    expect(match({ driver_number: 1, first_name: "Max", last_name: "Verstappen" })?.id).toBe("max_verstappen");
    expect(match({ driver_number: 12, first_name: "Andrea Kimi", last_name: "Antonelli" })?.id).toBe("kimi_antonelli");
    expect(match({ driver_number: 20, full_name: "Kevin MAGNUSSEN" })?.id).toBe("kevin_magnussen");
  });
  it("невідомого пілота не вигадуємо", () => {
    expect(match({ driver_number: 99, first_name: "Новий", last_name: "Пілот" })).toBeNull();
    expect(match({ driver_number: 99, first_name: "Zed", last_name: "Nobody", name_acronym: "ZZZ" })).toBeNull();
  });
  it("двозначний код (два Магнуссени) за одним лише кодом не зіставляється", () => {
    expect(match({ driver_number: 20, name_acronym: "MAG", last_name: "Other" })).toBeNull();
  });
});

describe("buildRows", () => {
  const results: OpenResult[] = [
    { position: 2, driver_number: 1, number_of_laps: 50, points: 18, duration: 5260.263, gap_to_leader: 0.639 },
    { position: 1, driver_number: 3, number_of_laps: 50, points: 25, duration: 5259.624, gap_to_leader: 0 },
    { position: 3, driver_number: 81, number_of_laps: 49, points: 15, gap_to_leader: "+1 LAP" },
    { position: 4, driver_number: 55, number_of_laps: 10, points: 0, dnf: true },
    { position: null, driver_number: 7, dsq: true },
  ];
  const drivers: OpenDriver[] = [
    { driver_number: 3, full_name: "Max VERSTAPPEN", first_name: "Max", last_name: "Verstappen", team_name: "Red Bull Racing", team_colour: "3671C6" },
    { driver_number: 1, first_name: "Lando", last_name: "Norris", team_name: "McLaren", team_colour: "FF8000" },
    { driver_number: 81, first_name: "Oscar", last_name: "PIASTRI", team_name: "McLaren", team_colour: "zzz" },
    { driver_number: 55, first_name: "Carlos", last_name: "SAINZ", team_name: "Williams", team_colour: "64C4FF" },
  ];
  const rows = buildRows(results, drivers, match, (id) => ({ name: id === "max_verstappen" ? "Макс Ферстаппен" : id === "lando_norris" ? "Ландо Норріс" : id, slug: id.replace("_", "-") }));
  it("за позицією, без позиції — в кінець", () => {
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3, 4, null]);
  });
  it("переможець: повний час; другий: відрив; відстав на коло — без часу; зійшов — без часу", () => {
    expect(rows[0]).toMatchObject({ name: "Макс Ферстаппен", slug: "max-verstappen", timeMs: 5259624, gapMs: null, color: "#3671C6", status: "finished", points: 25 });
    expect(rows[1]).toMatchObject({ name: "Ландо Норріс", id: "lando_norris", gapMs: 639 });
    expect(rows[2]).toMatchObject({ name: "Oscar Piastri", id: null, lapsDown: 1, timeMs: null, gapMs: null, color: null });
    expect(rows[3]).toMatchObject({ status: "dnf", timeMs: null, gapMs: null });
    expect(rows[4]).toMatchObject({ status: "dsq", name: "#7", team: null });
  });
});
