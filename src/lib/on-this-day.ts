/**
 * «Цей день у Формулі-1»: ключі днів і навігація між ними. Без залежностей від бази — чиста логіка, її перевіряють unit-тести.
 * Ключ дня — «ММ-ДД» (09-22); 29 лютого входить (народження й гонки у високосні роки).
 */

/** Кількість днів у місяці, високосний рік — для 29 лютого. */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const pad = (n: number) => String(n).padStart(2, "0");

export type DayParts = { month: number; day: number };

/** «09-22» → {month: 9, day: 22}; не існуючий день («02-30», «13-01», «9-2») → null. */
export function parseDayKey(key: string): DayParts | null {
  const m = /^(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]!) return null;
  return { month, day };
}

export const dayKey = (month: number, day: number): string => `${pad(month)}-${pad(day)}`;

/** Ключ дня з дати бази «РРРР-ММ-ДД» (або з часом); некоректна дата → null. */
export function dayKeyOfDate(date: string | null | undefined): string | null {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(date ?? "");
  return m && parseDayKey(`${m[1]}-${m[2]}`) ? `${m[1]}-${m[2]}` : null;
}

/** Усі 366 ключів за календарем. */
export function allDayKeys(): string[] {
  return DAYS_IN_MONTH.flatMap((count, i) => Array.from({ length: count }, (_, d) => dayKey(i + 1, d + 1)));
}

/** Попередній і наступний день серед `keys` (за колом року: після 12-31 — 01-01). */
export function neighbours(keys: readonly string[], key: string): { prev: string; next: string } | null {
  const i = keys.indexOf(key);
  if (i < 0 || keys.length === 0) return null;
  return { prev: keys[(i - 1 + keys.length) % keys.length]!, next: keys[(i + 1) % keys.length]! };
}

/** Вік на момент смерті за датами «РРРР-ММ-ДД»; без точних дат (лише рік збігається) — за різницею років. */
export function ageAtDeath(born: string, died: string): number | null {
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(born);
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(died);
  if (!b || !d) return null;
  let age = Number(d[1]) - Number(b[1]);
  if (Number(d[2]) < Number(b[2]) || (Number(d[2]) === Number(b[2]) && Number(d[3]) < Number(b[3]))) age -= 1;
  return age >= 0 ? age : null;
}
