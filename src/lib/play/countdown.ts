import type { Locale } from "@/i18n/config";

/**
 * Відлік до дедлайну: «5 дн. 3 год» / «2 год 15 хв» / «12 хв» / «менше хвилини». Без Intl (src/lib/fmt.ts: перший Intl у
 * браузері коштує 100–250 мс основного потоку). Крок — хвилина: сайт оновлює час раз на 30 с (calendar/clock.ts), секунди
 * не показуємо — відлік не мерехтить і не збиває читачів екрана.
 */
const UNITS = {
  uk: { d: "дн.", h: "год", m: "хв", under: "менше хвилини" },
  en: { d: "d", h: "h", m: "min", under: "under a minute" },
} as const;

export type Countdown = { days: number; hours: number; minutes: number; text: string };

export function countdown(ms: number, locale: Locale): Countdown {
  const u = UNITS[locale];
  const total = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  let text: string;
  if (total < 1) text = u.under;
  else if (days > 0) text = hours > 0 ? `${days} ${u.d} ${hours} ${u.h}` : `${days} ${u.d}`;
  else if (hours > 0) text = minutes > 0 ? `${hours} ${u.h} ${minutes} ${u.m}` : `${hours} ${u.h}`;
  else text = `${minutes} ${u.m}`;
  return { days, hours, minutes, text };
}
