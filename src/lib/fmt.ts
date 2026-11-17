import type { Locale } from "@/i18n/config";

/**
 * Форматування дат, відносного часу, чисел і множини — БЕЗ Intl. Перший `new Intl.*` у браузері довантажує дані
 * мови (uk) і коштує 100–250 мс основного потоку під 4× CPU (замір 17.11 на проді: календар — 126 DateTimeFormat,
 * 229 мс; новини — 12, 250 мс; пілоти — 2 NumberFormat, 119 мс) — саме це валило TBT у Lighthouse CI. Таблиці й
 * формати збігаються з виводом Intl Node (uk / en-GB) — перевіряє src/lib/__tests__/fmt.test.ts; той самий код на
 * сервері й у браузері — гідратація без розбіжностей.
 */

const MONTH: Record<Locale, string[]> = {
  uk: ["січ.", "лют.", "бер.", "квіт.", "трав.", "черв.", "лип.", "серп.", "вер.", "жовт.", "лист.", "груд."],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"],
};
const WEEKDAY: Record<Locale, string[]> = {
  uk: ["нд", "пн", "вт", "ср", "чт", "пт", "сб"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

type Parts = { y: number; mo: number; d: number; wd: number; h: number; mi: number };
/** Складники дати: utc — у UTC (сервер, перший рендер), інакше — у поясі браузера (методи Date без Intl). */
function parts(date: Date, utc: boolean): Parts {
  return utc
    ? { y: date.getUTCFullYear(), mo: date.getUTCMonth(), d: date.getUTCDate(), wd: date.getUTCDay(), h: date.getUTCHours(), mi: date.getUTCMinutes() }
    : { y: date.getFullYear(), mo: date.getMonth(), d: date.getDate(), wd: date.getDay(), h: date.getHours(), mi: date.getMinutes() };
}
const pad = (n: number) => String(n).padStart(2, "0");

/** «22 лист.» / «22 Nov». */
export function fmtDay(iso: string, locale: Locale, utc: boolean): string {
  const p = parts(new Date(iso), utc);
  return `${p.d} ${MONTH[locale][p.mo]}`;
}

/** «00:30» (24 год). */
export function fmtTime(date: Date, utc: boolean): string {
  const p = parts(date, utc);
  return `${pad(p.h)}:${pad(p.mi)}`;
}

/** «пт, 20 лист. · 00:30» / «Fri 20 Nov · 00:30». */
export function fmtSession(iso: string, locale: Locale, utc: boolean): string {
  const date = new Date(iso);
  const p = parts(date, utc);
  const day = locale === "uk" ? `${WEEKDAY.uk[p.wd]}, ${p.d} ${MONTH.uk[p.mo]}` : `${WEEKDAY.en[p.wd]} ${p.d} ${MONTH.en[p.mo]}`;
  return `${day} · ${fmtTime(date, utc)}`;
}

/** Повна дата й час для підказки: «20.11.2026, 00:30» / «20/11/2026, 00:30». */
export function fmtDateTime(iso: string, locale: Locale, utc: boolean): string {
  const p = parts(new Date(iso), utc);
  const sep = locale === "uk" ? "." : "/";
  return `${pad(p.d)}${sep}${pad(p.mo + 1)}${sep}${p.y}, ${pad(p.h)}:${pad(p.mi)}`;
}

const REL = {
  uk: {
    now: "цієї хвилини",
    min: (n: number, past: boolean) => (past ? `${n} хв тому` : `через ${n} хв`),
    hour: (n: number, past: boolean) => (past ? `${n} год тому` : `через ${n} год`),
    day: (n: number, past: boolean) => (n === 1 ? (past ? "учора" : "завтра") : n === 2 ? (past ? "позавчора" : "післязавтра") : past ? `${n} дн. тому` : `через ${n} дн.`),
  },
  en: {
    now: "this minute",
    min: (n: number, past: boolean) => (past ? `${n} min ago` : `in ${n} min`),
    hour: (n: number, past: boolean) => (past ? `${n} hr ago` : `in ${n} hr`),
    day: (n: number, past: boolean) => (n === 1 ? (past ? "yesterday" : "tomorrow") : past ? `${n} days ago` : `in ${n} days`),
  },
} as const;

/** «2 год тому» / «вчора»; старше тижня — дата в поясі браузера (як Intl.RelativeTimeFormat numeric:auto, short). */
export function fmtRelative(iso: string, now: number, locale: Locale): string {
  const r = REL[locale];
  const s = Math.round((Date.parse(iso) - now) / 1000);
  const a = Math.abs(s);
  const past = s < 0;
  // Округлення зі знаком, як у вихідного коду з Intl: −90 с → −1,5 → −1 хв («1 хв тому»), а не 2.
  const n = (unit: number) => Math.abs(Math.round(s / unit));
  if (a < 60) return r.now;
  if (a < 3600) return r.min(n(60), past);
  if (a < 86400) return r.hour(n(3600), past);
  if (a < 7 * 86400) return r.day(n(86400), past);
  return fmtDay(iso, locale, false);
}

/** Розділювач груп: uk — нерозривний пробіл (як Intl), en — кома. */
const GROUP: Record<Locale, string> = { uk: "\u00a0", en: "," };
const DECIMAL: Record<Locale, string> = { uk: ",", en: "." };

/**
 * Число як Intl.NumberFormat(locale) за замовчуванням: групи по три («1 234» / «1,234»),
 * до трьох знаків після коми без хвостових нулів; fraction — рівно стільки знаків (minimum = maximum).
 */
export function fmtNumber(n: number, locale: Locale, fraction?: number): string {
  const neg = n < 0;
  // Округлення за десятковим записом (як Intl): 0,2345 → 0,235; множення на 1000 дало б 234,4999… → 0,234.
  const d = fraction ?? 3;
  const rounded = Number(`${Math.round(Number(`${Math.abs(n)}e${d}`))}e-${d}`);
  const s = fraction === undefined ? String(rounded) : rounded.toFixed(fraction);
  const [int, frac] = s.split(".");
  const group = int!.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP[locale]);
  return `${neg ? "-" : ""}${group}${frac ? DECIMAL[locale] + frac : ""}`;
}

export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

/** Категорія множини як Intl.PluralRules(locale).select(n) для uk і en (CLDR). */
export function pluralCategory(n: number, locale: Locale): PluralCategory {
  if (!Number.isInteger(n)) return "other";
  const a = Math.abs(n);
  if (locale === "en") return a === 1 ? "one" : "other";
  const m10 = a % 10;
  const m100 = a % 100;
  if (m10 === 1 && m100 !== 11) return "one";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "few";
  return "many";
}
