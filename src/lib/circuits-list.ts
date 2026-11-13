// Стан списку трас (/circuits, фаза 3h): пошук, фільтр, сортування — у URL (?q=&f=&sort=), як у «Командах».
// Без server-only: потрібен клієнтському списку.
import type { Locale } from "@/i18n/config";
import { exactMatch, fuzzyMatch, normalizeSearch } from "@/lib/teams-list";

/** Порядок — як у макеті «Список трас»; перше значення — за замовчуванням. */
export const CIRCUITS_FILTERS = ["all", "cal", "old"] as const;
export const CIRCUITS_SORTS = ["n", "y1", "y0", "a"] as const;
export type CircuitsFilter = (typeof CIRCUITS_FILTERS)[number];
export type CircuitsSort = (typeof CIRCUITS_SORTS)[number];
export type CircuitsQuery = { q: string; f: CircuitsFilter; sort: CircuitsSort };
export const DEFAULT_CIRCUITS_QUERY: CircuitsQuery = { q: "", f: "all", sort: "n" };

/** Поля картки, потрібні списку (без схеми й лідерів). */
export type CircuitListItem = { ref: string; name: string; search: string; onCalendar: boolean; races: number; first: number; last: number };

const MAX_Q = 100;
const pick = <T extends string>(allowed: readonly T[], v: string | null): T => (allowed.includes(v as T) ? (v as T) : allowed[0]!);

export function parseCircuitsQuery(params: URLSearchParams): CircuitsQuery {
  return {
    q: Array.from(params.get("q") ?? "").slice(0, MAX_Q).join(""),
    f: pick(CIRCUITS_FILTERS, params.get("f")),
    sort: pick(CIRCUITS_SORTS, params.get("sort")),
  };
}

/** `?q=…&f=…&sort=…` без значень за замовчуванням; стан за замовчуванням → "". */
export function circuitsQueryString(q: CircuitsQuery): string {
  const p = new URLSearchParams();
  if (q.q.trim()) p.set("q", q.q);
  if (q.f !== CIRCUITS_FILTERS[0]) p.set("f", q.f);
  if (q.sort !== CIRCUITS_SORTS[0]) p.set("sort", q.sort);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Адреса з новим станом; сторонні параметри (utm_*…) лишаються. */
export function withCircuitsQuery(search: string, q: CircuitsQuery): string {
  const params = new URLSearchParams(search);
  for (const k of ["q", "f", "sort"]) params.delete(k);
  const s = new URLSearchParams([...new URLSearchParams(circuitsQueryString(q).slice(1)), ...params]).toString();
  return s ? `?${s}` : "";
}

const KEYS: Record<Exclude<CircuitsSort, "a">, (c: CircuitListItem) => number[]> = {
  n: (c) => [-c.races, -c.last],
  y1: (c) => [-c.last, -c.races],
  y0: (c) => [c.first, -c.races],
};

/** Відфільтровані й відсортовані (новий масив). Рівні ключі → за назвою, потім ref: порядок не залежить від входу. */
export function selectCircuits<T extends CircuitListItem>(items: readonly T[], q: CircuitsQuery, locale: Locale): T[] {
  const needle = normalizeSearch(q.q);
  const filtered = items.filter((c) => q.f === "all" || (q.f === "cal" ? c.onCalendar : !c.onCalendar));
  let res = needle ? filtered.filter((c) => exactMatch(c.search, needle)) : filtered;
  // Нечіткий пошук — лише коли точних збігів немає (як у «Командах»).
  if (needle && res.length === 0) res = filtered.filter((c) => fuzzyMatch(c.search, needle));
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "en") || a.ref.localeCompare(b.ref);
  if (q.sort === "a") {
    const collator = new Intl.Collator(locale, { sensitivity: "base" });
    return [...res].sort((a, b) => collator.compare(a.name, b.name) || a.ref.localeCompare(b.ref));
  }
  const key = KEYS[q.sort];
  return [...res].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!;
    return byName(a, b);
  });
}
