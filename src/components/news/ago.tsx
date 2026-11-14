"use client";

import { useNow } from "@/components/calendar/clock";
import type { Locale } from "@/i18n/config";

const tagOf = (l: Locale) => (l === "uk" ? "uk" : "en-GB");
const rtf = new Map<Locale, Intl.RelativeTimeFormat>();

/** «14 лист. · 15:02» — сервер і перший рендер (UTC), без JS. */
function absolute(iso: string, locale: Locale): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(tagOf(locale), { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
  const time = new Intl.DateTimeFormat(tagOf(locale), { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(d);
  return `${day} · ${time} UTC`;
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
      {now === null ? absolute(iso, locale) : relative(iso, now, locale)}
    </time>
  );
}
