import type { Locale } from "@/i18n/config";
import type { TeamCard } from "@/lib/data/teams";

/** Значення й порядок — як у макеті «Команди» (`teams_cards/teams.js`). Перше — за замовчуванням. */
export const TEAMS_FILTERS = ["all", "cur", "ch", "win"] as const;
export const TEAMS_SORTS = ["p", "w", "gp", "t", "y1", "y0", "a"] as const;

export type TeamsFilter = (typeof TEAMS_FILTERS)[number];
export type TeamsSort = (typeof TEAMS_SORTS)[number];
export type TeamsQuery = { q: string; f: TeamsFilter; sort: TeamsSort };

const MAX_Q = 100;

const pick = <T extends string>(allowed: readonly T[], value: string | null): T =>
  allowed.includes(value as T) ? (value as T) : allowed[0]!;

/** Стан списку з URL: невідомі значення → за замовчуванням, q — не довше 100 символів. */
export function parseTeamsQuery(params: URLSearchParams): TeamsQuery {
  return {
    q: (params.get("q") ?? "").slice(0, MAX_Q),
    f: pick(TEAMS_FILTERS, params.get("f")),
    sort: pick(TEAMS_SORTS, params.get("sort")),
  };
}

/** `?q=…&f=…&sort=…` без значень за замовчуванням; стан за замовчуванням → "". */
export function teamsQueryString(query: TeamsQuery): string {
  const p = new URLSearchParams();
  if (query.q.trim()) p.set("q", query.q);
  if (query.f !== TEAMS_FILTERS[0]) p.set("f", query.f);
  if (query.sort !== TEAMS_SORTS[0]) p.set("sort", query.sort);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Для пошуку: нижній регістр, без діакритики й апострофів, пробіли стиснуті. */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/['ʼ’`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NO_POSITION = 99;
const firstYear = (c: TeamCard) => c.seasons[0]?.[0] ?? 0;
const lastYear = (c: TeamCard) => c.seasons.at(-1)?.[1] ?? 0;

/** Ключі сортування — кортежі за зростанням (як у макеті; рівність → початковий порядок). */
const KEYS: Record<Exclude<TeamsSort, "a">, (c: TeamCard) => number[]> = {
  p: (c) => [c.current?.position ?? NO_POSITION, -c.wins, -c.grandsPrix],
  w: (c) => [-c.wins, -c.grandsPrix],
  gp: (c) => [-c.grandsPrix, -c.wins],
  t: (c) => [-c.titles, -c.wins, -c.grandsPrix],
  y1: (c) => [-lastYear(c), -c.grandsPrix],
  y0: (c) => [firstYear(c), -c.grandsPrix],
};

function compareTuples(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

/** Відфільтровані й відсортовані картки (новий масив; вхідний не змінюється). */
export function selectTeams(cards: readonly TeamCard[], query: TeamsQuery, locale: Locale): TeamCard[] {
  const needle = normalizeSearch(query.q);
  const res = cards.filter(
    (c) =>
      (query.f === "all" ||
        (query.f === "cur" && c.current !== null) ||
        (query.f === "ch" && c.titles > 0) ||
        (query.f === "win" && c.wins > 0)) &&
      (!needle || normalizeSearch(c.search).includes(needle)),
  );
  if (query.sort === "a") {
    const collator = new Intl.Collator(locale, { sensitivity: "base" });
    return res.sort((a, b) => collator.compare(a.name, b.name));
  }
  const key = KEYS[query.sort];
  return res.sort((a, b) => compareTuples(key(a), key(b)));
}
