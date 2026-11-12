// Логіка таблиці пілотів — чиста (без React): розбір адреси, фільтри, сортування, сторінки. Тести — __tests__/drivers-list.test.ts.
import type { DriverRow, PackedDriver } from "@/lib/data/drivers";
import { normalizeSearch } from "@/lib/teams-list";

export const DRIVER_FILTERS = ["all", "cur", "ch", "win"] as const;
export type DriverFilter = (typeof DRIVER_FILTERS)[number];
export const DRIVER_SORTS = ["n", "st", "w", "pd", "pl", "t"] as const;
export type DriverSort = (typeof DRIVER_SORTS)[number];
export const DRIVER_DECADES = [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950] as const;
export const DRIVERS_PAGE_SIZE = 25;

export type DriversQuery = {
  q: string;
  f: DriverFilter;
  /** Десятиліття (1950…2020) або 0 — усі. */
  d: number;
  /** Перша літера прізвища (A–Z) або "" — усі. */
  l: string;
  sort: DriverSort;
  /** -1 — спадання (типово для чисел), 1 — зростання. */
  dir: 1 | -1;
  /** Номер сторінки з 1. */
  p: number;
};

export const DEFAULT_DRIVERS_QUERY: DriversQuery = { q: "", f: "all", d: 0, l: "", sort: "w", dir: -1, p: 1 };

const MAX_Q = 60;

/** Адреса → стан; будь-яке сміття — значення за замовчуванням (нічого з адреси не показуємо сирим). */
export function parseDriversQuery(params: URLSearchParams): DriversQuery {
  const f = params.get("f") as DriverFilter;
  const sort = params.get("sort") as DriverSort;
  const d = Number(params.get("d"));
  const l = (params.get("l") ?? "").toUpperCase();
  const p = Number(params.get("p"));
  return {
    q: (params.get("q") ?? "").slice(0, MAX_Q),
    f: DRIVER_FILTERS.includes(f) ? f : "all",
    d: (DRIVER_DECADES as readonly number[]).includes(d) ? d : 0,
    l: /^[A-Z]$/.test(l) ? l : "",
    sort: DRIVER_SORTS.includes(sort) ? sort : "w",
    dir: params.get("dir") === "asc" ? 1 : params.get("dir") === "desc" ? -1 : sort === "n" ? 1 : -1,
    p: Number.isInteger(p) && p > 0 && p < 1000 ? p : 1,
  };
}

/** Стан → рядок адреси (лише відмінне від типового). */
export function driversQueryString(q: DriversQuery): string {
  const s = new URLSearchParams();
  if (q.q.trim()) s.set("q", q.q.trim());
  if (q.f !== "all") s.set("f", q.f);
  if (q.d) s.set("d", String(q.d));
  if (q.l) s.set("l", q.l);
  const defDir = q.sort === "n" ? 1 : -1;
  if (q.sort !== "w") s.set("sort", q.sort);
  if (q.dir !== defDir) s.set("dir", q.dir === 1 ? "asc" : "desc");
  if (q.p > 1) s.set("p", String(q.p));
  const str = s.toString();
  return str ? `?${str}` : "";
}

/** Перша літера прізвища латиницею без діакритики (Ä → A) — для алфавіту. */
export function firstLetter(surname: string): string {
  return surname.normalize("NFD").replace(/[̀-ͯ]/g, "").charAt(0).toUpperCase();
}

const KEY: Record<Exclude<DriverSort, "n">, keyof DriverRow> = { st: "starts", w: "wins", pd: "podiums", pl: "poles", t: "titles" };

export function selectDrivers(rows: DriverRow[], q: DriversQuery, locale: "uk" | "en"): DriverRow[] {
  // Без діакритики й апострофів (hakkinen → Häkkinen, «пєр» ~ «п'єр»), як у «Командах».
  const s = normalizeSearch(q.q);
  const collator = new Intl.Collator(locale);
  const out = rows.filter(
    (r) =>
      (!s || r.search.includes(s)) &&
      (q.f === "all" || (q.f === "cur" && r.current) || (q.f === "ch" && r.titles > 0) || (q.f === "win" && r.wins > 0)) &&
      (!q.d || (r.years[0] <= q.d + 9 && r.years[1] >= q.d)) &&
      (!q.l || firstLetter(r.surname) === q.l),
  );
  return out.sort((a, b) => {
    if (q.sort === "n") return q.dir * collator.compare(a.surname, b.surname) || collator.compare(a.name, b.name);
    const k = KEY[q.sort];
    // Рівність — за стартами (більше вище), далі прізвище: стабільний порядок незалежно від бази.
    return q.dir * ((a[k] as number) - (b[k] as number)) || b.starts - a.starts || collator.compare(a.surname, b.surname);
  });
}

export function paginate<T>(rows: T[], page: number, size = DRIVERS_PAGE_SIZE): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { items: rows.slice((p - 1) * size, p * size), page: p, pages };
}

/** Компактний рядок (packDriver на сервері) → DriverRow у браузері. */
export function expandDriver(p: PackedDriver): DriverRow {
  const [id, name, alt, latin, surname, avatar, cc, team, starts, wins, podiums, poles, titles, y0, y1, cur] = p;
  // Ініціали — як на сервері (drivers.ts): перша літера імені + перша літера прізвища з бази.
  return {
    id, name, alt, latin, surname,
    initials: `${latin[0] ?? ""}${surname[0] ?? ""}`.toUpperCase(),
    avatar: avatar || null,
    countryCode: cc || null, team: team || null, starts, wins, podiums, poles, titles, years: [y0, y1],
    current: cur ? { position: cur[0], points: cur[1], team: cur[2], color: cur[3], number: cur[4] } : null,
    search: normalizeSearch([name, alt, latin, cc, team].join(" ")),
  };
}
