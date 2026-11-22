// Погода уікенду гонки: замір на трасі (OpenF1) і прогноз до сесії (MET Norway). Лише на сервері: викликається з
// /api/weather/<рік>/<етап> (ISR 10 хв), сторінка гонки лишається статичною. Без ключів — обидва API відкриті.
// Ліміти: OpenF1 безкоштовно 3 запити/с і 30/хв — тому на гонку лише ДВА запити (сесії року + заміри всього уікенду за
// meeting_key); MET просить впізнаваний User-Agent з контактом, координати до 4 знаків і кеш за Expires (беремо 30 хв).
import "server-only";
import { buildSessions, findRaceSession, sessionsFromCalendar, WEATHER_FROM_YEAR, type MetPoint, type OpenSession, type PageSession, type Sample, type WeatherSession } from "@/lib/weather";
import { getCalendarWeatherRound } from "./calendar";
import { getCircuitCoords } from "./circuits";
import { getRacePage } from "./race-page";

export type RaceWeather = { year: number; round: number; updated: string; sessions: WeatherSession[] };

const DAY = 86_400_000;
/** Уікенд «свіжий», доки не минуло 3 доби після гонки: дані ще дописуються — кеш 10 хв; пізніше — 30 діб. */
const FRESH_MS = 3 * DAY;
const MONTH_S = 30 * 24 * 3600;
export const UA = "outlap.org hello@outlap.org";

export const openf1 = () => (process.env.OPENF1_API ?? "https://api.openf1.org/v1").replace(/\/$/, "");
const met = () => (process.env.MET_API ?? "https://api.met.no/weatherapi/locationforecast/2.0").replace(/\/$/, "");

/** JSON або null (помилка мережі, 429, не-JSON): джерела не мають валити сторінку, блок просто не з'явиться. */
export async function getJson<T>(url: string, revalidate: number, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(8000), next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Сторінка гонки є лише після результатів, а погоду хочемо й для етапу, що йде чи попереду, — тоді розклад, дату й трасу
 * беремо з календаря поточного сезону (f1.calendar_sessions). null — сезон раніше за 2023, не поточний без сторінки,
 * або такого етапу нема.
 */
async function weekendSource(year: number, round: number): Promise<{ date: string | null; circuit: string | null; sessions: PageSession[] } | null> {
  const page = await getRacePage(year, round, "en");
  if (page) return { date: page.date, circuit: page.circuit, sessions: page.sessions.map((s) => ({ kind: s.kind, at: s.at, real: s.real })) };
  const cal = await getCalendarWeatherRound(year, round);
  return cal ? { date: cal.date, circuit: cal.circuit, sessions: sessionsFromCalendar(cal.sessions.map((s) => ({ kind: s.kind, at: s.at, real: s.real }))) } : null;
}

/** null — такої гонки нема або сезон раніше за 2023 (заміри OpenF1 безкоштовні з 2023). */
export async function getRaceWeather(year: number, round: number, now: number = Date.now()): Promise<RaceWeather | null> {
  if (!Number.isInteger(year) || !Number.isInteger(round) || year < WEATHER_FROM_YEAR) return null;
  const page = await weekendSource(year, round);
  if (!page) return null;

  const raceMs = page.date ? Date.parse(`${page.date}T12:00:00Z`) : NaN;
  const fresh = !Number.isFinite(raceMs) || now - raceMs < FRESH_MS;
  const yearRev = fresh ? 600 : year === new Date(now).getUTCFullYear() ? DAY / 1000 : MONTH_S;
  const dataRev = fresh ? 600 : MONTH_S;

  const all = await getJson<OpenSession[]>(`${openf1()}/sessions?year=${year}`, yearRev);
  const race = all && page.date ? findRaceSession(all, page.date) : null;
  const open = race && all ? all.filter((s) => s.meeting_key === race.meeting_key) : [];

  // Заміри — лише коли хоч одна сесія вже почалась; прогноз — лише коли попереду є сесія не далі ніж через 10 діб.
  const starts = [...open.map((s) => Date.parse(s.date_start)), ...page.sessions.filter((s) => s.real && s.at).map((s) => Date.parse(s.at!))].filter(Number.isFinite);
  const started = starts.some((t) => t <= now);
  const needForecast = starts.some((t) => t > now && t - now < 10 * DAY);

  const coords = needForecast && page.circuit ? await getCircuitCoords(page.circuit) : null;
  const [samples, forecast] = await Promise.all([
    race && started ? getJson<Sample[]>(`${openf1()}/weather?meeting_key=${race.meeting_key}`, dataRev) : null,
    coords ? getJson<{ properties?: { timeseries?: MetPoint[] } }>(`${met()}/compact?lat=${coords.lat.toFixed(4)}&lon=${coords.lng.toFixed(4)}`, 1800, { "user-agent": UA }) : null,
  ]);

  return {
    year,
    round,
    updated: new Date(now).toISOString(),
    sessions: buildSessions({
      sessions: page.sessions.map((s) => ({ kind: s.kind, at: s.at, real: s.real })),
      open,
      samples: Array.isArray(samples) ? samples : [],
      forecast: forecast?.properties?.timeseries ?? null,
      now,
    }),
  };
}
