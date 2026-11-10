import { defaultLocale, locales, type Locale } from "./config";

/** Розділяє шлях на pathname і хвіст (`?query#hash`). */
function splitPath(path: string): [pathname: string, rest: string] {
  const i = path.search(/[?#]/);
  return i === -1 ? [path, ""] : [path.slice(0, i), path.slice(i)];
}

/** Лише шлях від кореня свого сайту: `//host` і `/\\host` браузер трактує як інший домен. */
function assertAbsolute(path: string): void {
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
    throw new TypeError(`Очікується шлях від кореня сайту: "${path}"`);
  }
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
  assertAbsolute(path);
  const [pathname, rest] = splitPath(path);
  const locale = localePrefix(pathname);
  const bare = locale ? pathname.slice(locale.length + 1) || "/" : pathname;
  return bare + rest;
}

/** Шлях для мови: EN — без префікса, UK — під `/uk`. Наявний мовний префікс замінюється. */
export function localizedPath(path: string, locale: Locale): string {
  const [pathname, rest] = splitPath(stripLocale(path));
  if (locale === defaultLocale) return pathname + rest;
  return (pathname === "/" ? `/${locale}` : `/${locale}${pathname}`) + rest;
}

/** Та сама сторінка й параметри іншою мовою. */
export function switchLocalePath(pathnameWithQuery: string, to: Locale): string {
  return localizedPath(pathnameWithQuery, to);
}
