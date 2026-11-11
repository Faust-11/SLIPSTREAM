import type { MetadataRoute } from "next";
import { NAV } from "@/config/nav";
import { defaultLocale, locales } from "@/i18n/config";
import { localizedPath } from "@/i18n/paths";
import { siteUrl } from "@/lib/seo";

/** Кожна сторінка обома мовами; у кожного запису — hreflang-альтернативи (en, uk, x-default). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  // Як у метаданих Next: корінь без кінцевого «/» (canonical і hreflang головної — «https://host»).
  const abs = (path: string) => {
    const href = new URL(path, base).href;
    return path === "/" ? href.replace(/\/$/, "") : href;
  };
  const paths = ["/", ...NAV.map((item) => item.href)];
  return paths.flatMap((path) => {
    const languages = {
      ...Object.fromEntries(locales.map((l) => [l, abs(localizedPath(path, l))])),
      "x-default": abs(localizedPath(path, defaultLocale)),
    };
    return locales.map((locale) => ({ url: abs(localizedPath(path, locale)), alternates: { languages } }));
  });
}
