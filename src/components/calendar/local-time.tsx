"use client";

import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { fmtDay, fmtSession } from "@/lib/fmt";
import { useHydrated } from "./clock";

/**
 * Формат сесії: «пт, 20 лист. · 00:30»; пояс — UTC на сервері, браузерний після монтування. Без Intl (src/lib/fmt.ts):
 * перший Intl.DateTimeFormat у браузері коштував ~230 мс TBT на календарі (замір 17.11). timeZone — лише "UTC" або
 * нічого (пояс браузера).
 */
export function formatSession(iso: string, locale: Locale, timeZone?: "UTC"): string {
  return fmtSession(iso, locale, timeZone === "UTC");
}

/** Дата картки: «22 лист.». */
export function formatDay(iso: string, locale: Locale, timeZone?: "UTC"): string {
  return fmtDay(iso, locale, timeZone === "UTC");
}

/**
 * Час сесії: сервер і перший клієнтський рендер — UTC (без JS читач бачить UTC, гідратація без розбіжностей), після
 * монтування — у поясі браузера (рішення користувача 14.11). Без суфікса «UTC» у рядку: текст тієї самої довжини до й
 * після гідратації — інакше на вузьких екранах рядок переносився лише до гідратації (CLS 0,22 у CI, 14.11); пояс без
 * JS називає підпис «Час — UTC.» (TzNote).
 */
export function LocalTime({ iso, locale }: { iso: string; locale: Locale }) {
  const hydrated = useHydrated();
  const text = formatSession(iso, locale, hydrated ? undefined : "UTC");
  return (
    <time dateTime={iso} className="num">
      {text}
    </time>
  );
}

/**
 * Дата картки за справжнім часом гонки — у тому самому поясі, що й сесії (рев'ю PR #19: у Лос-Анджелесі картка була
 * «22 лист.», а гонка «сб, 21 лист. · 20:00»). Без JS — дата за UTC.
 */
export function LocalDay({ iso, locale, className }: { iso: string; locale: Locale; className?: string }) {
  const hydrated = useHydrated();
  return (
    <time dateTime={iso} className={className}>
      {formatDay(iso, locale, hydrated ? undefined : "UTC")}
    </time>
  );
}

/** Підпис поясу: «Час — UTC.» → «Час — ваш часовий пояс (Europe/Kyiv).» */
export function TzNote({ utc, local }: { utc: string; local: string }) {
  const hydrated = useHydrated();
  return <p className="cl-tz">{hydrated ? fill(local, { tz: Intl.DateTimeFormat().resolvedOptions().timeZone }) : utc}</p>;
}
