// Сторінка пілота: числа — з подань бази (0007, 0008), наш контент — src/data/curated. Лише на сервері.
import "server-only";
import driverFactsJson from "@/data/curated/driver-facts.json";
import driverHeroesJson from "@/data/curated/driver-heroes.json";
import type { Locale } from "@/i18n/config";
import { countryName } from "@/lib/countries";
import { driverSlug } from "@/lib/driver-slug";
import { dbSelectAll } from "./db";
import { driverName, driverPortrait } from "./drivers";
import { once } from "./once";
import { gpName } from "./team-page";
import { curatedDrivers, curatedTeams } from "./teams";
import type {
  Credit,
  DriverIndexRow,
  DriverSeasonRow,
  DriverTeammateRow,
  DriverTotalsRow,
  DriverWinRow,
} from "./types";

/* ---------- кураторські дані ---------- */

type FactsEntry = { instagram?: string; died?: string; alive?: boolean; manual?: { instagram?: string | null; died?: string | null } };
const facts = (driverFactsJson as unknown as { drivers: Record<string, FactsEntry> }).drivers;
/** Фактичні ширини файлів `<id>-420.webp` і (якщо є) `<id>-640.webp`; кадр 4:5 (scripts/curated/driver_hero.py). */
const heroes = (driverHeroesJson as unknown as { drivers: Record<string, number[]> }).drivers;
const teamsById = new Map(curatedTeams.map((t) => [t.id, t]));

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

const loadIndex = once(async () => {
  const rows = await dbSelectAll<DriverIndexRow>(
    "driver_index",
    "select=id,forename,surname,code,country_code,nationality,starts,wins,podiums,poles,titles,title_years,y0,y1,seasons," +
      "main_team,current_team,current_number,current_position,current_points&order=id",
  );
  const bySlug = new Map<string, DriverIndexRow>();
  for (const r of rows) {
    const slug = driverSlug(r.id);
    // Дві різні id з однаковим slug дали б одну сторінку на двох пілотів — зупиняємо збірку.
    if (bySlug.has(slug)) throw new Error(`Пілоти ${bySlug.get(slug)!.id} і ${r.id} мають однаковий slug ${slug}`);
    bySlug.set(slug, r);
  }
  return bySlug;
});
const loadTotals = once(async () =>
  grouped(
    await dbSelectAll<DriverTotalsRow>(
      "driver_totals",
      "select=id,date_of_birth,permanent_number,points,fastest_laps,fastest_laps_known,debut,last_race,first_podium,first_pole&order=id",
    ),
  ),
);
const loadSeasons = once(async () =>
  grouped(
    await dbSelectAll<DriverSeasonRow>(
      "driver_seasons",
      "select=id,year,teams,numbers,races,wins,podiums,poles,points,position,excluded,champion,in_progress&order=id,year",
    ),
  ),
);
const loadWins = once(async () =>
  grouped(await dbSelectAll<DriverWinRow>("driver_wins", "select=id,n,year,round,name,date,team,grid&order=id,n")),
);
const loadTeammates = once(async () =>
  grouped(
    await dbSelectAll<DriverTeammateRow>(
      "driver_teammates",
      "select=id,team,mate,forename,surname,years,races,race_ahead,race_behind,quali_races,quali_ahead,quali_behind&order=id,team,mate",
    ),
  ),
);

/* ---------- чисті функції (unit-тести) ---------- */

/** Роки → «2007, 2015–2016» (діапазони для сусідніх років). */
export function yearRanges(years: number[]): string {
  const ys = [...new Set(years)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < ys.length; ) {
    let j = i;
    while (j + 1 < ys.length && ys[j + 1] === ys[j]! + 1) j++;
    out.push(i === j ? `${ys[i]}` : `${ys[i]}–${ys[j]}`);
    i = j + 1;
  }
  return out.join(", ");
}

export type Stint = { team: string; from: number; to: number };

/** Періоди за командами: та сама команда в сусідніх сезонах (без перерви) зливається в один період. */
export function teamStints(seasons: Pick<DriverSeasonRow, "year" | "teams">[]): Stint[] {
  const out: Stint[] = [];
  for (const s of [...seasons].sort((a, b) => a.year - b.year)) {
    // У сезоні з двома командами — обидві, у порядку першої гонки (Феттель 2007: BMW Sauber, потім Toro Rosso).
    for (const t of s.teams) {
      const last = out[out.length - 1];
      // Перерва в рік і більше — новий період (Брандл: Brabham 1989 і 1991, не «1989–1991»).
      if (last && last.team === t.id && s.year - last.to <= 1) last.to = s.year;
      else out.push({ team: t.id, from: s.year, to: s.year });
    }
  }
  return out;
}

export type NumberPeriod = { n: number; from: number; to: number };

/**
 * Номер машини періодами — лише для сезонів з одним номером, від останнього сезону назад, поки номер один на сезон
 * (у 1950–1973 номер змінювався від гонки до гонки: рядок не показуємо). Не більше `max` періодів, від нових.
 */
export function numberPeriods(seasons: Pick<DriverSeasonRow, "year" | "numbers">[], max = 2): NumberPeriod[] {
  const out: NumberPeriod[] = [];
  for (const s of [...seasons].sort((a, b) => b.year - a.year)) {
    if (s.numbers.length !== 1) break;
    const n = s.numbers[0]!;
    const last = out[out.length - 1];
    if (last && last.n === n) last.from = s.year;
    else if (out.length === max) break;
    else out.push({ n, from: s.year, to: s.year });
  }
  return out;
}

/** Повних років на дату `at` (обидві — ISO «YYYY-MM-DD»). */
export function ageAt(born: string, at: string): number {
  const [by, bm, bd] = born.split("-").map(Number) as [number, number, number];
  const [ay, am, ad] = at.split("-").map(Number) as [number, number, number];
  return ay - by - (am < bm || (am === bm && ad < bd) ? 1 : 0);
}

/**
 * Прізвище для другого рядка заголовка. Українське ім'я зберігається одним рядком: прізвище — стільки останніх
 * слів, скільки слів у прізвищі з бази («de la Rosa» → 3); якщо слів менше, ніж треба, — без поділу.
 */
export function splitName(full: string, dbSurname: string): [first: string, last: string] {
  const words = full.trim().split(/\s+/);
  const k = dbSurname.trim().split(/\s+/).length;
  if (words.length <= k) return ["", full];
  return [words.slice(0, -k).join(" "), words.slice(-k).join(" ")];
}

/* ---------- сторінка ---------- */

export type TeamRef = { id: string; name: string; color: string | null };
export type MateView = { id: string; slug: string; name: string; initials: string; avatar: string | null };
export type DriverWin = { n: number; year: number; round: number; name: string; date: string; team: TeamRef; grid: number | null };
export type Milestone =
  | { kind: "debut" | "firstPole"; year: number; round: number; gp: string }
  | { kind: "firstPodium"; year: number; round: number; gp: string; position: number }
  | { kind: "firstWin"; year: number; round: number; gp: string; grid: number | null }
  | { kind: "titles"; year: number; round: number; years: number[] };

export type DriverPage = {
  id: string;
  slug: string;
  name: string;
  /** Ім'я й прізвище окремо — для заголовка в два рядки. */
  nameParts: [first: string, last: string];
  latin: string;
  initials: string;
  avatar: string | null;
  portrait: null | { src: string; srcSet: string; width: number; height: number; credit: Credit };
  /** Колір команди поточного сезону; у пілотів, що не виступають, — null (нейтральний акцент). */
  color: string | null;
  country: string | null;
  born: string | null;
  died: string | null;
  /** Вік — лише коли знаємо, що пілот живий (учасник поточного сезону або позначка в кураторських даних). */
  age: number | null;
  instagram: string | null;
  stints: (Stint & { name: string })[];
  numbers: NumberPeriod[];
  totals: {
    starts: number;
    wins: number;
    podiums: number;
    poles: number;
    /** null — дані неповні (кар'єра до 2004). */
    fastestLaps: number | null;
    points: number;
    titles: number;
    titleYears: number[];
  };
  current: null | { year: number; position: number | null; points: number; wins: number; inProgress: boolean };
  debut: { year: number; gp: string };
  last: { year: number; gp: string };
  /** Від старих до нових. */
  seasons: (Omit<DriverSeasonRow, "id" | "teams"> & { teams: (TeamRef & { races: number })[] })[];
  teammates: {
    mate: MateView;
    team: TeamRef;
    years: string;
    from: number;
    races: number;
    ahead: number;
    behind: number;
    /** null — немає даних кваліфікацій для (майже) всіх спільних гонок. */
    quali: null | { ahead: number; behind: number };
  }[];
  wins: {
    list: DriverWin[];
    byGrandPrix: { name: string; count: number }[];
    byTeam: (TeamRef & { count: number })[];
    featured: { kind: "first" | "fromGrid" | "latest"; win: DriverWin }[];
  };
  milestones: Milestone[];
  /** Автори показаних фото: портрет пілота й аватари напарників. */
  credits: { label: string; href: string; author: string; license: string }[];
  currentSeason: number;
};

function teamRef(id: string): TeamRef {
  const t = teamsById.get(id);
  if (!t) throw new Error(`Команда ${id} є в поданнях пілота, але не в curated/teams.json`);
  return { id, name: t.name, color: t.color };
}

function mateView(id: string, forename: string, surname: string, locale: Locale): MateView {
  return {
    id,
    slug: driverSlug(id),
    name: driverName(id, forename, surname, locale),
    initials: curatedDrivers[id]?.initials ?? `${forename[0] ?? ""}${surname[0] ?? ""}`.toUpperCase(),
    avatar: driverPortrait(id)?.avatar ?? null,
  };
}

/** Частка спільних гонок з даними кваліфікації, від якої показуємо рядок кваліфікацій. */
const QUALI_COVERAGE = 0.9;
/** Вік понад це не показуємо: у Wikidata може не бути дати смерті маловідомого пілота. */
const MAX_AGE = 100;
/** Перемога «з далекого старту» — від цього місця на старті. */
const FROM_GRID_MIN = 5;

export async function getDriverSlugs(): Promise<string[]> {
  return [...(await loadIndex()).keys()];
}

let maxYear: number | undefined;

export async function getDriverPage(slug: string, locale: Locale, today = new Date().toISOString().slice(0, 10)): Promise<DriverPage | null> {
  const row = (await loadIndex()).get(slug);
  if (!row) return null;
  const id = row.id;
  const [totalsBy, seasonsBy, winsBy, matesBy] = await Promise.all([loadTotals(), loadSeasons(), loadWins(), loadTeammates()]);
  const totals = totalsBy.get(id)?.[0];
  if (!totals) throw new Error(`Пілот ${id} є в f1.driver_index, але не в f1.driver_totals`);
  const seasonRows = seasonsBy.get(id) ?? [];
  if (maxYear === undefined) for (const rows of seasonsBy.values()) for (const r of rows) maxYear = Math.max(maxYear ?? 0, r.year);
  const currentSeason = maxYear!;

  const name = driverName(id, row.forename, row.surname, locale);
  const curated = curatedDrivers[id];
  const nameParts: [string, string] =
    curated && name.endsWith(curated.surname[locale])
      ? [name.slice(0, -curated.surname[locale].length).trim(), curated.surname[locale]]
      : splitName(name, row.surname);
  const portraitSrc = driverPortrait(id);
  const widths = heroes[id];
  const f = facts[id] ?? {};
  const died = f.manual?.died !== undefined ? f.manual.died : (f.died ?? null);
  const instagram = f.manual?.instagram !== undefined ? f.manual.instagram : (f.instagram ?? null);
  const active = row.current_team !== null;
  const alive = !died && (active || f.alive === true);

  const seasons = seasonRows.map((s) => ({
    year: s.year,
    numbers: s.numbers,
    races: s.races,
    wins: s.wins,
    podiums: s.podiums,
    poles: s.poles,
    points: s.points,
    position: s.position,
    excluded: s.excluded,
    champion: s.champion,
    in_progress: s.in_progress,
    teams: s.teams.map((t) => ({ ...teamRef(t.id), races: t.races })),
  }));
  const cur = seasons.find((s) => s.year === currentSeason);

  const list: DriverWin[] = (winsBy.get(id) ?? []).map((w) => ({
    n: w.n,
    year: w.year,
    round: w.round,
    name: gpName(w.name, locale),
    date: w.date,
    team: teamRef(w.team),
    grid: w.grid,
  }));
  const collator = new Intl.Collator(locale === "uk" ? "uk" : "en");
  const byGp = new Map<string, number>();
  const byTeam = new Map<string, TeamRef & { count: number }>();
  for (const w of list) {
    byGp.set(w.name, (byGp.get(w.name) ?? 0) + 1);
    const e = byTeam.get(w.team.id) ?? { ...w.team, count: 0 };
    e.count++;
    byTeam.set(w.team.id, e);
  }
  const featured: DriverPage["wins"]["featured"] = [];
  if (list.length > 0) featured.push({ kind: "first", win: list[0]! });
  // «Особлива» — з найдальшого місця на старті (рівність — раніша), якщо це не перша й не остання.
  const far = [...list].filter((w) => (w.grid ?? 0) >= FROM_GRID_MIN).sort((a, b) => b.grid! - a.grid! || a.n - b.n)[0];
  if (far && far.n !== 1 && far.n !== list.length) featured.push({ kind: "fromGrid", win: far });
  if (list.length > 1) featured.push({ kind: "latest", win: list[list.length - 1]! });

  const teammates = (matesBy.get(id) ?? [])
    .map((m) => ({
      mate: mateView(m.mate, m.forename, m.surname, locale),
      team: teamRef(m.team),
      years: yearRanges(m.years),
      from: Math.min(...m.years),
      races: m.races,
      ahead: m.race_ahead,
      behind: m.race_behind,
      quali: m.quali_races >= QUALI_COVERAGE * m.races ? { ahead: m.quali_ahead, behind: m.quali_behind } : null,
    }))
    .sort((a, b) => a.from - b.from || b.races - a.races || collator.compare(a.mate.name, b.mate.name));

  const milestones: Milestone[] = [
    { kind: "debut", year: totals.debut.year, round: totals.debut.round, gp: gpName(totals.debut.name, locale) },
  ];
  // Перший подіум, що був перемогою, окремо не показуємо — це та сама гонка, що й «перша перемога» (Ферстаппен, Іспанія 2016).
  const fp = totals.first_podium;
  if (fp && !(list[0] && list[0].year === fp.year && list[0].round === fp.round))
    milestones.push({ kind: "firstPodium", year: fp.year, round: fp.round, gp: gpName(fp.name, locale), position: fp.position! });
  if (totals.first_pole)
    milestones.push({ kind: "firstPole", year: totals.first_pole.year, round: totals.first_pole.round, gp: gpName(totals.first_pole.name, locale) });
  if (list[0]) milestones.push({ kind: "firstWin", year: list[0].year, round: list[0].round, gp: list[0].name, grid: list[0].grid });
  // Титул — наприкінці свого сезону (після гонок того року).
  if (row.titles > 0) milestones.push({ kind: "titles", year: row.title_years[0]!, round: 999, years: row.title_years });
  // За часом: дебют — перший за означенням; у межах однієї гонки — поул, подіум, перемога.
  const ORDER = { debut: 0, firstPole: 1, firstPodium: 2, firstWin: 3, titles: 4 };
  milestones.sort((a, b) => a.year - b.year || a.round - b.round || ORDER[a.kind] - ORDER[b.kind]);

  const credits: DriverPage["credits"] = [];
  if (portraitSrc) credits.push({ label: `${row.forename} ${row.surname}`, href: portraitSrc.credit.page, ...pick(portraitSrc.credit) });
  const seen = new Set([id]);
  for (const m of matesBy.get(id) ?? []) {
    const p = driverPortrait(m.mate);
    if (!p || seen.has(m.mate)) continue;
    seen.add(m.mate);
    credits.push({ label: `${m.forename} ${m.surname}`, href: p.credit.page, ...pick(p.credit) });
  }

  return {
    id,
    slug,
    name,
    nameParts,
    latin: `${row.forename} ${row.surname}`,
    initials: curated?.initials ?? `${row.forename[0] ?? ""}${row.surname[0] ?? ""}`.toUpperCase(),
    avatar: portraitSrc?.avatar ?? null,
    portrait:
      portraitSrc && widths?.length
        ? {
            src: `/img/drivers/${id}-420.webp`,
            srcSet: widths.map((w, i) => `/img/drivers/${id}-${i === 0 ? 420 : 640}.webp ${w}w`).join(", "),
            width: widths[0]!,
            height: Math.floor((widths[0]! * 5) / 4),
            credit: portraitSrc.credit,
          }
        : null,
    color: row.current_team ? (teamsById.get(row.current_team)?.color ?? null) : null,
    country: countryName(row.country_code, locale),
    born: totals.date_of_birth,
    died,
    age: alive && totals.date_of_birth && ageAt(totals.date_of_birth, today) <= MAX_AGE ? ageAt(totals.date_of_birth, today) : null,
    instagram,
    stints: teamStints(seasonRows).map((s) => ({ ...s, name: teamRef(s.team).name })),
    numbers: numberPeriods(seasonRows),
    totals: {
      starts: row.starts,
      wins: row.wins,
      podiums: row.podiums,
      poles: row.poles,
      fastestLaps: totals.fastest_laps_known ? totals.fastest_laps : null,
      points: totals.points,
      titles: row.titles,
      titleYears: row.title_years,
    },
    current:
      active && cur
        ? { year: currentSeason, position: row.current_position, points: row.current_points ?? 0, wins: cur.wins, inProgress: cur.in_progress }
        : null,
    debut: { year: totals.debut.year, gp: gpName(totals.debut.name, locale) },
    last: { year: totals.last_race.year, gp: gpName(totals.last_race.name, locale) },
    seasons,
    teammates,
    wins: {
      list,
      byGrandPrix: [...byGp.entries()]
        .map(([n, count]) => ({ name: n, count }))
        .sort((a, b) => b.count - a.count || collator.compare(a.name, b.name)),
      byTeam: [...byTeam.values()],
      featured,
    },
    milestones,
    credits,
    currentSeason,
  };
}

function pick(c: Credit): { author: string; license: string } {
  return { author: c.author, license: c.license };
}
