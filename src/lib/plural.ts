import type { Locale } from "@/i18n/config";

const rules = new Map<Locale, Intl.PluralRules>();

/** Форма слова для числа за правилами мови (uk: one/few/many, en: one/other); бракує форми → `other`. */
export function plural(
  n: number,
  locale: Locale,
  forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string },
): string {
  let r = rules.get(locale);
  if (!r) rules.set(locale, (r = new Intl.PluralRules(locale)));
  return forms[r.select(n)] ?? forms.other;
}
