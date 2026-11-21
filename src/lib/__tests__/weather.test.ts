import { describe, expect, it } from "vitest";
import {
  buildSessions,
  compassIndex,
  conditionOf,
  findRaceSession,
  inWindow,
  kindOfSessionName,
  meanWind,
  pickForecast,
  summarize,
  type MetPoint,
  type OpenSession,
  type Sample,
} from "../weather";

const sample = (over: Partial<Sample> = {}): Sample => ({
  date: "2026-11-06T15:40:00+00:00",
  air_temperature: 20,
  track_temperature: 30,
  humidity: 60,
  wind_speed: 2,
  wind_direction: 90,
  rainfall: 0,
  ...over,
});

describe("kindOfSessionName", () => {
  it("назви OpenF1 → наші види (у 2023 спринт-кваліфікація — «Sprint Shootout»)", () => {
    expect(["Practice 1", "Practice 2", "Practice 3", "Qualifying", "Sprint Qualifying", "Sprint Shootout", "Sprint", "Race"].map(kindOfSessionName)).toEqual([
      "FP1", "FP2", "FP3", "Q", "SQ", "SQ", "SR", "R",
    ]);
    expect(kindOfSessionName("Day 1")).toBeNull();
  });
});

describe("meanWind / compassIndex", () => {
  it("350° і 10° дають північ, а не південь", () => {
    expect(meanWind([2, 2], [350, 10])!.from).toBe(0);
  });
  it("напрямок зважується швидкістю: штиль із «0°» не тягне середнє на північ", () => {
    expect(meanWind([0, 0, 10], [0, 0, 90])!.from).toBe(90);
  });
  it("повний штиль або протилежні вітри — напрямку нема, швидкість лишається", () => {
    expect(meanWind([0, 0], [0, 0])).toEqual({ speed: 0, from: null });
    expect(meanWind([5, 5], [90, 270])!.from).toBeNull();
    expect(meanWind([], [])).toBeNull();
  });
  it("8 румбів: межі посередині між сторонами світу", () => {
    expect([0, 22, 23, 90, 180, 270, 337, 338, 359, 360].map(compassIndex)).toEqual([0, 0, 1, 2, 4, 6, 7, 0, 0, 0]);
  });
});

describe("summarize", () => {
  it("мін–макс повітря й траси, середня вологість, вітер м/с → км/год, частка дощу", () => {
    const r = summarize([
      sample({ air_temperature: 20, track_temperature: 30, humidity: 60, wind_speed: 10, rainfall: 0 }),
      sample({ air_temperature: 22, track_temperature: 40, humidity: 70, wind_speed: 10, rainfall: 1 }),
    ])!;
    expect(r.air).toEqual([20, 22]);
    expect(r.track).toEqual([30, 40]);
    expect(r.humidity).toBe(65);
    expect(r.wind).toEqual({ kmh: 36, from: 90 });
    expect(r.rainShare).toBe(0.5);
    expect([r.mm, r.condition]).toEqual([null, null]);
  });
  it("збій датчика траси (рівно 0,0) не потрапляє в мінімум", () => {
    const r = summarize([sample({ track_temperature: 0 }), sample({ track_temperature: 39.3 }), sample({ track_temperature: 53.7 })])!;
    expect(r.track).toEqual([39.3, 53.7]);
  });
  it("нема придатного заміру повітря — null; нема замірів траси — track null", () => {
    expect(summarize([])).toBeNull();
    expect(summarize([sample({ air_temperature: null })])).toBeNull();
    expect(summarize([sample({ track_temperature: null })])!.track).toBeNull();
  });
});

describe("inWindow", () => {
  const at = (hh: string) => sample({ date: `2026-11-06T${hh}:00+00:00` });
  const start = Date.parse("2026-11-06T15:30:00Z");
  const end = Date.parse("2026-11-06T16:30:00Z");
  it("лише заміри за час сесії (OpenF1 віддає й хвилини до та після)", () => {
    const all = [at("15:15"), at("15:30"), at("16:00"), at("16:30"), at("16:35")];
    expect(inWindow(all, start, end).map((s) => s.date.slice(11, 16))).toEqual(["15:30", "16:00", "16:30"]);
  });
  it("у вікні менше трьох замірів — беремо всі (сесію зсунули)", () => {
    const all = [at("15:15"), at("16:00"), at("16:35")];
    expect(inWindow(all, start, end)).toHaveLength(3);
  });
});

const race = (key: number, meeting: number, start: string, extra: Partial<OpenSession> = {}): OpenSession => ({
  session_key: key,
  meeting_key: meeting,
  session_name: "Race",
  date_start: start,
  date_end: start,
  ...extra,
});

describe("findRaceSession", () => {
  const all = [race(1, 10, "2026-11-01T20:00:00+00:00"), race(2, 11, "2026-11-08T17:00:00+00:00"), { ...race(3, 12, "2026-11-08T17:00:00+00:00"), session_name: "Practice 1" }];
  it("гонка за датою; допуск ±1 день, найближча виграє", () => {
    expect(findRaceSession(all, "2026-11-08")!.session_key).toBe(2);
    expect(findRaceSession(all, "2026-11-09")!.session_key).toBe(2);
    expect(findRaceSession(all, "2026-11-01")!.session_key).toBe(1);
  });
  it("далі за добу, скасована й не «Race» — не підходять", () => {
    expect(findRaceSession(all, "2026-11-15")).toBeNull();
    expect(findRaceSession([race(9, 9, "2026-11-08T17:00:00+00:00", { is_cancelled: true })], "2026-11-08")).toBeNull();
    expect(findRaceSession(all, "не дата")).toBeNull();
  });
});

describe("conditionOf", () => {
  it("symbol_code MET → група стану", () => {
    expect(
      ["clearsky_day", "fair_night", "partlycloudy_day", "cloudy", "fog", "lightrain", "rainshowers_day", "heavyrain", "heavyrainshowers_night", "lightrainandthunder", "heavysleet", "snow", "unknown", undefined].map(conditionOf),
    ).toEqual(["clear", "clear", "partly", "cloudy", "fog", "rain", "rain", "heavyrain", "heavyrain", "thunder", "snow", "snow", null, null]);
  });
});

const met = (time: string, over: Partial<MetPoint["data"]> = {}, details = {}): MetPoint => ({
  time,
  data: {
    instant: { details: { air_temperature: 20.46, relative_humidity: 80, wind_speed: 5, wind_from_direction: 200.4, ...details } },
    next_1_hours: { summary: { symbol_code: "lightrain" }, details: { precipitation_amount: 0.4 } },
    ...over,
  },
});

describe("pickForecast", () => {
  const series = [met("2026-11-22T03:00:00Z", {}, { air_temperature: 18 }), met("2026-11-22T04:00:00Z"), met("2026-11-22T05:00:00Z", {}, { air_temperature: 22 })];
  it("найближча до моменту точка: температура, вологість, вітер км/год, опади за годину, стан", () => {
    expect(pickForecast(series, Date.parse("2026-11-22T04:10:00Z"))).toEqual({
      air: [20.5, 20.5],
      track: null,
      humidity: 80,
      wind: { kmh: 18, from: 200 },
      rainShare: null,
      mm: 0.4,
      condition: "rain",
    });
  });
  it("далі за 3 год від найближчої точки або порожній ряд — null", () => {
    expect(pickForecast(series, Date.parse("2026-11-22T12:00:00Z"))).toBeNull();
    expect(pickForecast([], Date.now())).toBeNull();
  });
  it("шестигодинна точка (далекий прогноз): стан є, мм нема — період не збігається з сесією", () => {
    const far = [met("2026-11-28T12:00:00Z", { next_1_hours: undefined, next_6_hours: { summary: { symbol_code: "cloudy" }, details: { precipitation_amount: 2 } } })];
    const r = pickForecast(far, Date.parse("2026-11-28T13:00:00Z"))!;
    expect([r.mm, r.condition]).toEqual([null, "cloudy"]);
  });
});

describe("buildSessions", () => {
  const open: OpenSession[] = [
    { session_key: 1, meeting_key: 5, session_name: "Practice 1", date_start: "2026-11-20T04:30:00+00:00", date_end: "2026-11-20T05:30:00+00:00" },
    { session_key: 2, meeting_key: 5, session_name: "Qualifying", date_start: "2026-11-21T04:00:00+00:00", date_end: "2026-11-21T05:00:00+00:00" },
    { session_key: 3, meeting_key: 5, session_name: "Race", date_start: "2026-11-22T04:00:00+00:00", date_end: "2026-11-22T06:00:00+00:00" },
  ];
  const samples = [1, 2, 3, 4].map((m) => sample({ session_key: 1, date: `2026-11-20T04:4${m}:00+00:00`, air_temperature: 10 + m }));
  const forecast = [met("2026-11-22T05:00:00Z")];
  const mk = (kind: "FP1" | "Q" | "R", at: string | null = null, real = false) => ({ kind, at, real });
  const run = (now: string, sessions = [mk("FP1"), mk("Q"), mk("R")]) => buildSessions({ sessions, open, samples, forecast, now: Date.parse(now) });

  it("минула сесія — заміри OpenF1, майбутня — прогноз; ідуча без замірів — none", () => {
    const r = run("2026-11-21T04:30:00Z");
    expect(r.map((s) => [s.kind, s.state, s.source])).toEqual([["FP1", "done", "openf1"], ["Q", "none", null], ["R", "forecast", "met"]]);
    expect(r[0]!.data!.air).toEqual([11, 14]);
    expect(r[0]!.start).toBe("2026-11-20T04:30:00.000Z");
  });
  it("ідуча сесія (live) із замірами — заміри до цієї хвилини; без замірів — none, а не вигадане", () => {
    const live = buildSessions({ sessions: [mk("FP1")], open, samples, forecast, now: Date.parse("2026-11-20T04:50:00Z") });
    expect(live[0]).toMatchObject({ state: "live", source: "openf1" });
    expect(run("2026-11-21T04:30:00Z")[1]).toMatchObject({ state: "none", source: null, data: null });
  });
  it("час береться з OpenF1; якщо сесії там нема — з нашого розкладу, лише справжній", () => {
    const r = buildSessions({ sessions: [mk("FP1", "2026-11-20T04:30:00+00:00", true), { kind: "FP2", at: "2026-11-20T08:00:00+00:00", real: true }, { kind: "FP3", at: "2026-11-21T00:00:00+00:00", real: false }], open, samples, forecast, now: Date.parse("2026-11-19T00:00:00Z") });
    expect(r[1]).toMatchObject({ start: "2026-11-20T08:00:00.000Z", end: "2026-11-20T09:00:00.000Z" });
    expect(r[2]).toMatchObject({ state: "none", start: null, end: null });
  });
  it("прогноз недоступний (далеко чи джерело впало) — none", () => {
    const r = buildSessions({ sessions: [mk("R")], open, samples: [], forecast: null, now: Date.parse("2026-11-10T00:00:00Z") });
    expect(r[0]).toMatchObject({ state: "none", data: null });
  });
});
