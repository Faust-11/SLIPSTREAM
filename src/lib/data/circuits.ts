// Траси (фаза 3h, docs/plans/2026-11-13-phase3h-circuits.md): список /circuits і картка /circuits/<slug>.
// Траса — f1.circuit_index (0013); етапи, переможці, поули — f1.season_rounds (0011); протокол гонки (старт переможця,
// подіум, найшвидше коло) — f1.race_page (0012, лише колонка race); вирішальний етап — season-math (через race-page.ts).
// Кураторські: місце — circuits.json, схема — circuit-layouts.json, факти — circuit-facts.json (enwiki з revid). Лише на сервері.
import "server-only";
import circuitsJson from "@/data/curated/circuits.json";
import factsJson from "@/data/curated/circuit-facts.json";
import layoutsJson from "@/data/curated/circuit-layouts.json";
import type { Locale } from "@/i18n/config";
import { circuitSlug, inSpans, leaders, modeOf, ranking, rankingWithTies, spansLabel, yearSpans } from "@/lib/circuit-math";
import { DEFAULT_CIRCUITS_QUERY, selectCircuits } from "@/lib/circuits-list";
import { countryAlpha2, countryName } from "@/lib/countries";
import { normalizeSearch } from "@/lib/teams-list";
import { driverPortrait } from "./drivers";
import { dbSelectAll } from "./db";
import { once } from "./once";
import { playedRounds, seasonDecision, titleStandings } from "./race-page";
import { loadNames, loadPoints, loadRounds, loadRules, makeDriver, placeName, poleCars, teamRef, type SeasonDriver, type SeasonTeamRef } from "./season-page";
import { loadSeasonIndex } from "./seasons";
import { gpName } from "./team-page";
import type { Credit, L10n, RaceResultJson, SeasonRoundRow } from "./types";

type CircuitIndexRow = { ref: string; name: string; locality: string | null; country: string | null; country_code: string | null; lat: number | null; lng: number | null };
// hero.credit — якщо банер замінили окремо (адмінка, фаза 7b); інакше — credit місця.
type CuratedPlace = L10n & { short?: L10n; wiki?: string; hero?: { src: string; srcSet: string; width: number; height: number; focusY?: number; credit?: Credit }; credit?: Credit };
export type CircuitLayout = {
  d: string;
  w: number;
  h: number;
  /** Схема для сторінки траси: детальніша й повернута на rot° під горизонтальну рамку (фаза 3j). */
  page: { d: string; w: number; h: number; rot: number };
  source: "f1-circuits" | "commons";
  credit?: Credit;
};
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
  new Map((await dbSelectAll<CircuitIndexRow>("circuit_index", "select=ref,name,locality,country,country_code,lat,lng&order=ref")).map((r) => [r.ref, r])),
);
/** Координати траси (для прогнозу погоди); без них у базі — null. */
export async function getCircuitCoords(ref: string): Promise<{ lat: number; lng: number } | null> {
  const c = (await loadCircuits()).get(ref);
  return c && c.lat !== null && c.lng !== null ? { lat: c.lat, lng: c.lng } : null;
}
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

/**
 * Вирішальні етапи заліку пілотів усіх сезонів (season-math) — від траси й мови не залежать: один раз на процес,
 * а не на кожну з 156 сторінок (code-review 13.11).
 */
const loadDeciders = once(async () => {
  const [roundsBy, pointsBy, rules, index] = await Promise.all([loadRounds(), loadPoints(), loadRules(), loadSeasonIndex()]);
  const ctx = { roundsBy, pointsBy, rules, index };
  const out = new Map<number, { round: number; driver: string }>();
  for (const s of index) {
    const d = seasonDecision(s.year, ctx).decision;
    if (d) out.set(s.year, d);
  }
  return out;
});

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
  /** Найбільше перемог: до двох пілотів — з іменами (як у макеті), більше — лише кількість пілотів. */
  topWinners: null | { drivers: SeasonDriver[]; count: number; wins: number };
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

const indexBy = new Map<Locale, Promise<CircuitsIndex>>();
/** Метадані й сторінка беруть той самий результат (code-review 13.11: рахувалось двічі на мову). */
export function getCircuitsIndex(locale: Locale): Promise<CircuitsIndex> {
  let p = indexBy.get(locale);
  if (!p) {
    p = buildCircuitsIndex(locale);
    p.catch(() => indexBy.delete(locale));
    indexBy.set(locale, p);
  }
  return p;
}

async function buildCircuitsIndex(locale: Locale): Promise<CircuitsIndex> {
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
    const place = placeName(ref, row.locality, locale);
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
      topWinners: top ? { drivers: top.ids.length <= 2 ? top.ids.map((id) => makeDriver(id, names, locale)) : [], count: top.ids.length, wins: top.n } : null,
      layout: !!l,
      search: normalizeSearch(
        [row.name, row.locality ?? "", places[ref]?.en ?? "", places[ref]?.uk ?? "", countryName(row.country_code, "en") ?? "", countryName(row.country_code, "uk") ?? "", row.country_code ?? ""].join(" "),
      ),
    });
  }
  // Той самий порядок, що бачить користувач (список, <noscript>, JSON-LD ItemList) — code-review 13.11.
  const ordered = selectCircuits(cards, DEFAULT_CIRCUITS_QUERY, locale);
  return {
    cards: ordered,
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
  /** Коротка назва траси для заголовка («Яс-Марина»; circuits.json → short, scripts/curated/circuit_short_names.py). */
  short: string;
  place: string;
  country: string | null;
  /** Гран-прі траси: у календарі поточного сезону — його нинішня назва з року першої гонки під нею; інакше —
   *  найчастіша назва з роками (code-review 13.11: «Гран-прі Мексики з 1963», хоча з 2021 — Гран-прі Мехіко). */
  gp: null | { name: string; from: number; to: number; ongoing: boolean };
  /** Різних назв Гран-прі на трасі (підзаголовок таблиці — лише коли одна). */
  gpNames: number;
  onCalendar: boolean;
  /** ISO 3166-1 alpha-2 і координати — для JSON-LD. */
  geo: { country: string | null; lat: number | null; lng: number | null };
  hero: null | { src: string; srcSet: string; width: number; height: number; focus: string; credit: Credit };
  layout: null | CircuitLayout;
  next: null | { season: number; round: number; date: string | null };
  facts: null | {
    layoutName: string | null;
    /** Проміжок конфігурації, що охоплює останню гонку F1 тут (to = null — дотепер). */
    layoutYears: null | { from: number; to: number | null };
    lengthKm: number | null;
    turns: number | null;
    laps: number | null;
    distanceKm: number | null;
    opened: string | null;
    architects: string[];
    capacity: number | null;
    record: null | { ms: number; driver: SeasonDriver; year: number };
    /** Стаття Вікіпедії (довжина, повороти, рекорд…); null — картки траси немає, лише дані бази. */
    source: null | { title: string; href: string };
  };
  firstGp: number | null;
  strip: {
    races: number;
    winners: number;
    fromPole: number;
    furthest: null | { grid: number; year: number; round: number; driver: SeasonDriver };
    finales: number;
    /** З них титул вирішився саме у фіналі сезону. */
    finaleTitles: number;
    titles: number;
  };
  races: CircuitRaceRow[];
  titles: { year: number; round: number; champion: SeasonDriver; before: { driver: SeasonDriver; points: number }[]; after: { driver: SeasonDriver; points: number }[] }[];
  leaders: {
    drivers: LeaderList<{ driver: SeasonDriver; n: number }>;
    teams: LeaderList<{ team: SeasonTeamRef; n: number }>;
    podiums: LeaderList<{ driver: SeasonDriver; n: number }>;
  };
  credits: { media: CreditItem[]; portraits: CreditItem[] };
};
/** Рейтинг з нічиїми: рівні на межі не відкидаються мовчки — або всі в списку, або «і ще count по n» (рев'ю 13.11). */
export type LeaderList<T> = { rows: T[]; more: null | { count: number; n: number } };

export async function getCircuitRefs(): Promise<string[]> {
  return [...(await loadCircuits()).keys()];
}

export async function circuitBySlug(slug: string): Promise<string | null> {
  for (const ref of (await loadCircuits()).keys()) if (circuitSlug(ref) === slug) return ref;
  return null;
}

/** Скільки перших місць у рейтингах «найуспішніші тут»; рівні на межі — до LEADERS_CAP рядків. */
export const LEADERS_TOP = 7;
export const LEADERS_CAP = 10;

export async function getCircuitPage(ref: string, locale: Locale): Promise<CircuitPage | null> {
  const [circuits, roundsBy, pointsBy, names, index, raceRows, deciders] = await Promise.all([
    loadCircuits(), loadRounds(), loadPoints(), loadNames(), loadSeasonIndex(), loadRaceRows(), loadDeciders(),
  ]);
  const row = circuits.get(ref);
  if (!row) return null;
  const base = (id: string) => makeDriver(id, names, locale);
  const races = heldAt(roundsBy, ref);
  const f = facts[ref];
  const spans = f?.layout?.years.length ? f.layout.years : null;
  const lastYear = races.at(-1)?.year;
  // Проміжок, у якому остання гонка F1 (Аделаїда [[1985,1995],[2000,2000]] — 1985–1995, а не «з 2000»; рев'ю 13.11).
  const span = spans ? (spans.find(([a, b]) => lastYear !== undefined && a <= lastYear && lastYear <= (b ?? 9999)) ?? spans[0]!) : null;

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
  let finaleTitles = 0;
  for (const s of index) {
    if (s.in_progress) continue;
    const last = playedRounds(roundsBy, s.year).at(-1);
    if (last?.circuit !== ref) continue;
    finales++;
    if (deciders.get(s.year)?.round === last.round) finaleTitles++;
  }

  /* --- титули, вирішені тут --- */
  const titles: CircuitPage["titles"] = [];
  for (const r of rows.filter((x) => x.title)) {
    const d = deciders.get(r.year)!;
    const seasonRounds = playedRounds(roundsBy, r.year);
    const points = pointsBy.get(r.year) ?? [];
    const { top } = titleStandings(points, seasonRounds, r.round);
    // «Перед гонкою» — трійка заліку ДО етапу (не трійка після, відсортована за очками до; рев'ю 13.11).
    const prev = seasonRounds.filter((x) => x.round! < r.round).at(-1)?.round;
    const before = points
      .filter((x) => x.round === prev && x.standing_points !== null)
      .sort((a, b) => b.standing_points! - a.standing_points! || (a.standing ?? 999) - (b.standing ?? 999))
      .slice(0, 3);
    titles.push({
      year: r.year,
      round: r.round,
      champion: base(d.driver),
      before: before.map((x) => ({ driver: base(x.driver), points: x.standing_points! })),
      after: top.map((x) => ({ driver: base(x.driver), points: x.after })),
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
  const heroCredit = p?.hero?.credit ?? p?.credit;
  const hero = p?.hero && heroCredit ? { ...p.hero, focus: `50% ${p.hero.focusY ?? 62}%`, credit: heroCredit } : null;
  const cal = currentCalendar(roundsBy);
  const upcoming = cal.rows.filter((r) => r.circuit === ref && !r.winners?.length).sort((a, b) => a.round! - b.round!)[0];
  // Кола — мода нинішньої конфігурації; без даних про конфігурацію — остання гонка (рев'ю 14.11: Лас-Вегас без картки
  // ховав і кола, і дистанцію, хоча вони є в базі).
  const lapsOf = (r: (typeof races)[number]) => (raceRows.get(`${r.year}/${r.round}`) ?? []).find((x) => x.p === 1)?.l;
  const lapsIn = span ? races.filter((r) => inSpans(r.year, [span])) : races.slice(-1);
  const laps = modeOf(lapsIn.map(lapsOf).filter((x): x is number => x !== undefined));
  const record = f?.record ? { ms: f.record.ms, driver: base(f.record.driver), year: f.record.year } : null;
  const factsOut: CircuitPage["facts"] =
    f || laps !== null || record
      ? {
          layoutName: f?.layout?.name ?? null,
          layoutYears: span ? { from: span[0], to: span[1] } : null,
          lengthKm: f?.lengthKm ?? null,
          turns: f?.turns ?? null,
          laps,
          distanceKm: laps !== null && f?.lengthKm ? Math.round(laps * f.lengthKm * 10) / 10 : null,
          opened: f?.opened ?? null,
          architects: f?.architects ?? [],
          capacity: f?.capacity ?? null,
          record,
          source: f ? { title: f.title, href: `https://en.wikipedia.org/w/index.php?oldid=${f.revid}` } : null,
        }
      : null;

  const gpCount = new Map<string, number>();
  for (const r of races) gpCount.set(r.name, (gpCount.get(r.name) ?? 0) + 1);
  const onCalendar = cal.circuits.has(ref);
  const currentName = onCalendar ? cal.rows.find((r) => r.circuit === ref)?.name : undefined;
  let gp: CircuitPage["gp"] = null;
  if (currentName) {
    const years = races.filter((r) => r.name === currentName).map((r) => r.year);
    gp = { name: gpName(currentName, locale), from: years[0] ?? cal.season, to: years.at(-1) ?? cal.season, ongoing: true };
  } else {
    const main = ranking(gpCount, 1)[0];
    const years = main ? races.filter((r) => r.name === main.id).map((r) => r.year) : [];
    if (main) gp = { name: gpName(main.id, locale), from: years[0]!, to: years.at(-1)!, ongoing: false };
  }

  const list = <T>(counts: Map<string, number>, row: (id: string, n: number) => T): LeaderList<T> => {
    const r = rankingWithTies(counts, LEADERS_TOP, LEADERS_CAP);
    return { rows: r.rows.map(({ id, n }) => row(id, n)), more: r.more };
  };
  const leadersOut: CircuitPage["leaders"] = {
    drivers: list(winsBy, (id, n) => ({ driver: base(id), n })),
    teams: list(teamWins, (id, n) => ({ team: teamRef(id)!, n })),
    podiums: list(podiums, (id, n) => ({ driver: base(id), n })),
  };
  const placeLabel = placeName(ref, row.locality, locale);
  const media: CreditItem[] = [];
  // Підпис — місце (як на сторінці гонки), а не сирий URL Commons з %28 і розширенням (code-review 13.11).
  if (hero) media.push({ label: placeLabel, href: hero.credit.page, author: hero.credit.author, license: hero.credit.license });
  media.push(...layoutCredits([ref]));
  const shownDrivers = [
    ...rows.flatMap((r) => [...r.winners, ...r.poles.flat(), ...(r.fastest ? [r.fastest.driver] : [])]),
    ...titles.flatMap((t) => [t.champion, ...t.before.map((x) => x.driver)]),
    ...leadersOut.drivers.rows.map((x) => x.driver),
    ...leadersOut.podiums.rows.map((x) => x.driver),
  ];

  return {
    ref,
    slug: circuitSlug(ref),
    name: row.name,
    short: places[ref]?.short?.[locale] ?? placeLabel,
    place: placeLabel,
    country: countryName(row.country_code, locale),
    gp,
    gpNames: gpCount.size,
    onCalendar,
    geo: { country: countryAlpha2(row.country_code), lat: row.lat, lng: row.lng },
    hero,
    layout: layouts[ref] ?? null,
    next: upcoming ? { season: cal.season, round: upcoming.round!, date: upcoming.date } : null,
    facts: factsOut,
    firstGp: races[0]?.year ?? null,
    strip: { races: races.length, winners: winsBy.size, fromPole, furthest, finales, finaleTitles, titles: titles.length },
    races: rows.reverse(),
    titles,
    leaders: leadersOut,
    credits: { media, portraits: portraitCredits(shownDrivers) },
  };
}
