import type { Locale } from "@/i18n/config";
import { pluralCategory } from "@/lib/fmt";

/** Форма слова для числа за правилами мови (uk: one/few/many, en: one/other); бракує форми → `other`. */
export function plural(
  n: number,
  locale: Locale,
  forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string },
): string {
  // Без Intl.PluralRules: plural() працює й у клієнтських компонентах, а перший Intl у браузері дорогий (fmt.ts).
  return forms[pluralCategory(n, locale)] ?? forms.other;
}
