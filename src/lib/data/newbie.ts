import "server-only";
import type { Locale } from "@/i18n/config";
import { getCalendarPage } from "./calendar";
import type { CreditItem } from "./circuits";
import { driverPortrait } from "./drivers";
import { getRacePage, type ResultRow } from "./race-page";
import type { SeasonDriver, SeasonTeamRef } from "./season-page";

/**
 * Дані сторінки «Новачкам» (фаза 5b): цифри — з бази поточного сезону, а не з тексту (замір 15.11: 23 етапи, 11 команд,
 * 6 спринтів); приклад нарахування очок — Гран-прі Сан-Паулу 2026 (етап 20), як у макеті.
 */
export const EXAMPLE_RACE = { year: 2026, round: 20 } as const;
export const EXAMPLE_TOP = 10;

export type NewbieExample = {
  year: number;
  round: number;
  gp: string;
  rows: ResultRow[];
  /** Команди з обома болідами в десятці (для Кубка конструкторів), за сумою. */
  cup: { team: SeasonTeamRef; parts: number[]; sum: number }[];
  /** Найбільший прорив у десятці (≥ 5 місць). */
  climb: null | { driver: SeasonDriver; grid: number; finish: number };
  /** Найшвидше коло, якщо його автор у десятці (без бонусного очка з 2025). */
  fastest: null | { driver: SeasonDriver; position: number; points: number };
};

export type NewbiePage = {
  season: number;
  teams: number;
  cars: number;
  rounds: number;
  sprints: { round: number; place: string }[];
  example: NewbieExample | null;
  credits: CreditItem[];
};

export function exampleOf(gp: string, year: number, round: number, race: ResultRow[], fastestId: string | null): NewbieExample {
  const rows = race.filter((r) => r.position !== null).slice(0, EXAMPLE_TOP);
  const byTeam = new Map<string, { team: SeasonTeamRef; parts: number[] }>();
  for (const r of rows) {
    if (!r.driver.team) continue;
    const e = byTeam.get(r.driver.team.id) ?? { team: r.driver.team, parts: [] };
    e.parts.push(r.points);
    byTeam.set(r.driver.team.id, e);
  }
  const cup = [...byTeam.values()]
    .filter((e) => e.parts.length === 2)
    .map((e) => ({ ...e, sum: e.parts[0]! + e.parts[1]! }))
    .sort((a, b) => b.sum - a.sum)
    .slice(0, 2);
  let climb: NewbieExample["climb"] = null;
  for (const r of rows) {
    if (r.grid && r.position && r.grid - r.position >= 5 && (!climb || r.grid - r.position > climb.grid - climb.finish))
      climb = { driver: r.driver, grid: r.grid, finish: r.position };
  }
  const f = fastestId ? rows.find((r) => r.driver.id === fastestId) : undefined;
  return {
    year,
    round,
    gp,
    rows,
    cup,
    climb,
    fastest: f && f.position ? { driver: f.driver, position: f.position, points: f.points } : null,
  };
}

export async function getNewbiePage(locale: Locale): Promise<NewbiePage> {
  const [cal, race] = await Promise.all([getCalendarPage(locale), getRacePage(EXAMPLE_RACE.year, EXAMPLE_RACE.round, locale)]);
  const cards = cal.cards;
  const example = race ? exampleOf(race.gp, race.year, race.round, race.race, race.strip.fastest?.driver.id ?? null) : null;
  const seen = new Set<string>();
  const credits = (example?.rows ?? []).flatMap((r) => {
    const p = r.driver.avatar && !seen.has(r.driver.id) ? driverPortrait(r.driver.id) : null;
    if (!p) return [];
    seen.add(r.driver.id);
    return [{ label: r.driver.name, href: p.credit.page, author: p.credit.author, license: p.credit.license }];
  });
  // Залік команд є з першої гонки сезону; до неї (календар наступного року) — без цифри команд.
  const teams = cal.teams?.length ?? 0;
  return {
    season: cal.season,
    teams,
    // Кожна команда виставляє два боліди (регламент); тож на старті — команд × 2.
    cars: teams * 2,
    rounds: cal.total,
    sprints: cards.filter((c) => c.sprint).map((c) => ({ round: c.round, place: c.place })),
    example,
    credits,
  };
}
