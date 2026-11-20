import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";

export type NavKey = "seasons" | "calendar" | "predictions" | "news" | "drivers" | "teams" | "circuits" | "stories" | "newbie" | "game";

export type NavItem = { key: NavKey; href: string; accent?: "yellow" };

/** Головне меню: порядок і адреси (без мовного префікса). */
export const NAV: readonly NavItem[] = [
  { key: "seasons", href: "/seasons" },
  { key: "calendar", href: "/calendar" },
  { key: "predictions", href: "/predictions" },
  { key: "news", href: "/news" },
  { key: "drivers", href: "/drivers" },
  { key: "teams", href: "/teams" },
  { key: "circuits", href: "/circuits" },
  { key: "stories", href: "/stories" },
  { key: "newbie", href: "/newbie" },
  { key: "game", href: "/game", accent: "yellow" },
];

/** Колір першого екрана розділу. */
export const SECTION_HERO: Partial<Record<NavKey, string>> = {
  stories: "#E8002D",
  game: "#FF8000",
  newbie: "#27D9C2",
  calendar: "#1868DB",
  news: "#1E8A63",
};

/** Активний розділ за сегментами маршруту під [lang] (route groups — у дужках — пропускаємо). */
export function activeNavKey(segments: readonly string[]): NavKey | null {
  const first = segments.find((s) => !s.startsWith("("));
  return NAV.find((item) => item.href === `/${first}`)?.key ?? null;
}

/**
 * Шлях сторінки без мови з сегментів маршруту під [lang]. Сегменти вже закодовані для URL,
 * catch-all приходить одним рядком «a/b» (docs: use-selected-layout-segments.md) — не перекодовуємо.
 */
export function barePathFromSegments(segments: readonly string[]): string {
  return `/${segments.filter((s) => !s.startsWith("(")).join("/")}`;
}

export type LocalizedNavItem = NavItem & { label: string };

/** Пункти меню мовою сторінки (без UI-залежностей: використовують шапка, футер і обидві 404). */
export function navItems(locale: Locale, dict: Dictionary): LocalizedNavItem[] {
  return NAV.map((item) => ({ ...item, href: localizedPath(item.href, locale), label: dict.nav[item.key] }));
}
