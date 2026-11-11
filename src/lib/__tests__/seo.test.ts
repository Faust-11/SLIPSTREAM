import { afterEach, describe, expect, it, vi } from "vitest";
import { pageMetadata, siteUrl } from "../seo";

afterEach(() => {
  vi.unstubAllEnvs();
});

const base = { title: "Teams", description: "All Formula 1 teams." };

describe("pageMetadata", () => {
  it("hreflang: en, uk і x-default = EN", () => {
    const m = pageMetadata({ locale: "uk", path: "/teams", ...base });
    expect(m.alternates?.languages).toEqual({ en: "/teams", uk: "/uk/teams", "x-default": "/teams" });
  });

  it("canonical — адреса сторінки своєю мовою", () => {
    expect(pageMetadata({ locale: "uk", path: "/teams", ...base }).alternates?.canonical).toBe("/uk/teams");
    expect(pageMetadata({ locale: "en", path: "/teams", ...base }).alternates?.canonical).toBe("/teams");
    expect(pageMetadata({ locale: "uk", path: "/", ...base }).alternates?.canonical).toBe("/uk");
  });

  it("Open Graph: локаль, альтернативна локаль, назва, опис, адреса", () => {
    const og = pageMetadata({ locale: "uk", path: "/teams", ...base }).openGraph as Record<string, unknown>;
    expect(og.locale).toBe("uk_UA");
    expect(og.alternateLocale).toEqual(["en_GB"]);
    expect(og.title).toBe("Teams");
    expect(og.description).toBe("All Formula 1 teams.");
    expect(og.url).toBe("/uk/teams");
    expect(og.siteName).toBe("Slipstream");
    expect(pageMetadata({ locale: "en", path: "/", ...base }).openGraph).toMatchObject({ locale: "en_GB" });
  });

  it("noindex, nofollow, поки SITE_INDEXING не 'on'", () => {
    vi.stubEnv("SITE_INDEXING", "");
    expect(pageMetadata({ locale: "en", path: "/", ...base }).robots).toEqual({ index: false, follow: false });
    vi.stubEnv("SITE_INDEXING", "yes");
    expect(pageMetadata({ locale: "en", path: "/", ...base }).robots).toEqual({ index: false, follow: false });
    vi.stubEnv("SITE_INDEXING", "on");
    expect(pageMetadata({ locale: "en", path: "/", ...base }).robots).toEqual({ index: true, follow: true });
  });
});

describe("siteUrl", () => {
  it("SITE_URL має пріоритет", () => {
    vi.stubEnv("SITE_URL", "https://slipstream.example/");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "x.vercel.app");
    expect(siteUrl().href).toBe("https://slipstream.example/");
  });

  it("інакше — продакшн-домен Vercel, потім адреса деплою, потім localhost", () => {
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "slip.vercel.app");
    expect(siteUrl().href).toBe("https://slip.vercel.app/");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("VERCEL_URL", "slip-abc.vercel.app");
    expect(siteUrl().href).toBe("https://slip-abc.vercel.app/");
    vi.stubEnv("VERCEL_URL", "");
    expect(siteUrl().href).toBe("http://localhost:3000/");
  });

  it("некоректний SITE_URL — помилка, а не тиха підміна", () => {
    vi.stubEnv("SITE_URL", "not a url");
    expect(() => siteUrl()).toThrow();
  });
});
