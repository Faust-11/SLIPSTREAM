import type { Metadata } from "next";
import { defaultLocale, type Locale } from "@/i18n/config";
import { localizedPath } from "@/i18n/paths";

const OG_LOCALE: Record<Locale, string> = { en: "en_GB", uk: "uk_UA" };

/**
 * Базова адреса сайту для абсолютних URL у метаданих і sitemap:
 * SITE_URL → продакшн-домен Vercel → адреса деплою Vercel → localhost.
 */
export function siteUrl(): URL {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) {
    const url = new URL(explicit);
    // Шлях у базі розсинхронізував би sitemap (new URL("/teams", base) відкидає його) і метадані.
    if (url.pathname !== "/" || url.search || url.hash) throw new TypeError(`SITE_URL — лише origin: "${explicit}"`);
    return url;
  }
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (vercel) return new URL(`https://${vercel}`);
  return new URL("http://localhost:3000");
}

/**
 * До запуску сайт не індексується: лише явне SITE_INDEXING=on — і ніколи на прев'ю/dev-деплоях Vercel
 * (захист від помилкового SITE_INDEXING=on для всіх оточень). Читається під час збірки: зміна — через redeploy.
 */
export function indexingEnabled(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  return process.env.SITE_INDEXING === "on" && (!vercelEnv || vercelEnv === "production");
}

/** robots для всього сайту: layout задає за замовчуванням, щоб нова сторінка без pageMetadata не стала індексованою. */
export function robotsMetadata(): Metadata["robots"] {
  const index = indexingEnabled();
  return { index, follow: index };
}

/** Метадані сторінки: canonical своєю мовою, hreflang (en, uk, x-default = EN), Open Graph, robots. */
export function pageMetadata({
  locale,
  path,
  title,
  description,
}: {
  locale: Locale;
  path: string;
  title: string;
  description: string;
}): Metadata {
  const url = localizedPath(path, locale);
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        en: localizedPath(path, "en"),
        uk: localizedPath(path, "uk"),
        "x-default": localizedPath(path, defaultLocale),
      },
    },
    openGraph: {
      type: "website",
      siteName: "Slipstream",
      title,
      description,
      url,
      locale: OG_LOCALE[locale],
      alternateLocale: (Object.keys(OG_LOCALE) as Locale[]).filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
    },
    robots: robotsMetadata(),
  };
}
