import { defaultLocale, locales } from "./config";

/**
 * Перші сегменти, які rewrite на /en НЕ чіпає: мовні префікси, службові шляхи Next/Vercel і майбутні
 * не-сторінкові маршрути поза [lang] (API, /.well-known). Один список — next.config бере регулярку звідси.
 * afterFiles виконуються ДО динамічних маршрутів: шлях, якого тут немає, піде в /en/… (і стане 404).
 */
export const NON_LOCALIZED_PREFIXES = [...locales, "_next", "_vercel", "api", ".well-known"] as const;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Регулярка для `source: "/:path(<…>)"`: усе, що не починається з NON_LOCALIZED_PREFIXES цілим сегментом. */
export function localeRewritePattern(): string {
  const prefixes = NON_LOCALIZED_PREFIXES.map((p) => `${escape(p)}(?:/|$)`).join("|");
  return `(?!${prefixes}).*`;
}

export const DEFAULT_LOCALE_PREFIX = `/${defaultLocale}`;
