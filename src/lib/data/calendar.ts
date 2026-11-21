// Календар поточного сезону (фаза 3i, docs/plans/2026-11-14-phase3i-calendar.md): етапи, переможці, поули, залік —
// зі сторінки сезону (getSeasonPage); розклад сесій усіх етапів, зокрема майбутніх, — f1.calendar_sessions (0014).
// «Наступна гонка» тут — за станом даних на збірку; клієнт уточнює за поточним часом (дані оновлюються пн/чт).
import "server-only";
import type { Locale } from "@/i18n/config";
import { circuitSlug } from "@/lib/circuit-math";
import { dbSelectAll } from "./db";
import { once } from "./once";
import { getSeasonPage, getUpcomingSeason, type CalendarRound, type SeasonDriver, type SeasonPage, type SeasonTeamRef } from "./season-page";

export type SessionKind = "FP1" | "FP2" | "FP3" | "SQ1" | "SR" | "Q1" | "QB" | "QA" | "R";
export type CalendarSession = { kind: SessionKind; at: string | null; real: boolean };
type SessionJson = { k: SessionKind; n?: number | null; at?: string | null; real?: boolean };

const loadSessions = once(async () => {
  const rows = await dbSelectAll<{ year: number; round: number; sessions: SessionJson[] }>("calendar_sessions", "select=year,round,sessions&order=year,round");
  return new Map(rows.map((r) => [`${r.year}/${r.round}`, r.sessions]));
});

export type RoundState = "done" | "next" | "later";
export type CalendarCard = Omit<CalendarRound, "round"> & {
  round: number;
  state: RoundState;
  circuitSlug: string | null;
  /** Колір команди переможця (смуга прогресу, верх картки); null — ще не відбувся або кілька команд. */
  color: string | null;
  sessions: CalendarSession[];
  /**
   * Початок гонки (UTC, ISO) — для «наступної гонки» на клієнті. Лише зі справжнього часу сесії; час невідомий (північ
   * дати в базі) — кінець дня гонки за UTC, щоб етап не вважався стартованим зранку (рев'ю PR #19).
   */
  raceAt: string | null;
  /** raceAt — справжній час старту (JSON-LD startDate, місцева дата картки). */
  raceTimed: boolean;
};
export type CalendarPage = {
  season: number;
  /** false — сезон без жодного результату (календар наступного року після фіналу): без заліку й легенди. */
  started: boolean;
  inProgress: boolean;
  done: number;
  total: number;
  sprints: number;
  champion: SeasonDriver | null;
  decided: boolean;
  cup: SeasonPage["cup"];
  cards: CalendarCard[];
  cancelled: { gp: string; place: string; date: string | null }[];
  /** Переможці-команди сезону (легенда смуги): у порядку кількості перемог. */
  legend: { team: SeasonTeamRef; wins: number }[];
  drivers: SeasonPage["drivers"];
  teams: SeasonPage["teams"];
  prev: SeasonPage["prev"];
};

/** Скільки пілотів у таблиці заліку календаря (рішення користувача 14.11: перша десятка + посилання на сезон). */
export const CALENDAR_DRIVERS_TOP = 10;

/** Стан етапів за даними: проведені — done, перший непроведений — next, решта — later. */
export function roundStates(done: boolean[]): RoundState[] {
  let nextGiven = false;
  return done.map((d) => {
    if (d) return "done";
    if (!nextGiven) {
      nextGiven = true;
      return "next";
    }
    return "later";
  });
}

export async function getCalendarSeason(): Promise<number> {
  const sessions = await loadSessions();
  const years = [...sessions.keys()].map((k) => Number(k.split("/")[0]));
  if (years.length === 0) throw new Error("f1.calendar_sessions порожнє — календар поточного сезону недоступний");
  return Math.max(...years);
}

/** Початок гонки етапу: справжній час сесії R; інакше — кінець дня гонки (або етапу) за UTC. */
export function raceStart(sessions: CalendarSession[], date: string | null): { at: string | null; timed: boolean } {
  const r = sessions.find((x) => x.kind === "R");
  if (r?.at && r.real) return { at: r.at, timed: true };
  const day = r?.at?.slice(0, 10) ?? date;
  return { at: day ? `${day}T23:59:59Z` : null, timed: false };
}

export async function getCalendarPage(locale: Locale): Promise<CalendarPage> {
  const season = await getCalendarSeason();
  const [page, sessions] = await Promise.all([getSeasonPage(season, locale), loadSessions()]);
  // Сезон без результатів (немає в season_index) — лише календар (рев'ю PR #19: інакше збірка /calendar падала).
  const upcoming = page ? null : await getUpcomingSeason(season, locale);
  const calendar = page?.calendar ?? upcoming?.calendar;
  if (!calendar) throw new Error(`Сезон ${season}: немає етапів у season_rounds`);
  const live = calendar.filter((r): r is CalendarRound & { round: number } => !r.cancelled && r.round !== null);
  const states = roundStates(live.map((r) => r.done));
  const cards: CalendarCard[] = live.map((r, i) => {
    const ss = (sessions.get(`${season}/${r.round}`) ?? []).map((x) => ({ kind: x.k, at: x.at ?? null, real: !!x.real }));
    const teams = new Set(r.winners.map((w) => w.team?.id).filter(Boolean));
    const start = raceStart(ss, r.date);
    return {
      ...r,
      state: states[i]!,
      circuitSlug: r.circuit ? circuitSlug(r.circuit) : null,
      color: teams.size === 1 ? (r.winners[0]?.team?.color ?? null) : null,
      sessions: ss,
      raceAt: start.at,
      raceTimed: start.timed,
    };
  });
  const wins = new Map<string, { team: SeasonTeamRef; wins: number }>();
  for (const c of cards) {
    const t = c.winners[0]?.team;
    if (!t || c.color === null) continue;
    const w = wins.get(t.id);
    if (w) w.wins++;
    else wins.set(t.id, { team: t, wins: 1 });
  }
  return {
    season,
    started: !!page,
    inProgress: page?.inProgress ?? true,
    done: cards.filter((c) => c.state === "done").length,
    total: cards.length,
    sprints: cards.filter((c) => c.sprint).length,
    champion: page?.champion ?? null,
    decided: page?.decided ?? false,
    cup: page?.cup ?? null,
    cards,
    cancelled: calendar.filter((r) => r.cancelled).map((r) => ({ gp: r.gp, place: r.place, date: r.date })),
    legend: [...wins.values()].sort((a, b) => b.wins - a.wins || a.team.name.localeCompare(b.team.name)),
    drivers: page?.drivers ?? [],
    teams: page ? page.teams : null,
    prev: page ? page.prev : (upcoming?.prev ?? null),
  };
}

/** Етап поточного календаря для погоди (/api/weather): дата, траса й розклад — навіть коли сторінки гонки ще нема. null — не цей сезон чи нема етапу. */
export async function getCalendarWeatherRound(year: number, round: number): Promise<{ date: string | null; circuit: string | null; sessions: CalendarSession[] } | null> {
  const season = await getCalendarSeason().catch(() => null);
  if (season !== year) return null;
  const card = (await getCalendarPage("en")).cards.find((c) => c.round === round);
  return card ? { date: card.date, circuit: card.circuit, sessions: card.sessions } : null;
}
