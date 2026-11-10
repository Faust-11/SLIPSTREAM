import { defaultLocale, locales, type Locale } from "./config";

/** Розділяє шлях на pathname і хвіст (`?query#hash`). */
function splitPath(path: string): [pathname: string, rest: string] {
  const i = path.search(/[?#]/);
  return i === -1 ? [path, ""] : [path.slice(0, i), path.slice(i)];
}

/** Префікс мови, якщо шлях починається з нього цілим сегментом (`/uk`, `/uk/...`, але не `/ukraine`). */
function localePrefix(pathname: string): Locale | null {
  for (const locale of locales) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) return locale;
  }
  return null;
}

/** Шлях без мовного префікса (`/uk/teams` → `/teams`, `/uk` → `/`). Query й hash зберігаються. */
export function stripLocale(path: string): string {
  const [pathname, rest] = splitPath(path);
  const locale = localePrefix(pathname);
  const bare = locale ? pathname.slice(locale.length + 1) || "/" : pathname;
  return bare + rest;
}

/** Шлях для мови: EN — без префікса, UK — під `/uk`. Очікує шлях без мовного префікса. */
export function localizedPath(path: string, locale: Locale): string {
  if (locale === defaultLocale) return path;
  const [pathname, rest] = splitPath(path);
  return (pathname === "/" ? `/${locale}` : `/${locale}${pathname}`) + rest;
}

/** Та сама сторінка й параметри іншою мовою. */
export function switchLocalePath(pathnameWithQuery: string, to: Locale): string {
  return localizedPath(stripLocale(pathnameWithQuery), to);
}

/** Заголовок запиту, яким proxy передає мову сторінкам без params (global-not-found). */
export const LOCALE_HEADER = "x-ss-locale";

export type LocaleRoute =
  | { kind: "redirect"; pathname: string }
  | { kind: "rewrite"; pathname: string; locale: Locale }
  | { kind: "next"; locale: Locale };

/**
 * Рішення proxy для pathname: `/en…` → постійний редирект без префікса (без дублів),
 * `/uk…` — як є, решта — внутрішній rewrite на `/en…`.
 */
export function resolveLocaleRoute(pathname: string): LocaleRoute {
  const locale = localePrefix(pathname);
  if (locale === defaultLocale) return { kind: "redirect", pathname: stripLocale(pathname) };
  if (locale) return { kind: "next", locale };
  return {
    kind: "rewrite",
    pathname: pathname === "/" ? `/${defaultLocale}` : `/${defaultLocale}${pathname}`,
    locale: defaultLocale,
  };
}
