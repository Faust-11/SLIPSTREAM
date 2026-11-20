import type { Locale } from "@/i18n/config";
import { localizedPath } from "@/i18n/paths";
import { siteUrl } from "./seo";

/** Назва сайту в розмітці (WebSite, Organization, BreadcrumbList). */
export const SITE_NAME = "Outlap";

/**
 * JSON для <script type="application/ld+json">: «<» → \u003c (інакше «</script>» усередині тексту закрив би тег),
 * U+2028/2029 — керівні символи JS у старих парсерах.
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

const abs = (path: string, locale: Locale) => new URL(localizedPath(path, locale), siteUrl()).href;

export type Crumb = { name: string; path: string };

/**
 * BreadcrumbList: «Outlap» → … → поточна сторінка. path — без префікса мови (/drivers/hamilton). Назви беруться з тих
 * самих словників, що й видимі «хлібні крихти», тож розмітка збігається з тим, що бачить відвідувач.
 */
export function breadcrumbList(locale: Locale, crumbs: Crumb[]) {
  const items = [{ name: SITE_NAME, path: "/" }, ...crumbs];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: abs(c.path, locale) })),
  };
}

/** WebSite + Organization для головної: назва сайту в пошуку, мова, логотип. */
export function siteIdentity(locale: Locale, description: string) {
  const origin = siteUrl().href.replace(/\/$/, "");
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      alternateName: ["Outlap — The F1 Hub", "Outlap F1"],
      url: abs("/", locale),
      inLanguage: locale,
      description,
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: origin,
      logo: `${origin}/icon-512.png`,
    },
  ];
}
