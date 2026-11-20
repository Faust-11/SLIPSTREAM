import { describe, expect, it } from "vitest";
import { ageAtDeath, allDayKeys, dayKey, dayKeyOfDate, neighbours, parseDayKey } from "../on-this-day";

describe("parseDayKey", () => {
  it("розбирає ММ-ДД", () => {
    expect(parseDayKey("09-22")).toEqual({ month: 9, day: 22 });
    expect(parseDayKey("02-29")).toEqual({ month: 2, day: 29 });
  });

  it("відкидає неіснуючі дні й хибний формат", () => {
    for (const bad of ["02-30", "04-31", "13-01", "00-10", "01-00", "9-2", "09-2", "2024-09-22", "", "ab-cd"]) {
      expect(parseDayKey(bad), bad).toBeNull();
    }
  });
});

describe("dayKeyOfDate", () => {
  it("ключ з дати бази, з часом чи без", () => {
    expect(dayKeyOfDate("1994-05-01")).toBe("05-01");
    expect(dayKeyOfDate("2025-10-19T19:00:00Z")).toBe("10-19");
  });

  it("порожнє й хибне — null; 29 лютого лишається", () => {
    expect(dayKeyOfDate(null)).toBeNull();
    expect(dayKeyOfDate(undefined)).toBeNull();
    expect(dayKeyOfDate("не дата")).toBeNull();
    expect(dayKeyOfDate("1952-02-30")).toBeNull();
    expect(dayKeyOfDate("1960-02-29")).toBe("02-29");
  });
});

describe("allDayKeys", () => {
  it("366 унікальних днів у календарному порядку, 29 лютого — є", () => {
    const keys = allDayKeys();
    expect(keys).toHaveLength(366);
    expect(new Set(keys).size).toBe(366);
    expect(keys[0]).toBe("01-01");
    expect(keys.at(-1)).toBe("12-31");
    expect(keys).toContain("02-29");
    expect([...keys].sort()).toEqual(keys);
    for (const k of keys) expect(parseDayKey(k), k).not.toBeNull();
  });

  it("dayKey доповнює нулями", () => {
    expect(dayKey(3, 7)).toBe("03-07");
  });
});

describe("neighbours", () => {
  const keys = ["01-05", "03-10", "12-31"];

  it("попередній і наступний серед наявних днів, по колу року", () => {
    expect(neighbours(keys, "03-10")).toEqual({ prev: "01-05", next: "12-31" });
    expect(neighbours(keys, "12-31")).toEqual({ prev: "03-10", next: "01-05" });
    expect(neighbours(keys, "01-05")).toEqual({ prev: "12-31", next: "03-10" });
  });

  it("невідомий день або порожній перелік — null", () => {
    expect(neighbours(keys, "02-02")).toBeNull();
    expect(neighbours([], "01-01")).toBeNull();
  });
});

describe("ageAtDeath", () => {
  it("вік на день смерті з урахуванням дня народження", () => {
    expect(ageAtDeath("1960-03-21", "1994-05-01")).toBe(34);
    expect(ageAtDeath("1960-06-01", "1994-05-01")).toBe(33);
    expect(ageAtDeath("1960-05-01", "1994-05-01")).toBe(34);
  });

  it("некоректні дати й від'ємний вік — null", () => {
    expect(ageAtDeath("не дата", "1994-05-01")).toBeNull();
    expect(ageAtDeath("2000-01-01", "1990-01-01")).toBeNull();
  });
});
