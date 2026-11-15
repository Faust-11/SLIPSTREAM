import type { MetadataRoute } from "next";
import { NAV } from "@/config/nav";
import { locales } from "@/i18n/config";
import { localizedPath } from "@/i18n/paths";
import { languageAlternates, siteUrl } from "@/lib/seo";

/** Кожна сторінка обома мовами; у кожного запису — hreflang-альтернативи (en, uk, x-default). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  // Як у метаданих Next: корінь без кінцевого «/» (canonical і hreflang головної — «https://host»).
  const abs = (path: string) => {
    const href = new URL(path, base).href;
    return path === "/" ? href.replace(/\/$/, "") : href;
  };
  // Службові сторінки (фаза 8) — не в меню, але в sitemap.
  const paths = ["/", ...NAV.map((item) => item.href), "/about", "/sources"];
  return paths.flatMap((path) => {
    const languages = languageAlternates(path, abs);
    return locales.map((locale) => ({ url: abs(localizedPath(path, locale)), alternates: { languages } }));
  });
}
