import type { Metadata } from "next";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { localizedPath } from "@/i18n/paths";
import ogImages from "@/data/og-images.json";

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
/**
 * Фавікони й маніфест (public/, генератор — scripts/assets/favicons.mjs). SVG — першим: сучасні браузери беруть
 * його для вкладки; ICO з sizes="32x32" — щоб Chrome не віддавав йому перевагу над SVG; PNG — для старіших і для
 * пошуку (Google — кратні 48 px); apple-touch-icon — непрозорий (iOS заливає прозоре чорним).
 */
export const SITE_ICONS: Pick<Metadata, "icons" | "manifest"> = {
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
};

export function robotsMetadata(): Metadata["robots"] {
  const index = indexingEnabled();
  return { index, follow: index };
}

/** hreflang-альтернативи шляху: кожна мова + x-default (= EN). Спільні для <head> і sitemap. */
export function languageAlternates(path: string, toUrl: (localized: string) => string = (p) => p) {
  return {
    ...Object.fromEntries(locales.map((l) => [l, toUrl(localizedPath(path, l))])),
    "x-default": toUrl(localizedPath(path, defaultLocale)),
  } as Record<Locale | "x-default", string>;
}

const OG_SIZE = { width: 1200, height: 630 };
const OG_SECTIONS: Record<string, { src: string; alt: string }> = ogImages.sections;
const OG_PHOTOS: Record<string, string> = ogImages.photos;

/**
 * Картинка прев'ю посилання (JPEG 1200×630 з scripts/og/build.mjs — WebP Telegram у прев'ю не показує):
 * фото героя сторінки, якщо для нього згенеровано JPEG, інакше — картка розділу за першим сегментом шляху
 * (/seasons/2023/5 → seasons; невідомий розділ → головна).
 */
export function ogImage(locale: Locale, path: string, photo?: { src: string; alt: string }) {
  const own = photo && OG_PHOTOS[photo.src];
  if (own) return { url: own, ...OG_SIZE, alt: photo.alt };
  const section = path.split("/")[1] || "home";
  const card = OG_SECTIONS[`${section}-${locale}`] ?? OG_SECTIONS[`home-${locale}`]!;
  return { url: card.src, ...OG_SIZE, alt: card.alt };
}

/** Метадані сторінки: canonical своєю мовою, hreflang (en, uk, x-default = EN), Open Graph з картинкою прев'ю, robots. */
export function pageMetadata({
  locale,
  path,
  title,
  description,
  image,
  article,
}: {
  locale: Locale;
  path: string;
  title: string;
  description: string;
  /** Фото героя сторінки (src як на сайті) — для прев'ю посилання; без нього — картка розділу. */
  image?: { src: string; alt: string };
  /** Стаття (історії): og:type=article і дата оновлення. */
  article?: { modified: string | null };
}): Metadata {
  const url = localizedPath(path, locale);
  const og = ogImage(locale, path, image);
  const images = [{ ...og, url: new URL(og.url, siteUrl()).href }];
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: languageAlternates(path),
    },
    twitter: { card: "summary_large_image", images },
    openGraph: {
      images,
      ...(article ? { type: "article" as const, ...(article.modified ? { modifiedTime: article.modified } : {}) } : { type: "website" as const }),
      siteName: "Outlap",
      title,
      description,
      url,
      locale: OG_LOCALE[locale],
      alternateLocale: (Object.keys(OG_LOCALE) as Locale[]).filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
    },
    robots: robotsMetadata(),
  };
}
