// Попередні результати гонки з OpenF1 для головної (рішення 22.11): Jolpica віддає гонку з затримкою в години, а OpenF1 —
// за хвилини після фінішу. Лише на сервері: /api/prelim/<мова>/<рік>/<етап> (ISR 5 хв), сторінка лишається статичною; у базу
// нічого не пишемо. Ліміти OpenF1 (3 запити/с, 30/хв): ТРИ запити на кеш-вікно — сесії року (той самий URL і кеш, що й у погоди),
// результати й пілоти сесії; поки гонка не завершилась за даними OpenF1, результатів не запитуємо взагалі.
import "server-only";
import type { Locale } from "@/i18n/config";
import { buildRows, makeMatcher, type OpenDriver, type OpenResult, type PrelimResults } from "@/lib/prelim";
import { findRaceSession, WEATHER_FROM_YEAR, type OpenSession } from "@/lib/weather";
import { getCalendarWeatherRound } from "./calendar";
import { makeDriver, loadNames } from "./season-page";
import { getJson, openf1, UA } from "./weather";

const HEADERS = { "user-agent": UA };

/** null — гонки нема, сезон раніше за 2023, гонка ще не завершилась за OpenF1 чи результатів ще нема. */
export async function getPrelimResults(year: number, round: number, locale: Locale, now: number = Date.now()): Promise<PrelimResults | null> {
  if (!Number.isInteger(year) || !Number.isInteger(round) || year < WEATHER_FROM_YEAR) return null;
  const cal = await getCalendarWeatherRound(year, round);
  if (!cal?.date) return null;

  const all = await getJson<OpenSession[]>(`${openf1()}/sessions?year=${year}`, 600, HEADERS);
  const race = Array.isArray(all) ? findRaceSession(all, cal.date) : null;
  if (!race || !(Date.parse(race.date_end) < now)) return null;

  const [results, drivers] = await Promise.all([
    getJson<OpenResult[]>(`${openf1()}/session_result?session_key=${race.session_key}`, 300, HEADERS),
    getJson<OpenDriver[]>(`${openf1()}/drivers?session_key=${race.session_key}`, 3600, HEADERS),
  ]);
  if (!Array.isArray(results) || results.length === 0 || !Array.isArray(drivers)) return null;

  const names = await loadNames();
  const match = makeMatcher([...names.values()].map((r) => ({ id: r.id, forename: r.forename, surname: r.surname, code: r.code })));
  const display = (id: string) => {
    const d = makeDriver(id, names, locale);
    return { name: d.name, slug: d.slug };
  };
  const rows = buildRows(results, drivers, match, display);
  if (rows.length === 0) return null;
  return { year, round, sessionKey: race.session_key, updated: new Date(now).toISOString(), rows };
}
