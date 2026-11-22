/**
 * Попередні результати гонки з OpenF1 (/v1/session_result + /v1/drivers) — лише для головної, поки data-sync ще не отримав
 * гонку від Jolpica (рішення 22.11). Чисті функції без мережі: вибір рядків, відрив, відповідність пілотів нашим даним.
 */

export type OpenResult = {
  position: number | null;
  driver_number: number;
  number_of_laps?: number | null;
  points?: number | null;
  dnf?: boolean;
  dns?: boolean;
  dsq?: boolean;
  /** Секунди (переможець — повний час; решта — іноді теж повний, іноді null). */
  duration?: number | number[] | null;
  /** Секунди відриву, або рядок «+1 LAP» для пілота, що відстав на коло. */
  gap_to_leader?: number | string | number[] | null;
};
export type OpenDriver = {
  driver_number: number;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name_acronym?: string | null;
  team_name?: string | null;
  team_colour?: string | null;
};

export type PrelimStatus = "finished" | "dnf" | "dns" | "dsq";
export type PrelimRow = {
  position: number | null;
  number: number;
  /** id пілота в наших даних (для посилання), якщо зіставлено; інакше null. */
  id: string | null;
  slug: string | null;
  name: string;
  team: string | null;
  /** #RRGGBB або null. */
  color: string | null;
  laps: number | null;
  points: number;
  status: PrelimStatus;
  /** Повний час гонки (лише коли відомий), мс. */
  timeMs: number | null;
  /** Відрив від переможця, мс (переможець і ті, хто відстав на кола, — null). */
  gapMs: number | null;
  /** Відстав на N кіл (gap_to_leader «+N LAP(S)»). */
  lapsDown: number | null;
};
export type PrelimResults = { year: number; round: number; sessionKey: number; updated: string; rows: PrelimRow[] };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const ms = (sec: number) => Math.round(sec * 1000);

/** Відрив: число секунд → мс; «+1 LAP» / «+2 LAPS» → відстав на кола; решта (null, масив, сміття) → нічого. */
export function parseGap(g: unknown): { gapMs: number | null; lapsDown: number | null } {
  const sec = num(g);
  if (sec !== null) return { gapMs: ms(sec), lapsDown: null };
  if (typeof g === "string") {
    const m = /^\+?\s*(\d+)\s*laps?$/i.exec(g.trim());
    if (m) return { gapMs: null, lapsDown: Number(m[1]) };
  }
  return { gapMs: null, lapsDown: null };
}

/** «VERSTAPPEN» → «Verstappen», «DE VRIES» → «De Vries»: OpenF1 іноді віддає прізвище великими літерами. */
export function nameCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Нормалізований ключ імені: без діакритики, регістру й розділових знаків. */
export const nameKey = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

export type KnownDriver = { id: string; forename: string; surname: string; code: string | null };
export type DriverMatcher = (d: OpenDriver) => KnownDriver | null;

/**
 * Відповідність пілота OpenF1 запису нашого індексу: прізвище збігається й ім'я (або його перший токен) — спільний початок
 * (OpenF1 «Andrea Kimi» проти нашого «Kimi»); якщо за іменем нікого — унікальний код (VER) серед усього індексу. Не знайшли —
 * null (пілота покажемо як є, без посилання).
 */
export function makeMatcher(known: KnownDriver[]): DriverMatcher {
  const bySurname = new Map<string, KnownDriver[]>();
  const byCode = new Map<string, KnownDriver[]>();
  for (const k of known) {
    const s = nameKey(k.surname);
    bySurname.set(s, [...(bySurname.get(s) ?? []), k]);
    if (k.code) byCode.set(k.code.toUpperCase(), [...(byCode.get(k.code.toUpperCase()) ?? []), k]);
  }
  return (d) => {
    const { first, last } = splitOpenName(d);
    const cands = bySurname.get(nameKey(last)) ?? [];
    const firsts = first.split(/\s+/).map(nameKey).filter(Boolean);
    const ok = cands.filter((c) => {
      const f = nameKey(c.forename);
      return firsts.some((x) => x.startsWith(f) || f.startsWith(x));
    });
    if (ok.length === 1) return ok[0]!;
    if (ok.length === 0 && cands.length === 1 && firsts.length === 0) return cands[0]!;
    const code = d.name_acronym ? (byCode.get(d.name_acronym.toUpperCase()) ?? []) : [];
    return ok.length === 0 && code.length === 1 ? code[0]! : null;
  };
}

/** Ім'я й прізвище з полів OpenF1 (first_name/last_name; інакше «Max VERSTAPPEN» з full_name). */
export function splitOpenName(d: OpenDriver): { first: string; last: string } {
  if (d.last_name) return { first: d.first_name ?? "", last: d.last_name };
  const parts = (d.full_name ?? "").trim().split(/\s+/);
  const upper = parts.findIndex((p) => p.length > 1 && p === p.toUpperCase());
  if (upper > 0) return { first: parts.slice(0, upper).join(" "), last: parts.slice(upper).join(" ") };
  return { first: parts.slice(0, -1).join(" "), last: parts.at(-1) ?? "" };
}

const colour = (c: string | null | undefined): string | null => (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c.toUpperCase()}` : null);

/**
 * Рядки таблиці: за позицією; без позиції — в кінець (за номером). Ім'я — наше (якщо зіставлено, локалізоване через `display`),
 * інакше з OpenF1 (першим великим регістром).
 */
export function buildRows(results: OpenResult[], drivers: OpenDriver[], match: DriverMatcher, display: (id: string) => { name: string; slug: string }): PrelimRow[] {
  const byNum = new Map(drivers.map((d) => [d.driver_number, d]));
  const rows = results.map((r): PrelimRow => {
    const d = byNum.get(r.driver_number);
    const known = d ? match(d) : null;
    const shown = known ? display(known.id) : null;
    const open = d ? splitOpenName(d) : { first: "", last: `#${r.driver_number}` };
    const status: PrelimStatus = r.dsq ? "dsq" : r.dns ? "dns" : r.dnf ? "dnf" : "finished";
    const dur = num(r.duration);
    const { gapMs, lapsDown } = parseGap(r.gap_to_leader);
    return {
      position: num(r.position),
      number: r.driver_number,
      id: known?.id ?? null,
      slug: shown?.slug ?? null,
      name: shown?.name ?? `${open.first ? `${open.first} ` : ""}${nameCase(open.last)}`.trim(),
      team: d?.team_name ?? null,
      color: colour(d?.team_colour),
      laps: num(r.number_of_laps),
      points: num(r.points) ?? 0,
      status,
      timeMs: status === "finished" && dur !== null && (r.position === 1 || gapMs === null) ? ms(dur) : null,
      gapMs: status === "finished" && r.position !== 1 ? gapMs : null,
      lapsDown: status === "finished" ? lapsDown : null,
    };
  });
  return rows.sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || a.number - b.number);
}
