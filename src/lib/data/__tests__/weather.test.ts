import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCalendarWeatherRound } from "../calendar";
import { getRaceWeather } from "../weather";

// Сторінка гонки й координати трас — моки; мережа — підставний fetch за адресами (жодного звернення до OpenF1/MET).
vi.mock("../race-page", () => ({
  getRacePage: vi.fn(async (year: number, round: number) =>
    year === 2026 && round === 20
      ? { date: "2026-11-08", circuit: "interlagos", sessions: [{ kind: "FP1", at: "2026-11-06T15:30:00+00:00", real: true, best: null }, { kind: "R", at: "2026-11-08T17:00:00+00:00", real: true, best: null }] }
      : null,
  ),
}));
// Етап без сторінки гонки (ідучий/майбутній) — розклад із календаря поточного сезону (2026, етап 21 — Лас-Вегас).
vi.mock("../calendar", () => ({
  getCalendarWeatherRound: vi.fn(async (year: number, round: number) =>
    year === 2026 && round === 21
      ? {
          date: "2026-11-22",
          circuit: "vegas",
          sessions: [
            { kind: "FP1", at: "2026-11-20T00:30:00+00:00", real: true },
            { kind: "Q1", at: "2026-11-21T04:00:00+00:00", real: true },
            { kind: "R", at: "2026-11-22T04:00:00+00:00", real: true },
          ],
        }
      : null,
  ),
}));
vi.mock("../circuits", () => ({ getCircuitCoords: vi.fn(async () => ({ lat: -23.703612, lng: -46.699745 })) }));

const SESSIONS = [
  { session_key: 11405, meeting_key: 1299, session_name: "Practice 1", date_start: "2026-11-06T15:30:00+00:00", date_end: "2026-11-06T16:30:00+00:00" },
  { session_key: 11412, meeting_key: 1299, session_name: "Race", date_start: "2026-11-08T17:00:00+00:00", date_end: "2026-11-08T19:00:00+00:00" },
  { session_key: 99, meeting_key: 1300, session_name: "Race", date_start: "2026-11-22T04:00:00+00:00", date_end: "2026-11-22T06:00:00+00:00" },
];
const WEATHER = [0, 1, 2, 3].map((i) => ({ session_key: 11405, date: `2026-11-06T15:4${i}:00+00:00`, air_temperature: 23 + i, track_temperature: 40 + i, humidity: 70, wind_speed: 2, wind_direction: 180, rainfall: 0 }));
const MET = { properties: { timeseries: [{ time: "2026-11-08T17:00:00Z", data: { instant: { details: { air_temperature: 16 } } } }] } };

let calls: { url: string; init: RequestInit & { next?: { revalidate?: number } } }[] = [];
let failAll = false;
beforeEach(() => {
  calls = [];
  failAll = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit & { next?: { revalidate?: number } }) => {
      calls.push({ url: String(url), init });
      if (failAll) throw new Error("мережа");
      const u = String(url);
      const body = u.includes("/sessions?year=") ? SESSIONS : u.includes("/weather?meeting_key=") ? WEATHER : u.includes("/compact?") ? MET : null;
      return body ? Response.json(body) : new Response("x", { status: 404 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("getRaceWeather", () => {
  it("минулий уікенд (давно): два запити до OpenF1, довгий кеш, без прогнозу MET", async () => {
    const r = await getRaceWeather(2026, 20, Date.parse("2026-12-20T00:00:00Z"));
    expect(calls.map((c) => c.url)).toEqual(["https://api.openf1.org/v1/sessions?year=2026", "https://api.openf1.org/v1/weather?meeting_key=1299"]);
    expect(calls.every((c) => c.init.next?.revalidate === 30 * 24 * 3600 || c.init.next?.revalidate === 86400)).toBe(true);
    expect(r!.sessions.map((s) => [s.kind, s.state, s.source])).toEqual([["FP1", "done", "openf1"], ["R", "none", null]]);
    expect(r!.sessions[0]!.data!.air).toEqual([23, 26]);
  });

  it("свіжий уікенд (гонка вчора): кеш 10 хв, прогноз не питаємо — попереду сесій нема", async () => {
    await getRaceWeather(2026, 20, Date.parse("2026-11-09T00:00:00Z"));
    expect(calls.map((c) => [c.url.split("?")[0]!.split("/").pop(), c.init.next?.revalidate])).toEqual([["sessions", 600], ["weather", 600]]);
  });

  it("майбутній уікенд: заміри не питаємо, прогноз MET — із впізнаваним User-Agent і координатами до 4 знаків", async () => {
    const r = await getRaceWeather(2026, 20, Date.parse("2026-11-05T00:00:00Z"));
    const urls = calls.map((c) => c.url);
    expect(urls.some((u) => u.includes("/weather?"))).toBe(false);
    const metCall = calls.find((c) => c.url.includes("api.met.no"))!;
    expect(metCall.url).toBe("https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=-23.7036&lon=-46.6997");
    expect((metCall.init.headers as Record<string, string>)["user-agent"]).toBe("outlap.org hello@outlap.org");
    expect(metCall.init.next?.revalidate).toBe(1800);
    // FP1 (6 лист.) — поза точками прогнозу (є лише 8 лист. 17:00) → none; гонка 17–19 UTC → прогноз.
    expect(r!.sessions.map((s) => [s.kind, s.state, s.source])).toEqual([["FP1", "none", null], ["R", "forecast", "met"]]);
    expect(r!.sessions[1]!.data!.air).toEqual([16, 16]);
  });

  it("сезон до 2023 і невідома гонка — null без жодного запиту", async () => {
    expect(await getRaceWeather(2022, 1)).toBeNull();
    expect(await getRaceWeather(2026, 99)).toBeNull();
    expect(await getRaceWeather(2026.5, 1)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("джерела недоступні — не падає: усі сесії none", async () => {
    failAll = true;
    const r = await getRaceWeather(2026, 20, Date.parse("2026-11-09T00:00:00Z"));
    expect(r!.sessions.every((s) => s.state === "none" && s.data === null)).toBe(true);
  });

  it("етап без сторінки гонки — розклад береться з календаря (Q1 → Q): прогноз і 404-кейси", async () => {
    const r = await getRaceWeather(2026, 21, Date.parse("2026-11-19T00:00:00Z"));
    expect(r).not.toBeNull();
    expect(r!.sessions.map((s) => s.kind)).toEqual(["FP1", "Q", "R"]);
    // Заміри ще не питаємо (жодна сесія не стартувала); прогноз — за координатами траси календаря.
    expect(calls.some((c) => c.url.includes("/weather?"))).toBe(false);
    expect(calls.some((c) => c.url.includes("api.met.no"))).toBe(true);
    expect(getCalendarWeatherRound).toHaveBeenCalledWith(2026, 21);
  });

  it("етапу нема ні на сторінках гонок, ні в календарі (інший сезон, номер) — null без запитів", async () => {
    expect(await getRaceWeather(2026, 77)).toBeNull();
    expect(await getRaceWeather(2025, 21)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
