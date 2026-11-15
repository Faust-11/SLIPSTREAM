import en from "../../../content/service/en.json";
import uk from "../../../content/service/uk.json";
import type { Locale } from "@/i18n/config";

/**
 * Тексти службових сторінок «Про сайт» і «Джерела й ліцензії» (фаза 8) — власні файли content/service/, не спільні
 * словники. Числа (сезони, фото, автори, схеми) підставляються з даних, у тексті лише плейсхолдери.
 */
export type ServiceText = typeof uk;
const TEXT = { uk, en } satisfies Record<Locale, ServiceText>;

export function serviceText(locale: Locale): ServiceText {
  return TEXT[locale];
}

/**
 * Контактна адреса — лише коли задано SITE_CONTACT_EMAIL (з'явиться з доменом, рішення 15.11: пошта на домені).
 * Без змінної сторінка показує «адреса з'явиться разом із доменом», а не вигадану адресу.
 */
export function contactEmail(): string | null {
  const v = process.env.SITE_CONTACT_EMAIL?.trim();
  return v && /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(v) ? v : null;
}

/**
 * Аналітика відвідувань (Vercel Web Analytics) — увімкнена лише з SITE_ANALYTICS=on (фаза 8, Task 3b). Доти пункт
 * «Відвідування» в «Що зберігає сайт» не показується: не стверджуємо того, чого ще немає (рев'ю PR #47).
 */
export function analyticsEnabled(): boolean {
  return process.env.SITE_ANALYTICS === "on";
}
