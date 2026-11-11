export const locales = ["en", "uk"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale = "en" satisfies Locale;

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}


/**
 * Видимий код мови в перемикачі (рішення користувача 11.11): «UA», а не «UK» — англомовний
 * відвідувач прочитав би «UK» як Велику Британію. `lang`, `hreflang` і префікс `/uk` — без змін.
 */
export const LOCALE_LABEL: Record<Locale, string> = { en: "EN", uk: "UA" };
