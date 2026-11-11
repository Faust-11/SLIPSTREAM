import type { MetadataRoute } from "next";
import { indexingEnabled, siteUrl } from "@/lib/seo";

// До запуску (SITE_INDEXING != on) — заборона всього: прев'ю не індексуємо.
export default function robots(): MetadataRoute.Robots {
  const sitemap = new URL("/sitemap.xml", siteUrl()).href;
  return indexingEnabled()
    ? { rules: { userAgent: "*", allow: "/" }, sitemap }
    : { rules: { userAgent: "*", disallow: "/" }, sitemap };
}
