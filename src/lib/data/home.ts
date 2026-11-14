import "server-only";
import circuitsJson from "@/data/curated/circuits.json";
import type { Locale } from "@/i18n/config";
import { getCalendarPage, type CalendarCard, type CalendarSession } from "./calendar";
import { circuitBySlug, getCircuitPage, type CircuitLayout, type CreditItem } from "./circuits";
import { driverPortrait, loadDriverIndex } from "./drivers";
import { getNews, type Headline, type Post } from "./news";
import { getRaceKeys, getRacePage, type ResultRow } from "./race-page";
import { getSeasonPage, loadNames, makeDriver, type SeasonDriver, type SeasonPhoto, type SeasonTeamRef, type StandingRow, type TeamStandingRow } from "./season-page";
import { loadSeasonIndex } from "./seasons";
import { getTeamsIndex } from "./teams";

// Головна (фаза 4b, docs/plans/2026-11-14-phase4b-home.md): лише блоки з живими даними; усе — з наявних завантажувачів.

/** До якого місця показуємо рекорди (рівні на межі — усі): 8 — колонки однакової висоти без внутрішньої прокрутки
 *  (макет мав прокрутку до 12-го; на 10-му Кубки дають 6 команд по одному). */
export const RECORD_RANK_MAX = 8;
/** Перша десятка останньої гонки (макет). */
export const RESULTS_TOP = 10;
/** Новин у кожній вкладці блока «Новини». */
export const HOME_NEWS = 10;
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

export type HomeRail = { round: number; place: string; date: string | null; state: CalendarCard["state"] };
export type HomeLast = {
  year: number;
  round: number;
  rounds: number;
  gp: string;
  place: string;
  date: string | null;
  circuit: { slug: string; name: string } | null;
  laps: number | null;
  photo: SeasonPhoto | null;
  results: ResultRow[];
  pole: SeasonDriver[] | null;
  fastest: null | { driver: SeasonDriver; ms: number };
  /** Найбільший прорив у першій десятці (місць відіграно ≥ 3). */
  climb: null | { driver: SeasonDriver; grid: number; finish: number };
  decider: boolean;
};
export type HomeNext = {
  round: number;
  rounds: number;
  gp: string;
  place: string;
  date: string | null;
  raceAt: string | null;
  raceTimed: boolean;
  sessions: CalendarSession[];
  circuit: null | {
    slug: string;
    name: string;
    layout: CircuitLayout["page"] | null;
    lengthKm: number | null;
    turns: number | null;
    laps: number | null;
    photo: null | { src: string; srcSet: string; width: number; height: number; focus: string };
    winners: { year: number; round: number; drivers: SeasonDriver[] }[];
  };
};
export type HomePage = {
  season: number;
  done: number;
  total: number;
  inProgress: boolean;
  stats: { seasons: number; drivers: number; circuits: number; first: number };
  champion: null | {
    decided: boolean;
    driver: SeasonDriver;
    team: SeasonTeamRef | null;
    number: number | null;
    points: number;
    wins: number;
    photo: SeasonPhoto | null;
    decider: null | { round: number; place: string; left: number };
  };
  rail: HomeRail[];
  last: HomeLast | null;
  next: HomeNext | null;
  standings: { afterRound: number; drivers: StandingRow[]; teams: TeamStandingRow[] | null };
  records: {
    wins: RecordList<SeasonDriver>;
    titles: RecordList<SeasonDriver>;
    cups: RecordList<{ id: string; name: string }>;
  };
  news: { headlines: Headline[]; posts: Post[] };
  credits: { photos: CreditItem[]; portraits: CreditItem[] };
};

export async function getHomePage(locale: Locale): Promise<HomePage> {
  const [calendar, keys, seasons, driverIdx, names, teams, news] = await Promise.all([
    getCalendarPage(locale),
    getRaceKeys(),
    loadSeasonIndex(),
    loadDriverIndex(),
    loadNames(),
    getTeamsIndex(locale),
    getNews(),
  ]);
  const season = calendar.season;
  const seasonPage = calendar.started ? await getSeasonPage(season, locale) : null;
  const drv = (id: string) => makeDriver(id, names, locale);

  // Чемпіон (титул вирішено) або лідер заліку — з фото претендента сторінки сезону.
  let champion: HomePage["champion"] = null;
  const lead = seasonPage?.contenders[0];
  if (seasonPage && lead) {
    const d = seasonPage.facts.decider;
    champion = {
      decided: seasonPage.decided,
      driver: lead.driver,
      team: lead.team,
      number: lead.number,
      points: lead.points,
      wins: lead.wins,
      photo: lead.photo,
      decider: seasonPage.decided && d ? { round: d.round, place: d.place, left: seasonPage.rounds - d.round } : null,
    };
  }

  const key = latestKey(keys);
  const race = key ? await getRacePage(key.year, key.round, locale) : null;
  let last: HomeLast | null = null;
  if (race) {
    const ref = race.circuit;
    const slugCard = calendar.cards.find((c) => c.round === race.round && race.year === season);
    const top = race.race.filter((r) => r.position !== null).slice(0, RESULTS_TOP);
    const climbs = top.filter((r) => r.grid && r.position && r.grid - r.position >= 3).sort((a, b) => b.grid! - b.position! - (a.grid! - a.position!));
    const winner = race.race.find((r) => r.position === 1);
    last = {
      year: race.year,
      round: race.round,
      rounds: race.rounds,
      gp: race.gp,
      place: race.place,
      date: race.date,
      circuit: ref && slugCard?.circuitSlug ? { slug: slugCard.circuitSlug, name: race.place } : null,
      laps: winner?.laps ?? null,
      photo: race.hero.photo,
      results: top,
      pole: race.strip.poles[0] ?? null,
      fastest: race.strip.fastest,
      climb: climbs[0] ? { driver: climbs[0].driver, grid: climbs[0].grid!, finish: climbs[0].position! } : null,
      decider: race.decider,
    };
  }

  const nextCard = calendar.cards.find((c) => c.state === "next") ?? null;
  let next: HomeNext | null = null;
  let nextCircuit: Awaited<ReturnType<typeof getCircuitPage>> = null;
  if (nextCard) {
    const ref = nextCard.circuitSlug ? await circuitBySlug(nextCard.circuitSlug) : null;
    nextCircuit = ref ? await getCircuitPage(ref, locale) : null;
    const cp = nextCircuit;
    next = {
      round: nextCard.round,
      rounds: calendar.total,
      gp: nextCard.gp,
      place: nextCard.place,
      date: nextCard.date,
      raceAt: nextCard.raceAt,
      raceTimed: nextCard.raceTimed,
      sessions: nextCard.sessions,
      circuit: cp
        ? {
            slug: cp.slug,
            name: cp.short,
            layout: cp.layout?.page ?? null,
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

  const asDrivers = (l: RecordList<string>): RecordList<SeasonDriver> => ({
    top: l.top.map((r) => ({ ...r, who: drv(r.who) })),
    rest: l.rest.map((r) => ({ ...r, who: drv(r.who) })),
  });
  const records: HomePage["records"] = {
    wins: asDrivers(rankRecords(driverIdx.map((r) => ({ who: r.id, n: r.wins })))),
    titles: asDrivers(rankRecords(driverIdx.map((r) => ({ who: r.id, n: r.titles })))),
    cups: rankRecords(teams.map((t) => ({ who: { id: t.id, name: t.name }, n: t.titles }))),
  };

  // Атрибуція — лише внизу сторінки (правило сайту): фото гонки, траси, чемпіона й портрети в рекордах/заліку.
  const photos: CreditItem[] = [];
  const pushPhoto = (label: string, c: { page: string; author: string; license: string } | undefined | null) => {
    if (c && !photos.some((p) => p.href === c.page)) photos.push({ label, href: c.page, author: c.author, license: c.license });
  };
  if (champion?.photo) pushPhoto(champion.driver.name, champion.photo.credit);
  if (last?.photo) pushPhoto(last.photo.label || last.gp, last.photo.credit);
  if (nextCircuit?.hero) pushPhoto(nextCircuit.short, nextCircuit.hero.credit);
  const shown = [
    ...(last?.results.map((r) => r.driver) ?? []),
    ...calendar.drivers.map((r) => r.driver),
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
    inProgress: calendar.inProgress,
    stats: {
      seasons: seasons.length,
      drivers: driverIdx.length,
      circuits: Object.keys(places).length,
      first: Math.min(...seasons.map((s) => s.year)),
    },
    champion,
    rail: calendar.cards.map((c) => ({ round: c.round, place: c.place, date: c.date, state: c.state })),
    last,
    next,
    standings: { afterRound: calendar.done, drivers: calendar.drivers, teams: calendar.teams },
    records,
    news: { headlines: news.headlines.slice(0, HOME_NEWS), posts: news.posts.slice(0, HOME_NEWS) },
    credits: { photos, portraits },
  };
}
