import type { Locale } from "@/i18n/config";

/** ISO 3166-1 alpha-3 з бази → alpha-2 для Intl.DisplayNames (усі 39 кодів пілотів, замір 12.11, і 34 країни трас, 13.11; тести ловлять новий). */
const A2: Record<string, string> = {
  ARG: "AR", AUS: "AU", AUT: "AT", BEL: "BE", BRA: "BR", CAN: "CA", CHE: "CH", CHL: "CL", CHN: "CN", COL: "CO",
  CZE: "CZ", DEU: "DE", DNK: "DK", ESP: "ES", FIN: "FI", FRA: "FR", GBR: "GB", HUN: "HU", IDN: "ID", IND: "IN",
  IRL: "IE", ITA: "IT", JPN: "JP", LIE: "LI", MCO: "MC", MEX: "MX", MYS: "MY", NLD: "NL", NZL: "NZ", POL: "PL",
  PRT: "PT", RUS: "RU", SWE: "SE", THA: "TH", URY: "UY", USA: "US", VEN: "VE", ZAF: "ZA",
  // Країни трас без пілотів (фаза 3h).
  ARE: "AE", AZE: "AZ", BHR: "BH", KOR: "KR", MAR: "MA", QAT: "QA", SAU: "SA", SGP: "SG", TUR: "TR",
};
/** Країни, яких немає в ISO сьогодні, і звичні короткі назви (Intl дає «Сполучені Штати»). */
const HISTORIC: Record<string, Record<Locale, string>> = {
  ARE: { en: "UAE", uk: "ОАЕ" },
  RSR: { en: "Rhodesia", uk: "Родезія" },
  USA: { en: "United States", uk: "США" },
  ZAF: { en: "South Africa", uk: "ПАР" },
};
const names = new Map<Locale, Intl.DisplayNames>();

/** ISO 3166-1 alpha-2 (для schema.org addressCountry); невідомий код — null. */
export function countryAlpha2(code: string | null): string | null {
  return code ? (A2[code] ?? null) : null;
}

/** Назва країни мовою сторінки; невідомий код — null (рядок не показується). */
export function countryName(code: string | null, locale: Locale): string | null {
  if (!code) return null;
  if (HISTORIC[code]) return HISTORIC[code][locale];
  const a2 = A2[code];
  if (!a2) return null;
  let dn = names.get(locale);
  if (!dn) names.set(locale, (dn = new Intl.DisplayNames([locale], { type: "region" })));
  return dn.of(a2) ?? null;
}
