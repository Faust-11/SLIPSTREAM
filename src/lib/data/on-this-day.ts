// «Цей день у Формулі-1»: гонки, народження й смерті пілотів за календарною датою (без року).
// Гонки — f1.season_rounds (етапи з переможцем, без скасованих); народження й смерті — driver_totals + driver-facts.json
// (getDriverLifeDates: ручні правки мають пріоритет). Один прохід на збірку: усі 366 днів з одних даних. Лише на сервері.
import "server-only";
import type { Locale } from "@/i18n/config";
import { ageAtDeath, allDayKeys, dayKeyOfDate } from "@/lib/on-this-day";
import { getDriverLifeDates } from "./driver-page";
import { once } from "./once";
import { loadNames, loadRounds, makeDriver, placeName } from "./season-page";
import { gpName } from "./team-page";

export type DayDriver = { name: string; slug: string };
export type DayRace = { year: number; round: number; gp: string; place: string; winners: DayDriver[] };
export type DayPerson = DayDriver & { year: number; age: number | null };
export type DayPage = { key: string; races: DayRace[]; births: DayPerson[]; deaths: DayPerson[] };
export type DayCounts = { races: number; births: number; deaths: number };

type RawDay = {
  races: { year: number; round: number; name: string; circuit: string | null; locality: string | null; winners: string[] }[];
  births: { id: string; year: number }[];
  deaths: { id: string; year: number; age: number | null }[];
};

const loadDays = once(async () => {
  const [roundsBy, life] = await Promise.all([loadRounds(), getDriverLifeDates()]);
  const days = new Map<string, RawDay>();
  const day = (key: string) => {
    let d = days.get(key);
    if (!d) days.set(key, (d = { races: [], births: [], deaths: [] }));
    return d;
  };
  for (const rows of roundsBy.values()) {
    for (const r of rows) {
      // Лише етапи, що відбулися: є номер, не скасований, є переможець (майбутні гонки без результатів — ні).
      if (r.cancelled || r.round === null || !r.winners?.length) continue;
      const key = dayKeyOfDate(r.date);
      if (!key) continue;
      day(key).races.push({ year: r.year, round: r.round, name: r.name, circuit: r.circuit, locality: r.locality, winners: r.winners.map((w) => w.driver) });
    }
  }
  for (const [id, { born, died }] of life) {
    const bk = dayKeyOfDate(born);
    if (bk && born) day(bk).births.push({ id, year: Number(born.slice(0, 4)) });
    const dk = dayKeyOfDate(died);
    if (dk && died) day(dk).deaths.push({ id, year: Number(died.slice(0, 4)), age: born ? ageAtDeath(born, died) : null });
  }
  for (const d of days.values()) {
    d.races.sort((a, b) => a.year - b.year || a.round - b.round);
    d.births.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
    d.deaths.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
  }
  return days;
});

/** Дні року, у які щось сталося (гонка, народження чи смерть пілота), у календарному порядку. */
export async function getHistoryDays(): Promise<string[]> {
  const days = await loadDays();
  return allDayKeys().filter((k) => days.has(k));
}

/** Кількість подій по днях — для карти дат на головній сторінці розділу. */
export async function getHistoryCounts(): Promise<Map<string, DayCounts>> {
  const days = await loadDays();
  return new Map([...days].map(([k, d]) => [k, { races: d.races.length, births: d.births.length, deaths: d.deaths.length }]));
}

export async function getDayPage(key: string, locale: Locale): Promise<DayPage | null> {
  const [days, names] = await Promise.all([loadDays(), loadNames()]);
  const d = days.get(key);
  if (!d) return null;
  const driver = (id: string): DayDriver => {
    const m = makeDriver(id, names, locale);
    return { name: m.name, slug: m.slug };
  };
  return {
    key,
    races: d.races.map((r) => ({
      year: r.year,
      round: r.round,
      gp: gpName(r.name, locale),
      place: placeName(r.circuit, r.locality, locale),
      winners: r.winners.map(driver),
    })),
    births: d.births.map((p) => ({ ...driver(p.id), year: p.year, age: null })),
    deaths: d.deaths.map((p) => ({ ...driver(p.id), year: p.year, age: p.age })),
  };
}
