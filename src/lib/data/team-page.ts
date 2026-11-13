// Сторінка команди: числа — з подань бази (0005), наш контент — src/data/curated. Лише на сервері.
import "server-only";
import driverNamesJson from "@/data/curated/driver-names.json";
import grandsPrixJson from "@/data/curated/grands-prix.json";
import teamFactsJson from "@/data/curated/team-facts.json";
import teamNotesJson from "@/data/curated/team-notes.json";
import type { Locale } from "@/i18n/config";
import { dbSelectAll } from "./db";
import { once } from "./once";
import { curatedDrivers, curatedTeams } from "./teams";
import type {
  CuratedTeam,
  DbDriverName,
  L10n,
  TeamChampionRow,
  TeamPairingRow,
  TeamSeasonRow,
  TeamTotalsRow,
  TeamWinRow,
} from "./types";

/* ---------- кураторські дані ---------- */

type FactsEntry = {
  founders?: { name: L10n }[];
  base?: { city: L10n | null; country: L10n };
  instagram?: string;
  manual?: {
    founders?: L10n[] | null;
    base?: { city: L10n | null; country: L10n; years: string | null }[] | null;
    instagram?: string | null;
  };
};
type NoteEntry = { year: number; text: L10n; sources: { url: string; title?: string }[] };

const driverNames = (driverNamesJson as unknown as { drivers: Record<string, L10n & { manual?: { uk: string } }> }).drivers;
const gpNames = (grandsPrixJson as { names: Record<string, string> }).names;
const facts = (teamFactsJson as unknown as { teams: Record<string, FactsEntry> }).teams;
const notes = (teamNotesJson as unknown as { notes: Record<string, NoteEntry[]> }).notes;

/** Назва Гран-прі мовою сторінки; нова назва без перекладу — англійською (не ламає збірку; ловить тест). */
export function gpName(name: string, locale: Locale): string {
  return locale === "uk" ? (gpNames[name] ?? name) : name;
}

export type DriverView = { id: string; name: string; initials: string; avatar: string | null };

/** Пілот мовою сторінки: кураторські дані (з фото) → імена з Wikidata/ручні → латиниця з бази. */
export function driverView(d: DbDriverName, locale: Locale): DriverView {
  const c = curatedDrivers[d.ref];
  const latin = `${d.forename} ${d.surname}`;
  const n = driverNames[d.ref];
  const name = c ? c.name[locale] : locale === "uk" ? (n?.manual?.uk ?? n?.uk ?? latin) : (n?.en ?? latin);
  const initials = c?.initials ?? `${d.forename[0] ?? ""}${d.surname[0] ?? ""}`.toUpperCase();
  return { id: d.ref, name, initials, avatar: c?.avatar ?? null };
}

export type TeamFacts = {
  founders: string[];
  base: { city: string | null; country: string; years: string | null }[];
  instagram: string | null;
};

function teamFacts(id: string, locale: Locale): TeamFacts {
  const f = facts[id] ?? {};
  const m = f.manual ?? {};
  // Ручні значення (дослідження з джерелами) мають перевагу; null у ручних — свідомо «немає».
  const founders = m.founders !== undefined ? (m.founders ?? []) : (f.founders ?? []).map((x) => x.name);
  const base =
    m.base !== undefined ? (m.base ?? []) : f.base ? [{ city: f.base.city, country: f.base.country, years: null }] : [];
  return {
    founders: founders.map((x) => x[locale]),
    base: base.map((b) => ({ city: b.city?.[locale] ?? null, country: b.country[locale], years: b.years })),
    instagram: m.instagram !== undefined ? m.instagram : (f.instagram ?? null),
  };
}

/* ---------- дані бази: один запит на подання на процес ---------- */

function grouped<T extends { id: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.id);
    if (list) list.push(r);
    else m.set(r.id, [r]);
  }
  return m;
}

const loadTotals = once(async () =>
  grouped(
    await dbSelectAll<TeamTotalsRow>(
      "team_totals",
      "select=id,grands_prix,wins,podiums,poles,one_twos,constructors_titles,drivers_titles,debut_year,debut_name,debut_date,last_year,last_name,last_date&order=id",
    ),
  ),
);
/** Спільний для сторінки сезону (один запит на збірку). */
export const loadTeamSeasons = once(async () =>
  grouped(
    await dbSelectAll<TeamSeasonRow>(
      "team_seasons",
      "select=id,year,entries,grands_prix,wins,podiums,position,points,excluded,champion,in_progress,season_races&order=id,year",
    ),
  ),
);
const loadWins = once(async () =>
  grouped(await dbSelectAll<TeamWinRow>("team_wins", "select=id,n,year,round,name,date,drivers&order=id,n")),
);
const loadChampions = once(async () =>
  grouped(await dbSelectAll<TeamChampionRow>("team_champions", "select=id,driver,forename,surname,years&order=id,driver")),
);
const loadPairing = once(async () =>
  grouped(
    await dbSelectAll<TeamPairingRow>(
      "team_pairing",
      "select=id,driver,forename,surname,ord,races,points,in_last_race,race_ahead,quali_ahead&order=id,ord",
    ),
  ),
);

/* ---------- висновки з даних ---------- */

export type TeamInsights = {
  /** Найдовша серія Кубків поспіль (≥ 2). */
  titleStreak: { count: number; from: number; to: number } | null;
  /** Найбільше перемог за сезон. */
  bestSeason: { wins: number; races: number; year: number } | null;
  /** Найдовша перерва між Кубками (≥ 2 Кубки). */
  longestWait: { years: number; from: number; to: number } | null;
  excluded: number[];
};

export function insights(seasons: TeamSeasonRow[]): TeamInsights {
  const titles = seasons.filter((s) => s.champion).map((s) => s.year).sort((a, b) => a - b);
  let streak: TeamInsights["titleStreak"] = null;
  for (let i = 0; i < titles.length; ) {
    let j = i;
    while (j + 1 < titles.length && titles[j + 1] === titles[j]! + 1) j++;
    const count = j - i + 1;
    if (count >= 2 && (!streak || count > streak.count)) streak = { count, from: titles[i]!, to: titles[j]! };
    i = j + 1;
  }
  let wait: TeamInsights["longestWait"] = null;
  for (let i = 1; i < titles.length; i++) {
    const years = titles[i]! - titles[i - 1]!;
    if (years > 1 && (!wait || years > wait.years)) wait = { years, from: titles[i - 1]!, to: titles[i]! };
  }
  // Найбільше перемог; рівність — кращий відсоток, далі раніший сезон.
  const best = seasons
    .filter((s) => s.wins > 0)
    .sort((a, b) => b.wins - a.wins || b.wins / b.season_races - a.wins / a.season_races || a.year - b.year)[0];
  return {
    titleStreak: streak,
    bestSeason: best ? { wins: best.wins, races: best.season_races, year: best.year } : null,
    longestWait: wait,
    excluded: seasons.filter((s) => s.excluded).map((s) => s.year),
  };
}

/* ---------- сторінка ---------- */

export type TeamWin = { n: number; year: number; round: number; name: string; date: string; drivers: DriverView[] };

export type TeamPage = {
  team: CuratedTeam;
  country: string;
  facts: TeamFacts;
  totals: TeamTotalsRow;
  debut: { year: number; name: string };
  last: { year: number; name: string };
  /** Від нових до старих. */
  seasons: TeamSeasonRow[];
  insights: TeamInsights;
  notes: { year: number; text: string; sources: NoteEntry["sources"] }[];
  champions: { driver: DriverView; years: number[] }[];
  wins: {
    list: TeamWin[];
    byDriver: { driver: DriverView; count: number }[];
    byGrandPrix: { name: string; count: number }[];
    /** Перша, 100-та/200-та… (найбільша кругла < останньої), остання. */
    featured: { kind: "first" | "milestone" | "latest"; win: TeamWin }[];
  };
  /** Склад останньої гонки поточного сезону (як у списку команд). */
  currentDrivers: DriverView[];
  /** Основна пара сезону (найбільше гонок) — порівняння «хто попереду». */
  pairing: null | { drivers: (DriverView & Omit<TeamPairingRow, "id" | "driver" | "forename" | "surname" | "in_last_race">)[] };
  currentSeason: number;
};

let maxYear: number | undefined;
function seasonYearMax(by: Map<string, TeamSeasonRow[]>): number {
  if (maxYear === undefined) for (const rows of by.values()) for (const r of rows) maxYear = Math.max(maxYear ?? 0, r.year);
  return maxYear!;
}

export function getTeamIds(): string[] {
  return curatedTeams.map((t) => t.id);
}

export async function getTeamPage(id: string, locale: Locale): Promise<TeamPage | null> {
  const team = curatedTeams.find((t) => t.id === id);
  if (!team) return null;
  const [totalsBy, seasonsBy, winsBy, champsBy, pairBy] = await Promise.all([
    loadTotals(),
    loadTeamSeasons(),
    loadWins(),
    loadChampions(),
    loadPairing(),
  ]);
  const totals = totalsBy.get(id)?.[0];
  if (!totals) throw new Error(`Команда ${id} є в curated/teams.json, але не в f1.team_totals`);
  const seasonsAsc = seasonsBy.get(id) ?? [];
  const currentSeason = seasonYearMax(seasonsBy);

  const list: TeamWin[] = (winsBy.get(id) ?? []).map((w) => ({
    n: w.n,
    year: w.year,
    round: w.round,
    name: gpName(w.name, locale),
    date: w.date,
    drivers: w.drivers.map((d) => driverView(d, locale)),
  }));
  const byDriverMap = new Map<string, { driver: DriverView; count: number }>();
  for (const w of list)
    for (const d of w.drivers) {
      const e = byDriverMap.get(d.id) ?? { driver: d, count: 0 };
      e.count++;
      byDriverMap.set(d.id, e);
    }
  const byGpMap = new Map<string, number>();
  for (const w of list) byGpMap.set(w.name, (byGpMap.get(w.name) ?? 0) + 1);
  const collator = new Intl.Collator(locale === "uk" ? "uk" : "en");
  const featured: TeamPage["wins"]["featured"] = [];
  if (list.length > 0) featured.push({ kind: "first", win: list[0]! });
  const milestone = Math.floor((list.length - 1) / 100) * 100;
  if (milestone >= 100) featured.push({ kind: "milestone", win: list[milestone - 1]! });
  if (list.length > 1) featured.push({ kind: "latest", win: list[list.length - 1]! });

  const pairRows = pairBy.get(id) ?? [];
  return {
    team,
    country: team.country[locale],
    facts: teamFacts(id, locale),
    totals,
    debut: { year: totals.debut_year, name: gpName(totals.debut_name, locale) },
    last: { year: totals.last_year, name: gpName(totals.last_name, locale) },
    seasons: [...seasonsAsc].sort((a, b) => b.year - a.year),
    insights: insights(seasonsAsc),
    notes: (notes[id] ?? []).map((n) => ({ year: n.year, text: n.text[locale], sources: n.sources })),
    champions: (champsBy.get(id) ?? [])
      .map((c) => ({ driver: driverView({ ref: c.driver, forename: c.forename, surname: c.surname }, locale), years: c.years }))
      .sort((a, b) => a.years[0]! - b.years[0]!),
    wins: {
      list,
      byDriver: [...byDriverMap.values()].sort((a, b) => b.count - a.count || collator.compare(a.driver.name, b.driver.name)),
      byGrandPrix: [...byGpMap.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || collator.compare(a.name, b.name)),
      featured,
    },
    currentDrivers: pairRows
      .filter((r) => r.in_last_race)
      .map((r) => driverView({ ref: r.driver, forename: r.forename, surname: r.surname }, locale)),
    pairing:
      pairRows.filter((r) => r.ord <= 2).length === 2
        ? {
            drivers: pairRows.filter((r) => r.ord <= 2).map((r) => ({
              ...driverView({ ref: r.driver, forename: r.forename, surname: r.surname }, locale),
              ord: r.ord,
              races: r.races,
              points: r.points,
              race_ahead: r.race_ahead,
              quali_ahead: r.quali_ahead,
            })),
          }
        : null,
    currentSeason,
  };
}
