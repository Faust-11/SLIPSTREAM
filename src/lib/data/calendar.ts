// Календар поточного сезону (фаза 3i, docs/plans/2026-11-14-phase3i-calendar.md): етапи, переможці, поули, залік —
// зі сторінки сезону (getSeasonPage); розклад сесій усіх етапів, зокрема майбутніх, — f1.calendar_sessions (0014).
// «Наступна гонка» тут — за станом даних на збірку; клієнт уточнює за поточним часом (дані оновлюються пн/чт).
import "server-only";
import type { Locale } from "@/i18n/config";
import { circuitSlug } from "@/lib/circuit-math";
import { dbSelectAll } from "./db";
import { once } from "./once";
import { getSeasonPage, type CalendarRound, type SeasonDriver, type SeasonPage, type SeasonTeamRef } from "./season-page";

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
  /** Початок гонки (UTC, ISO) — для «наступної гонки» на клієнті. */
  raceAt: string | null;
};
export type CalendarPage = {
  season: number;
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

export async function getCalendarPage(locale: Locale): Promise<CalendarPage> {
  const season = await getCalendarSeason();
  const [page, sessions] = await Promise.all([getSeasonPage(season, locale), loadSessions()]);
  if (!page) throw new Error(`Сезон ${season}: немає сторінки сезону`);
  const live = page.calendar.filter((r): r is CalendarRound & { round: number } => !r.cancelled && r.round !== null);
  const states = roundStates(live.map((r) => r.done));
  const cards: CalendarCard[] = live.map((r, i) => {
    const ss = (sessions.get(`${season}/${r.round}`) ?? []).map((x) => ({ kind: x.k, at: x.at ?? null, real: !!x.real }));
    const teams = new Set(r.winners.map((w) => w.team?.id).filter(Boolean));
    return {
      ...r,
      state: states[i]!,
      circuitSlug: r.circuit ? circuitSlug(r.circuit) : null,
      color: teams.size === 1 ? (r.winners[0]?.team?.color ?? null) : null,
      sessions: ss,
      raceAt: ss.find((x) => x.kind === "R")?.at ?? null,
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
    inProgress: page.inProgress,
    done: cards.filter((c) => c.state === "done").length,
    total: cards.length,
    sprints: cards.filter((c) => c.sprint).length,
    champion: page.champion,
    decided: page.decided,
    cup: page.cup,
    cards,
    cancelled: page.calendar.filter((r) => r.cancelled).map((r) => ({ gp: r.gp, place: r.place, date: r.date })),
    legend: [...wins.values()].sort((a, b) => b.wins - a.wins || a.team.name.localeCompare(b.team.name)),
    drivers: page.drivers,
    teams: page.teams,
    prev: page.prev,
  };
}
