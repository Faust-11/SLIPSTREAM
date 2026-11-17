"use client";

import { useNow } from "@/components/calendar/clock";
import type { Locale } from "@/i18n/config";
import { fmtDateTime, fmtRelative } from "@/lib/fmt";

/**
 * «14.11 15:02 UTC» — сервер, перший рендер і без JS. Без Intl: скорочення місяців у ICU Node і браузера можуть
 * різнитися (Firefox/Safari) — це була б розбіжність гідратації (рев'ю PR #20). Коротко — вміщається у вузьку клітинку
 * «Оновлено» на 320 px без переносу (інакше після гідратації рядок скорочувався б — CLS).
 */
function absolute(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)} ${iso.slice(11, 16)} UTC`;
}

/** «2 год тому» / «вчора»; старше тижня — дата. Без Intl (src/lib/fmt.ts) — перший Intl у браузері дорогий для TBT. */
export const relative = fmtRelative;

/**
 * Час запису: сервер і без JS — дата UTC; після гідратації — відносний («2 год тому»), повна дата в підказці. Рядок
 * стоїть у короткому рядку мітаданих поруч із джерелом — зміна довжини не переносить рядок (CLS — e2e).
 */
export function Ago({ iso, locale }: { iso: string; locale: Locale }) {
  const now = useNow();
  return (
    <time dateTime={iso} className="nw-time" title={now === null ? undefined : fmtDateTime(iso, locale, false)}>
      {now === null ? absolute(iso) : relative(iso, now, locale)}
    </time>
  );
}
