import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "../robots";

afterEach(() => vi.unstubAllEnvs());

describe("robots.txt", () => {
  it("до запуску — заборона всього й посилання на sitemap", () => {
    vi.stubEnv("SITE_URL", "https://outlap.org");
    const r = robots();
    expect(r.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(r.sitemap).toBe("https://outlap.org/sitemap.xml");
  });

  it("після запуску — дозволено все, крім API й callback входу", () => {
    vi.stubEnv("SITE_URL", "https://outlap.org");
    vi.stubEnv("SITE_INDEXING", "on");
    vi.stubEnv("VERCEL_ENV", "production");
    const r = robots();
    expect(r.rules).toEqual({ userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] });
    expect(r.sitemap).toBe("https://outlap.org/sitemap.xml");
  });

  it("на прев'ю Vercel навіть із SITE_INDEXING=on — заборона", () => {
    vi.stubEnv("SITE_INDEXING", "on");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });
});
