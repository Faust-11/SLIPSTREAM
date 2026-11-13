// Траси (фаза 3h, docs/plans/2026-11-13-phase3h-circuits.md): список /circuits і картка /circuits/<slug>.
// Траса — f1.circuit_index (0013); етапи, переможці, поули — f1.season_rounds (0011); протокол гонки (старт переможця,
// подіум, найшвидше коло) — f1.race_page (0012, лише колонка race); вирішальний етап — season-math (через race-page.ts).
// Кураторські: місце — circuits.json, схема — circuit-layouts.json, факти — circuit-facts.json (enwiki з revid). Лише на сервері.
import "server-only";
import circuitsJson from "@/data/curated/circuits.json";
import factsJson from "@/data/curated/circuit-facts.json";
import layoutsJson from "@/data/curated/circuit-layouts.json";
import type { Locale } from "@/i18n/config";
import { circuitSlug, inSpans, leaders, modeOf, ranking, spansLabel, yearSpans } from "@/lib/circuit-math";
import { countryName } from "@/lib/countries";
import { normalizeSearch } from "@/lib/teams-list";
import { driverPortrait } from "./drivers";
import { dbSelectAll } from "./db";
import { once } from "./once";
import { playedRounds, seasonDecision, titleStandings } from "./race-page";
import { loadNames, loadPoints, loadRounds, loadRules, makeDriver, poleCars, teamRef, type SeasonDriver, type SeasonTeamRef } from "./season-page";
import { loadSeasonIndex } from "./seasons";
import { gpName } from "./team-page";
import type { Credit, L10n, RaceResultJson, SeasonRoundRow } from "./types";

type CircuitIndexRow = { ref: string; name: string; locality: string | null; country: string | null; country_code: string | null };
type CuratedPlace = L10n & { wiki?: string; hero?: { src: string; srcSet: string; width: number; height: number; focusY?: number }; credit?: Credit };
export type CircuitLayout = { d: string; w: number; h: number; source: "f1-circuits" | "commons"; credit?: Credit };
type CircuitFacts = {
  title: string;
  revid: number;
  layout?: { name: string; years: [number, number | null][] };
  lengthKm?: number;
  turns?: number;
  opened?: string;
  architects?: string[];
  capacity?: number;
  record?: { ms: number; driver: string; year: number };
};

const places = (circuitsJson as unknown as { places: Record<string, CuratedPlace> }).places;
const layouts = (layoutsJson as unknown as { layouts: Record<string, CircuitLayout> }).layouts;
const facts = (factsJson as unknown as { facts: Record<string, CircuitFacts> }).facts;

/** Найшвидше коло в Jolpica повне лише з 2004 (рішення 3d): раніше — «—». */
export const FASTEST_LAP_FROM = 2004;

const loadCircuits = once(async () =>
  new Map((await dbSelectAll<CircuitIndexRow>("circuit_index", "select=ref,name,locality,country,country_code&order=ref")).map((r) => [r.ref, r])),
);
/** Протоколи гонок без кіл і піт-стопів (на сторінці траси — лише переможець, подіум, найшвидше коло). */
const loadRaceRows = once(async () => {
  const rows = await dbSelectAll<{ year: number; round: number; race: RaceResultJson[] }>("race_page", "select=year,round,race&order=year,round");
  return new Map(rows.map((r) => [`${r.year}/${r.round}`, r.race]));
});

/** Проведені гонки траси (з переможцем), за роком і етапом. */
function heldAt(roundsBy: Map<number, SeasonRoundRow[]>, ref?: string): SeasonRoundRow[] {
  const out: SeasonRoundRow[] = [];
  for (const rows of roundsBy.values()) for (const r of rows) if (!r.cancelled && r.round !== null && r.winners?.length && (!ref || r.circuit === ref)) out.push(r);
  return out.sort((a, b) => a.year - b.year || a.round! - b.round!);
}

/** Поточний сезон (у календарі є нескасований етап) і траси його календаря. */
function currentCalendar(roundsBy: Map<number, SeasonRoundRow[]>) {
  const season = Math.max(...roundsBy.keys());
  const rows = (roundsBy.get(season) ?? []).filter((r) => !r.cancelled && r.round !== null);
  return { season, circuits: new Set(rows.map((r) => r.circuit).filter((c): c is string => !!c)), rows };
}

function placeOf(ref: string, row: CircuitIndexRow | undefined, locale: Locale): string {
  return places[ref]?.[locale] ?? row?.locality ?? ref;
}

/** Перемоги пілотів (спільна машина 1950-х — кожному пілоту екіпажу), у порядку першої перемоги. */
function driverWins(races: SeasonRoundRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of races) for (const d of new Set((r.winners ?? []).map((w) => w.driver))) m.set(d, (m.get(d) ?? 0) + 1);
  return m;
}

/* ---------- список ---------- */

/** Карток на першому екрані й за кліком «Показати ще» (як у «Командах»; решта без JS — у <noscript>). */
export const CIRCUITS_PAGE_SIZE = 24;

export type CircuitCard = {
  ref: string;
  slug: string;
  name: string;
  place: string;
  country: string | null;
  onCalendar: boolean;
  races: number;
  first: number;
  last: number;
  spans: [number, number][];
  spansLabel: string;
  topWinners: null | { drivers: SeasonDriver[]; wins: number };
  /** Є схема (файл /img/circuits/layouts/<ref>.svg — маска на картці); шлях у дані списку не йде (розмір RSC, TBT). */
  layout: boolean;
  /** Нормалізований рядок пошуку (обидві мови, код країни). */
  search: string;
};
export type CircuitsIndex = {
  cards: CircuitCard[];
  facts: { circuits: number; countries: number; onCalendar: number; season: number };
  /** Перший рік календаря (для смуги сезонів на картках). */
  fromYear: number;
  credits: { layouts: CreditItem[]; portraits: CreditItem[] };
};
export type CreditItem = { label: string; href: string; author: string; license: string };

/** Автори портретів показаних пілотів (CC BY / BY-SA — автор і ліцензія внизу сторінки). */
function portraitCredits(drivers: SeasonDriver[]): CreditItem[] {
  const seen = new Set<string>();
  const out: CreditItem[] = [];
  for (const d of drivers) {
    const p = d.avatar ? driverPortrait(d.id) : null;
    if (!p || seen.has(d.id)) continue;
    seen.add(d.id);
    out.push({ label: d.name, href: p.credit.page, author: p.credit.author, license: p.credit.license });
  }
  return out;
}

export async function getCircuitsIndex(locale: Locale): Promise<CircuitsIndex> {
  const [circuits, roundsBy, names] = await Promise.all([loadCircuits(), loadRounds(), loadNames()]);
  const cal = currentCalendar(roundsBy);
  const held = heldAt(roundsBy);
  const byCircuit = new Map<string, SeasonRoundRow[]>();
  for (const r of held) {
    const list = byCircuit.get(r.circuit!);
    if (list) list.push(r);
    else byCircuit.set(r.circuit!, [r]);
  }
  const cards: CircuitCard[] = [];
  for (const [ref, row] of circuits) {
    const races = byCircuit.get(ref) ?? [];
    // Траса нового календаря без проведеної гонки (наприклад, перший етап сезону ще попереду) — без років і лідерів.
    const years = races.map((r) => r.year);
    const spans = yearSpans(years);
    const top = leaders(driverWins(races));
    const place = placeOf(ref, row, locale);
    const country = countryName(row.country_code, locale);
    const l = layouts[ref];
    cards.push({
      ref,
      slug: circuitSlug(ref),
      name: row.name,
      place,
      country,
      onCalendar: cal.circuits.has(ref),
      races: races.length,
      first: years[0] ?? cal.season,
      last: years.at(-1) ?? cal.season,
      spans,
      spansLabel: spansLabel(spans),
      topWinners: top ? { drivers: top.ids.map((id) => makeDriver(id, names, locale)), wins: top.n } : null,
      layout: !!l,
      search: normalizeSearch(
        [row.name, row.locality ?? "", places[ref]?.en ?? "", places[ref]?.uk ?? "", countryName(row.country_code, "en") ?? "", countryName(row.country_code, "uk") ?? "", row.country_code ?? ""].join(" "),
      ),
    });
  }
  cards.sort((a, b) => b.races - a.races || a.name.localeCompare(b.name));
  return {
    cards,
    facts: {
      circuits: cards.length,
      countries: new Set([...circuits.values()].map((c) => c.country_code)).size,
      onCalendar: cal.circuits.size,
      season: cal.season,
    },
    fromYear: Math.min(...[...roundsBy.keys()]),
    credits: { layouts: layoutCredits(cards.map((c) => c.ref)), portraits: portraitCredits(cards.flatMap((c) => c.topWinners?.drivers ?? [])) },
  };
}

function layoutCredits(refs: string[]): CreditItem[] {
  return refs
    .map((ref) => ({ ref, l: layouts[ref] }))
    .filter((x) => x.l?.credit)
    .map(({ ref, l }) => ({ label: l!.credit!.page.split("File:")[1]?.replace(/_/g, " ").replace(/\.svg$/i, "") ?? ref, href: l!.credit!.page, author: l!.credit!.author, license: l!.credit!.license }));
}

/* ---------- картка траси ---------- */

export type CircuitDriver = SeasonDriver & { team: SeasonTeamRef | null };
export type CircuitRaceRow = {
  year: number;
  round: number;
  gp: string;
  winners: CircuitDriver[];
  /** Старт переможця (місце на старті); null — немає в даних. */
  grid: number | null;
  /** Поул по машинах (екіпаж спільної машини — кілька пілотів). */
  poles: SeasonDriver[][];
  /** null — до 2004 (немає в даних) або не визначено. */
  fastest: null | { driver: SeasonDriver; ms: number };
  /** На цьому етапі вирішився титул пілотів. */
  title: boolean;
  /** Гонка в нинішній конфігурації (з фактів траси); null — конфігурацію не визначено. */
  current: boolean | null;
};
export type CircuitPage = {
  ref: string;
  slug: string;
  name: string;
  place: string;
  country: string | null;
  /** Головне Гран-прі траси: найчастіша назва, роки. */
  gp: null | { name: string; from: number; to: number; ongoing: boolean };
  hero: null | { src: string; srcSet: string; width: number; height: number; focus: string; credit: Credit };
  layout: null | CircuitLayout;
  next: null | { season: number; round: number; date: string | null };
  facts: null | {
    layoutName: string | null;
    layoutFrom: number | null;
    lengthKm: number | null;
    turns: number | null;
    laps: number | null;
    distanceKm: number | null;
    opened: string | null;
    architects: string[];
    capacity: number | null;
    record: null | { ms: number; driver: SeasonDriver; year: number };
    source: { title: string; href: string };
  };
  firstGp: number | null;
  strip: {
    races: number;
    winners: number;
    fromPole: number;
    furthest: null | { grid: number; year: number; round: number; driver: SeasonDriver };
    finales: number;
    titles: number;
  };
  races: CircuitRaceRow[];
  titles: { year: number; round: number; champion: SeasonDriver; before: { driver: SeasonDriver; points: number }[]; after: { driver: SeasonDriver; points: number }[] }[];
  leaders: {
    drivers: { driver: SeasonDriver; n: number }[];
    teams: { team: SeasonTeamRef; n: number }[];
    podiums: { driver: SeasonDriver; n: number }[];
  };
  credits: { media: CreditItem[]; portraits: CreditItem[] };
};

export async function getCircuitRefs(): Promise<string[]> {
  return [...(await loadCircuits()).keys()];
}

export async function circuitBySlug(slug: string): Promise<string | null> {
  for (const ref of (await loadCircuits()).keys()) if (circuitSlug(ref) === slug) return ref;
  return null;
}

/** Скільки перших місць у рейтингах «найуспішніші тут». */
export const LEADERS_TOP = 7;

export async function getCircuitPage(ref: string, locale: Locale): Promise<CircuitPage | null> {
  const [circuits, roundsBy, pointsBy, rules, names, index, raceRows] = await Promise.all([
    loadCircuits(), loadRounds(), loadPoints(), loadRules(), loadNames(), loadSeasonIndex(), loadRaceRows(),
  ]);
  const row = circuits.get(ref);
  if (!row) return null;
  const base = (id: string) => makeDriver(id, names, locale);
  const races = heldAt(roundsBy, ref);
  const f = facts[ref];
  const spans = f?.layout?.years.length ? f.layout.years : null;

  // Вирішальні етапи всіх сезонів (season-math) — один раз на збірку сторінки.
  const ctx = { roundsBy, pointsBy, rules, index };
  const deciders = new Map<number, { round: number; driver: string }>();
  for (const s of index) {
    const d = seasonDecision(s.year, ctx).decision;
    if (d) deciders.set(s.year, d);
  }

  const rows: CircuitRaceRow[] = races.map((r) => {
    const race = raceRows.get(`${r.year}/${r.round}`) ?? [];
    const win = race.find((x) => x.p === 1);
    const fl = r.year >= FASTEST_LAP_FROM ? race.find((x) => x.fl === 1 && x.fms !== undefined) : undefined;
    return {
      year: r.year,
      round: r.round!,
      gp: gpName(r.name, locale),
      winners: (r.winners ?? []).map((w) => ({ ...base(w.driver), team: teamRef(w.team) })),
      grid: win?.g ?? null,
      poles: poleCars(r.poles ?? []).map((car) => car.map(base)),
      fastest: fl ? { driver: base(fl.d), ms: fl.fms! } : null,
      title: deciders.get(r.year)?.round === r.round,
      current: spans ? inSpans(r.year, spans) : null,
    };
  });

  /* --- смуга --- */
  const winsBy = driverWins(races);
  let fromPole = 0;
  let furthest: CircuitPage["strip"]["furthest"] = null;
  for (const r of races) {
    const winners = new Set((r.winners ?? []).map((w) => w.driver));
    if (poleCars(r.poles ?? []).some((car) => car.some((d) => winners.has(d)))) fromPole++;
    const win = (raceRows.get(`${r.year}/${r.round}`) ?? []).find((x) => x.p === 1);
    // Старт 0 / відсутній — з піт-лейну чи невідомо: не «найдальший старт».
    if (win?.g && (!furthest || win.g > furthest.grid)) furthest = { grid: win.g, year: r.year, round: r.round!, driver: base(win.d) };
  }
  let finales = 0;
  for (const s of index) {
    if (s.in_progress) continue;
    const last = playedRounds(roundsBy, s.year).at(-1);
    if (last?.circuit === ref) finales++;
  }

  /* --- титули, вирішені тут --- */
  const titles: CircuitPage["titles"] = [];
  for (const r of rows.filter((x) => x.title)) {
    const d = deciders.get(r.year)!;
    const { top } = titleStandings(pointsBy.get(r.year) ?? [], playedRounds(roundsBy, r.year), r.round);
    titles.push({
      year: r.year,
      round: r.round,
      champion: base(d.driver),
      before: [...top].sort((a, b) => b.before - a.before).map((p) => ({ driver: base(p.driver), points: p.before })),
      after: top.map((p) => ({ driver: base(p.driver), points: p.after })),
    });
  }

  /* --- найуспішніші --- */
  const teamWins = new Map<string, number>();
  const podiums = new Map<string, number>();
  for (const r of races) {
    for (const t of new Set((r.winners ?? []).map((w) => w.team))) teamWins.set(t, (teamWins.get(t) ?? 0) + 1);
    const race = raceRows.get(`${r.year}/${r.round}`) ?? [];
    for (const d of new Set(race.filter((x) => x.p !== undefined && x.p <= 3).map((x) => x.d))) podiums.set(d, (podiums.get(d) ?? 0) + 1);
  }

  /* --- банер, факти, наступна гонка --- */
  const p = places[ref];
  const hero = p?.hero && p.credit ? { ...p.hero, focus: `50% ${p.hero.focusY ?? 62}%`, credit: p.credit } : null;
  const cal = currentCalendar(roundsBy);
  const upcoming = cal.rows.filter((r) => r.circuit === ref && !r.winners?.length).sort((a, b) => a.round! - b.round!)[0];
  const lapsIn = spans ? races.filter((r) => inSpans(r.year, spans)) : [];
  const laps = modeOf(lapsIn.map((r) => (raceRows.get(`${r.year}/${r.round}`) ?? []).find((x) => x.p === 1)?.l).filter((x): x is number => x !== undefined));
  const factsOut: CircuitPage["facts"] = f
    ? {
        layoutName: f.layout?.name ?? null,
        layoutFrom: spans?.at(-1)?.[0] ?? null,
        lengthKm: f.lengthKm ?? null,
        turns: f.turns ?? null,
        laps,
        distanceKm: laps !== null && f.lengthKm ? Math.round(laps * f.lengthKm * 10) / 10 : null,
        opened: f.opened ?? null,
        architects: f.architects ?? [],
        capacity: f.capacity ?? null,
        record: f.record ? { ms: f.record.ms, driver: base(f.record.driver), year: f.record.year } : null,
        source: { title: f.title, href: `https://en.wikipedia.org/w/index.php?oldid=${f.revid}` },
      }
    : null;

  const gpCount = new Map<string, number>();
  for (const r of races) gpCount.set(r.name, (gpCount.get(r.name) ?? 0) + 1);
  const mainGp = ranking(gpCount, 1)[0];
  const gpYears = mainGp ? races.filter((r) => r.name === mainGp.id).map((r) => r.year) : [];

  const leadersOut: CircuitPage["leaders"] = {
    drivers: ranking(winsBy, LEADERS_TOP).map(({ id, n }) => ({ driver: base(id), n })),
    teams: ranking(teamWins, LEADERS_TOP).map(({ id, n }) => ({ team: teamRef(id)!, n })),
    podiums: ranking(podiums, LEADERS_TOP).map(({ id, n }) => ({ driver: base(id), n })),
  };
  const media: CreditItem[] = [];
  if (hero) media.push({ label: hero.credit.page.split("File:")[1]?.replace(/_/g, " ") ?? row.name, href: hero.credit.page, author: hero.credit.author, license: hero.credit.license });
  media.push(...layoutCredits([ref]));
  const shownDrivers = [
    ...rows.flatMap((r) => [...r.winners, ...r.poles.flat(), ...(r.fastest ? [r.fastest.driver] : [])]),
    ...titles.flatMap((t) => [t.champion, ...t.before.map((x) => x.driver)]),
    ...leadersOut.drivers.map((x) => x.driver),
    ...leadersOut.podiums.map((x) => x.driver),
  ];

  return {
    ref,
    slug: circuitSlug(ref),
    name: row.name,
    place: placeOf(ref, row, locale),
    country: countryName(row.country_code, locale),
    gp: mainGp ? { name: gpName(mainGp.id, locale), from: gpYears[0]!, to: gpYears.at(-1)!, ongoing: cal.circuits.has(ref) } : null,
    hero,
    layout: layouts[ref] ?? null,
    next: upcoming ? { season: cal.season, round: upcoming.round!, date: upcoming.date } : null,
    facts: factsOut,
    firstGp: races[0]?.year ?? null,
    strip: { races: races.length, winners: winsBy.size, fromPole, furthest, finales, titles: titles.length },
    races: rows.reverse(),
    titles,
    leaders: leadersOut,
    credits: { media, portraits: portraitCredits(shownDrivers) },
  };
}
