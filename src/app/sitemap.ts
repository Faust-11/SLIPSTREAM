import type { MetadataRoute } from "next";
import { NAV } from "@/config/nav";
import { locales } from "@/i18n/config";
import { localizedPath } from "@/i18n/paths";
import { circuitSlug } from "@/lib/circuit-math";
import { getCircuitRefs } from "@/lib/data/circuits";
import { getDriverSlugs } from "@/lib/data/driver-page";
import { getRaceKeys } from "@/lib/data/race-page";
import { getSeasonYears } from "@/lib/data/season-page";
import { getTeamIds } from "@/lib/data/team-page";
import { languageAlternates, siteUrl } from "@/lib/seo";
import { getStorySlugs } from "@/lib/stories/content";

/**
 * Службові сторінки (не в меню) і сторінки, що додаються окремими фазами. Нова публічна сторінка — сюди.
 * Сторінки входу, кабінет, callback і API в sitemap НЕ потрапляють (і мають noindex у метаданих).
 */
const EXTRA_PATHS = ["/about", "/sources"];

/**
 * Кожна сторінка обома мовами; у кожного запису — hreflang-альтернативи (en, uk, x-default).
 * Усі сторінки-деталі (сезони, гонки, пілоти, команди, траси, історії) беруться з тих самих джерел, що й
 * generateStaticParams, тож sitemap збігається з тим, що збудовано. lastmod не вказуємо: дати оновлення сторінок у
 * базі немає, а вигадана дата гірша за її відсутність.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  // Як у метаданих Next: корінь без кінцевого «/» (canonical і hreflang головної — «https://host»).
  const abs = (path: string) => {
    const href = new URL(path, base).href;
    return path === "/" ? href.replace(/\/$/, "") : href;
  };
  const [years, races, drivers, circuits] = await Promise.all([getSeasonYears(), getRaceKeys(), getDriverSlugs(), getCircuitRefs()]);
  const paths = [
    "/",
    ...NAV.map((item) => item.href),
    ...EXTRA_PATHS,
    ...years.map((y) => `/seasons/${y}`),
    ...races.map((r) => `/seasons/${r.year}/${r.round}`),
    ...drivers.map((slug) => `/drivers/${slug}`),
    ...getTeamIds().map((id) => `/teams/${id}`),
    ...circuits.map((ref) => `/circuits/${circuitSlug(ref)}`),
    ...getStorySlugs().map((slug) => `/stories/${slug}`),
  ];
  return [...new Set(paths)].flatMap((path) => {
    const languages = languageAlternates(path, abs);
    return locales.map((locale) => ({ url: abs(localizedPath(path, locale)), alternates: { languages } }));
  });
}
