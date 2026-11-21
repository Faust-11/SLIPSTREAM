import { describe, expect, it } from "vitest";
import { allDayKeys } from "../on-this-day";
import { nearestDay, pickEvents } from "../home-day";

const by = (race: number[], born: number[], died: number[]) => ({
  race: race.map((y) => `r${y}`),
  born: born.map((y) => `b${y}`),
  died: died.map((y) => `d${y}`),
});

describe("pickEvents", () => {
  it("по одній події кожного виду, найновіші першими; решта рахується як «ще»", () => {
    const r = pickEvents(by([2021, 2010, 1999], [1943, 1950], [1953]));
    expect(r.events).toEqual(["r2021", "b1943", "d1953"]);
    expect(r.kinds).toEqual(["race", "born", "died"]);
    expect(r.more).toBe(3);
  });

  it("немає народжень і смертей — три найновіші гонки", () => {
    const r = pickEvents(by([2021, 2010, 1999, 1980, 1960], [], []));
    expect(r.events).toEqual(["r2021", "r2010", "r1999"]);
    expect(r.more).toBe(2);
  });

  it("порядок показу — за видом, а не за порядком добору", () => {
    const r = pickEvents(by([], [1990, 1980], [2001]));
    expect(r.events).toEqual(["b1990", "b1980", "d2001"].sort((a, b) => ["r", "b", "d"].indexOf(a[0]!) - ["r", "b", "d"].indexOf(b[0]!)));
    expect(r.kinds).toEqual(["born", "born", "died"]);
  });

  it("менше трьох подій — показуємо всі, more = 0; порожній день — порожньо", () => {
    expect(pickEvents(by([2000], [], [])).more).toBe(0);
    expect(pickEvents(by([], [], [])).events).toEqual([]);
  });
});

describe("nearestDay", () => {
  const all = allDayKeys();
  const keys = all.filter((k) => !["12-11", "12-17", "12-31"].includes(k));

  it("день із подіями — він сам", () => {
    expect(nearestDay(keys, all, "11-21")).toBe("11-21");
  });
  it("порожній день — найближчий наступний", () => {
    expect(nearestDay(keys, all, "12-11")).toBe("12-12");
    expect(nearestDay(keys, all, "12-17")).toBe("12-18");
  });
  it("за колом року: після порожнього 12-31 — 01-01", () => {
    expect(nearestDay(keys, all, "12-31")).toBe("01-01");
  });
  it("нечинний ключ або порожній набір — null", () => {
    expect(nearestDay(keys, all, "13-40")).toBeNull();
    expect(nearestDay([], all, "11-21")).toBeNull();
  });
});
