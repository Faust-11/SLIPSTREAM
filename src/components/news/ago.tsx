"use client";

import { useNow } from "@/components/calendar/clock";
import type { Locale } from "@/i18n/config";

const tagOf = (l: Locale) => (l === "uk" ? "uk" : "en-GB");
const rtf = new Map<Locale, Intl.RelativeTimeFormat>();

/**
 * «14.11 15:02 UTC» — сервер, перший рендер і без JS. Без Intl: скорочення місяців у ICU Node і браузера можуть
 * різнитися (Firefox/Safari) — це була б розбіжність гідратації (рев'ю PR #20). Коротко — вміщається у вузьку клітинку
 * «Оновлено» на 320 px без переносу (інакше після гідратації рядок скорочувався б — CLS).
 */
function absolute(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)} ${iso.slice(11, 16)} UTC`;
}

/** «2 год тому» / «вчора»; старше тижня — дата. */
export function relative(iso: string, now: number, locale: Locale): string {
  let f = rtf.get(locale);
  if (!f) rtf.set(locale, (f = new Intl.RelativeTimeFormat(tagOf(locale), { numeric: "auto", style: "short" })));
  const s = Math.round((Date.parse(iso) - now) / 1000);
  const a = Math.abs(s);
  if (a < 60) return f.format(0, "minute");
  if (a < 3600) return f.format(Math.round(s / 60), "minute");
  if (a < 86400) return f.format(Math.round(s / 3600), "hour");
  if (a < 7 * 86400) return f.format(Math.round(s / 86400), "day");
  return new Intl.DateTimeFormat(tagOf(locale), { day: "numeric", month: "short" }).format(new Date(iso));
}

/**
 * Час запису: сервер і без JS — дата UTC; після гідратації — відносний («2 год тому»), повна дата в підказці. Рядок
 * стоїть у короткому рядку мітаданих поруч із джерелом — зміна довжини не переносить рядок (CLS — e2e).
 */
export function Ago({ iso, locale }: { iso: string; locale: Locale }) {
  const now = useNow();
  return (
    <time dateTime={iso} className="nw-time" title={now === null ? undefined : new Date(iso).toLocaleString(tagOf(locale))}>
      {now === null ? absolute(iso) : relative(iso, now, locale)}
    </time>
  );
}
