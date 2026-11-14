"use client";

import { useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/config";

/** Формат сесії: «пт, 20 лист. · 00:30»; пояс — UTC на сервері, браузерний після монтування. */
export function formatSession(iso: string, locale: Locale, timeZone?: string): string {
  const d = new Date(iso);
  const tag = locale === "uk" ? "uk" : "en-GB";
  const day = new Intl.DateTimeFormat(tag, { weekday: "short", day: "numeric", month: "short", ...(timeZone ? { timeZone } : {}) }).format(d);
  const time = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(timeZone ? { timeZone } : {}) }).format(d);
  return `${day} · ${time}`;
}

/**
 * Час сесії: сервер і перший клієнтський рендер — UTC (без JS читач бачить UTC, гідратація без розбіжностей), після
 * монтування — у поясі браузера (рішення користувача 14.11).
 */
const noop = () => () => {};
/** true після гідратації (на сервері й під час гідратації — false): без розбіжності розмітки й без setState в ефекті. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function LocalTime({ iso, locale }: { iso: string; locale: Locale }) {
  const hydrated = useHydrated();
  const text = hydrated ? formatSession(iso, locale) : `${formatSession(iso, locale, "UTC")} UTC`;
  return (
    <time dateTime={iso} className="num">
      {text}
    </time>
  );
}

/** Підпис поясу: «Час — UTC.» → «Час — ваш часовий пояс (Europe/Kyiv).» */
export function TzNote({ utc, local }: { utc: string; local: string }) {
  const hydrated = useHydrated();
  return <p className="cl-tz">{hydrated ? local.replace("{tz}", Intl.DateTimeFormat().resolvedOptions().timeZone) : utc}</p>;
}
