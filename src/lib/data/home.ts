import "server-only";
import circuitDirections from "@/data/curated/circuit-directions.json";
import circuitsJson from "@/data/curated/circuits.json";
import type { Locale } from "@/i18n/config";
import { pathClockwise } from "@/lib/circuit-math";
import { getCalendarPage, type CalendarCard } from "./calendar";
import { circuitBySlug, getCircuitPage, type CircuitLayout, type CreditItem } from "./circuits";
import { driverPortrait, loadDriverIndex } from "./drivers";
import { getRaceKeys, getRacePage, type ResultRow } from "./race-page";
import { getSeasonPage, loadNames, makeDriver, type SeasonDriver, type SeasonPhoto, type StandingRow, type TeamStandingRow } from "./season-page";
import { loadSeasonIndex } from "./seasons";
import { getTeamsIndex } from "./teams";

// Головна (фаза 4b, docs/plans/2026-11-14-phase4b-home.md): лише блоки з живими даними; усе — з наявних завантажувачів.

/** До якого місця показуємо рекорди (рівні на межі — усі). Списки прокручуються в колонках однієї висоти, як у макеті
 *  (відгук користувача 15.11: більше рекордсменів, нижній край — на рівні заліку). */
export const RECORD_RANK_MAX = 20;
/** Перша десятка останньої гонки (макет). */
export const RESULTS_TOP = 10;
/** Переможців траси наступної гонки («Тут вигравали»). */
export const PAST_WINNERS = 3;

export type RecordRow<T> = { rank: number; who: T; n: number };
export type RecordList<T> = { top: RecordRow<T>[]; rest: RecordRow<T>[] };

/**
 * Рейтинг зі спільними місцями (1, 2, 2, 4): лідери (місце 1, можуть бути кілька — Шумахер і Гамільтон по 7 титулів) і
 * решта до місця max включно — рівні на межі не відкидаються. Нулі не рахуються.
 */
export function rankRecords<T>(rows: { who: T; n: number }[], max = RECORD_RANK_MAX): RecordList<T> {
  const sorted = rows.filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
  const ranked: RecordRow<T>[] = [];
  sorted.forEach((r, i) => {
    const rank = i > 0 && sorted[i - 1]!.n === r.n ? ranked[i - 1]!.rank : i + 1;
    ranked.push({ rank, who: r.who, n: r.n });
  });
  const shown = ranked.filter((r) => r.rank <= max);
  return { top: shown.filter((r) => r.rank === 1), rest: shown.filter((r) => r.rank > 1) };
}

/** Остання гонка з результатом у базі (рік, етап) — і в міжсезоння (фінал минулого року). */
export function latestKey(keys: { year: number; round: number }[]): { year: number; round: number } | null {
  let best: { year: number; round: number } | null = null;
  for (const k of keys) if (!best || k.year > best.year || (k.year === best.year && k.round > best.round)) best = k;
  return best;
}

export type HomeRail = { round: number; place: string; date: string | null; raceAt: string | null; raceTimed: boolean; state: CalendarCard["state"] };
export type HomeLast = {
  year: number;
  round: number;
  rounds: number;
  gp: string;
  place: string;
  /** Коротка назва траси — для alt банера (circuitPhotoAlt, як на сторінці гонки). */
  short: string;
  date: string | null;
  laps: number | null;
  photo: SeasonPhoto | null;
  results: ResultRow[];
  pole: SeasonDriver[] | null;
  fastest: null | { driver: SeasonDriver; ms: number };
  /** Найбільший прорив у першій десятці (місць відіграно ≥ 3). */
  climb: null | { driver: SeasonDriver; grid: number; finish: number };
};
export type HomeNext = {
  round: number;
  rounds: number;
  gp: string;
  place: string;
  date: string | null;
  raceAt: string | null;
  raceTimed: boolean;
  circuit: null | {
    slug: string;
    name: string;
    /** Місце траси (alt банера: circuitPhotoAlt). */
    place: string;
    layout: CircuitLayout["page"] | null;
    /** Значок на схемі: рух уздовж шляху (forward) чи назустріч (reverse), щоб збігтися з напрямом гонки; null — напрям невідомий. */
    motion: "forward" | "reverse" | null;
    lengthKm: number | null;
    turns: number | null;
    laps: number | null;
    photo: null | { src: string; srcSet: string; width: number; height: number; focus: string };
    winners: { year: number; round: number; drivers: SeasonDriver[] }[];
  };
};
/** Непроведені етапи з часом старту — клієнт бере перший, що ще не стартував (як календар; дані оновлюються після фінішу). */
export type HomeUpcoming = { round: number; gp: string; raceAt: string };
export type HomePage = {
  season: number;
  done: number;
  total: number;
  /** Сезон іде / завершено / ще не стартував (календар нового року без результатів). */
  phase: "running" | "over" | "ahead";
  stats: { seasons: number; drivers: number; circuits: number; first: number };
  rail: HomeRail[];
  last: HomeLast | null;
  next: HomeNext | null;
  upcoming: HomeUpcoming[];
  /** Залік: поточного сезону, а до першої гонки нового — підсумковий минулого. */
  standings: { season: number; final: boolean; afterRound: number; drivers: StandingRow[]; teams: TeamStandingRow[] | null };
  records: {
    wins: RecordList<SeasonDriver>;
    titles: RecordList<SeasonDriver>;
    cups: RecordList<{ id: string; name: string }>;
  };
  credits: { photos: CreditItem[]; portraits: CreditItem[] };
};

const DIRS = circuitDirections as { ccw: string[]; cw: string[] };
/** Напрям гонки (circuit-directions.json, джерело — користувач 15.11) проти обходу шляху схеми → як рухати значок. */
export function layoutMotion(ref: string, d: string | null): "forward" | "reverse" | null {
  const want = DIRS.cw.includes(ref) ? true : DIRS.ccw.includes(ref) ? false : null;
  const cw = d ? pathClockwise(d) : null;
  if (want === null || cw === null) return null;
  return cw === want ? "forward" : "reverse";
}

async function nextCircuitPage(card: CalendarCard | null, locale: Locale) {
  const ref = card?.circuitSlug ? await circuitBySlug(card.circuitSlug) : null;
  return ref ? getCircuitPage(ref, locale) : null;
}

/**
 * Дані головної. Сторінка статична (збирається з кожним деплоєм після data-sync) — база під час ISR не читається
 * (рішення користувача 14.11: інакше посилання на щойно опубліковану гонку дають 404, поки йде деплой); новини —
 * окремо, клієнтом з /api/news.
 */
export async function getHomePage(locale: Locale): Promise<HomePage> {
  const [calendar, keys, seasons, driverIdx, names, teams] = await Promise.all([
    getCalendarPage(locale),
    getRaceKeys(),
    loadSeasonIndex(),
    loadDriverIndex(),
    loadNames(),
    getTeamsIndex(locale),
  ]);
  const season = calendar.season;
  // Календар нового року вже є, а гонок ще не було: чемпіон і залік — минулого сезону (рев'ю PR #25).
  const statSeason = calendar.started ? season : season - 1;
  const key = latestKey(keys);
  const nextCard = calendar.cards.find((c) => c.state === "next") ?? null;
  const [seasonPage, race, nextCircuit] = await Promise.all([
    getSeasonPage(statSeason, locale),
    key ? getRacePage(key.year, key.round, locale) : null,
    nextCircuitPage(nextCard, locale),
  ]);
  const drv = (id: string) => makeDriver(id, names, locale);

  let last: HomeLast | null = null;
  if (race) {
    const top = race.race.filter((r) => r.position !== null).slice(0, RESULTS_TOP);
    const climbs = top.filter((r) => r.grid && r.position && r.grid - r.position >= 3).sort((a, b) => b.grid! - b.position! - (a.grid! - a.position!));
    const winner = race.race.find((r) => r.position === 1);
    last = {
      year: race.year,
      round: race.round,
      rounds: race.rounds,
      gp: race.gp,
      place: race.place,
      short: race.short,
      date: race.date,
      laps: winner?.laps ?? null,
      photo: race.hero.photo,
      results: top,
      pole: race.strip.poles[0] ?? null,
      fastest: race.strip.fastest,
      climb: climbs[0] ? { driver: climbs[0].driver, grid: climbs[0].grid!, finish: climbs[0].position! } : null,
    };
  }

  let next: HomeNext | null = null;
  if (nextCard) {
    const cp = nextCircuit;
    next = {
      round: nextCard.round,
      rounds: calendar.total,
      gp: nextCard.gp,
      place: nextCard.place,
      date: nextCard.date,
      raceAt: nextCard.raceAt,
      raceTimed: nextCard.raceTimed,
      circuit: cp
        ? {
            slug: cp.slug,
            name: cp.short,
            place: cp.place,
            layout: cp.layout?.page ?? null,
            motion: layoutMotion(cp.ref, cp.layout?.page.d ?? null),
            lengthKm: cp.facts?.lengthKm ?? null,
            turns: cp.facts?.turns ?? null,
            laps: cp.facts?.laps ?? null,
            photo: cp.hero ? { src: cp.hero.src, srcSet: cp.hero.srcSet, width: cp.hero.width, height: cp.hero.height, focus: cp.hero.focus } : null,
            winners: cp.races
              .slice()
              .sort((a, b) => b.year - a.year)
              .slice(0, PAST_WINNERS)
              .sort((a, b) => a.year - b.year)
              .map((r) => ({ year: r.year, round: r.round, drivers: r.winners })),
          }
        : null,
    };
  }

  const standings: HomePage["standings"] = {
    season: statSeason,
    final: !(seasonPage?.inProgress ?? false),
    afterRound: calendar.started ? calendar.done : (seasonPage?.rounds ?? 0),
    drivers: seasonPage?.drivers ?? [],
    teams: seasonPage?.teams ?? null,
  };

  const asDrivers = (l: RecordList<string>): RecordList<SeasonDriver> => ({
    top: l.top.map((r) => ({ ...r, who: drv(r.who) })),
    rest: l.rest.map((r) => ({ ...r, who: drv(r.who) })),
  });
  const records: HomePage["records"] = {
    wins: asDrivers(rankRecords(driverIdx.map((r) => ({ who: r.id, n: r.wins })))),
    titles: asDrivers(rankRecords(driverIdx.map((r) => ({ who: r.id, n: r.titles })))),
    cups: rankRecords(teams.map((t) => ({ who: { id: t.id, name: t.name }, n: t.titles }))),
  };

  // Атрибуція — лише внизу сторінки (правило сайту): фото гонки, траси й портрети лише тих, кого видно.
  const photos: CreditItem[] = [];
  const pushPhoto = (label: string, c: { page: string; author: string; license: string } | undefined | null) => {
    if (c && !photos.some((p) => p.href === c.page)) photos.push({ label, href: c.page, author: c.author, license: c.license });
  };
  if (last?.photo) pushPhoto(last.photo.label || last.gp, last.photo.credit);
  if (nextCircuit?.hero) pushPhoto(nextCircuit.short, nextCircuit.hero.credit);
  const shown = [
    ...(last?.results.map((r) => r.driver) ?? []),
    ...standings.drivers.map((r) => r.driver),
    ...[...records.wins.top, ...records.wins.rest, ...records.titles.top, ...records.titles.rest].map((r) => r.who),
  ];
  const seen = new Set<string>();
  const portraits = shown.flatMap((d) => {
    const p = d.avatar && !seen.has(d.id) ? driverPortrait(d.id) : null;
    if (!p) return [];
    seen.add(d.id);
    return [{ label: d.name, href: p.credit.page, author: p.credit.author, license: p.credit.license }];
  });

  const places = (circuitsJson as unknown as { places: Record<string, unknown> }).places;
  return {
    season,
    done: calendar.done,
    total: calendar.total,
    phase: !calendar.started ? "ahead" : calendar.inProgress ? "running" : "over",
    stats: {
      seasons: seasons.length,
      drivers: driverIdx.length,
      circuits: Object.keys(places).length,
      first: Math.min(...seasons.map((s) => s.year)),
    },
    rail: calendar.cards.map((c) => ({ round: c.round, place: c.place, date: c.date, raceAt: c.raceAt, raceTimed: c.raceTimed, state: c.state })),
    last,
    next,
    upcoming: calendar.cards.filter((c) => c.state !== "done" && c.raceAt).map((c) => ({ round: c.round, gp: c.gp, raceAt: c.raceAt! })),
    standings,
    records,
    credits: { photos, portraits },
  };
}
