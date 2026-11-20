import type { MetadataRoute } from "next";
import { indexingEnabled, siteUrl } from "@/lib/seo";

/**
 * Службові адреси, які не мають потрапляти в пошук: API (новини для клієнта) і вхід відвідувачів (callback, фаза 9).
 * Адмінку тут НЕ вказуємо: для сторонніх її «немає» (404), а запис у robots.txt видав би шлях.
 */
const PRIVATE_PATHS = ["/api/", "/auth/"];

// До запуску (SITE_INDEXING != on) — заборона всього: прев'ю не індексуємо.
export default function robots(): MetadataRoute.Robots {
  const sitemap = new URL("/sitemap.xml", siteUrl()).href;
  return indexingEnabled()
    ? { rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }, sitemap }
    : { rules: { userAgent: "*", disallow: "/" }, sitemap };
}
