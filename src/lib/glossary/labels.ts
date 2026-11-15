import type { Locale } from "@/i18n/config";
import { localizedPath } from "@/i18n/paths";
import type { TermLabels } from "@/components/glossary/term";

/** Підписи підказки: «У словнику →» веде на запис терміна на сторінці «Новачкам» (#g-<id>). */
export function termLabels(locale: Locale, more: string): TermLabels {
  const base = localizedPath("/newbie", locale);
  return { more, href: (id) => `${base}#g-${id}` };
}
