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
