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
    // За символами, а не UTF-16: не розрізати емодзі навпіл.
    q: Array.from(params.get("q") ?? "").slice(0, MAX_Q).join(""),
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

// Кирилиця → латиниця (укр. + рос. літери) для запитів «мерседес», «гамільтон»; точність не потрібна —
// результат лише порівнюється з латинськими назвами (з допуском на опечатки).
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i", й: "i",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch",
  ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", ы: "y", э: "e", ё: "e", ъ: "",
};
const CYRILLIC = /[а-яґєіїёыэъ]/;

function translit(s: string): string {
  return [...s].map((ch) => TRANSLIT[ch] ?? ch).join("");
}

/** Відстань Дамерау–Левенштейна (обмежена): вставка, видалення, заміна, перестановка сусідніх. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length]!;
}

/** Варіанти запиту: як є і транслітерований (якщо в ньому кирилиця). */
function needles(q: string): string[] {
  return CYRILLIC.test(q) ? [q, translit(q)] : [q];
}

export function exactMatch(search: string, q: string): boolean {
  return needles(q).some((n) => search.includes(n) || search.replaceAll(" ", "").includes(n.replaceAll(" ", "")));
}

/** Опечатки: слово або пара сусідніх слів (без пробілу) на відстані ≤ 1 (≤ 2 для запитів від 8 літер). */
export function fuzzyMatch(search: string, q: string): boolean {
  const tokens = search.split(/[\s-]+/).filter(Boolean);
  const candidates = [...tokens, ...tokens.slice(1).map((t, i) => tokens[i] + t)];
  return needles(q.replaceAll(" ", "")).some((n) => {
    if (n.length < 5) return false;
    const max = n.length >= 8 ? 2 : 1;
    return candidates.some((c) => editDistance(n, c, max) <= max);
  });
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
  const filtered = cards.filter(
    (c) =>
      query.f === "all" ||
      (query.f === "cur" && c.current !== null) ||
      (query.f === "ch" && c.titles > 0) ||
      (query.f === "win" && c.wins > 0),
  );
  let res = filtered;
  if (needle) {
    const indexed = filtered.map((c) => [c, normalizeSearch(c.search)] as const);
    res = indexed.filter(([, s]) => exactMatch(s, needle)).map(([c]) => c);
    // Нечіткий пошук — лише коли точних збігів немає (менше хибних результатів).
    if (res.length === 0) res = indexed.filter(([, s]) => fuzzyMatch(s, needle)).map(([c]) => c);
  }
  if (query.sort === "a") {
    const collator = new Intl.Collator(locale, { sensitivity: "base" });
    return res.sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id));
  }
  const key = KEYS[query.sort];
  // Повна рівність ключів → за назвою, потім id: порядок не залежить від порядку на вході (рев'ю).
  return res.sort((a, b) => compareTuples(key(a), key(b)) || a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id));
}
