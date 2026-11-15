import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ogImage, pageMetadata, robotsMetadata, siteUrl } from "../seo";
import ogImages from "@/data/og-images.json";
import { locales } from "@/i18n/config";

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

  it("прев'ю й dev-деплої Vercel не індексуються навіть із SITE_INDEXING=on", () => {
    vi.stubEnv("SITE_INDEXING", "on");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(robotsMetadata()).toEqual({ index: false, follow: false });
    vi.stubEnv("VERCEL_ENV", "development");
    expect(robotsMetadata()).toEqual({ index: false, follow: false });
    vi.stubEnv("VERCEL_ENV", "production");
    expect(robotsMetadata()).toEqual({ index: true, follow: true });
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
    vi.stubEnv("SITE_URL", "https://slipstream.example/base");
    expect(() => siteUrl()).toThrow(/origin/);
  });
});

describe("прев'ю посилань (og:image)", () => {
  const pub = (rel: string) => join(process.cwd(), "public", rel);

  it("кожна картинка з переліку існує, JPEG ≤ 300 КБ (поріг WhatsApp)", () => {
    const all = [...Object.values(ogImages.sections).map((c) => c.src), ...Object.values(ogImages.photos)];
    for (const rel of all) {
      expect(rel, rel).toMatch(/^\/og\/.+\.jpg$/);
      expect(existsSync(pub(rel)), rel).toBe(true);
      expect(statSync(pub(rel)).size, rel).toBeLessThanOrEqual(300_000);
    }
  });

  it("картка є для кожного розділу меню й головної обома мовами", () => {
    const sections = readdirSync(join(process.cwd(), "src/app/[lang]"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_") && existsSync(join(process.cwd(), "src/app/[lang]", d.name, "page.tsx")))
      .map((d) => d.name);
    for (const s of ["home", ...sections]) for (const l of locales) expect(ogImages.sections, `${s}-${l}`).toHaveProperty(`${s}-${l}`);
  });

  it("фото з JPEG → його картинка; без JPEG чи без фото → картка розділу; невідомий розділ → головна", () => {
    const [src, jpg] = Object.entries(ogImages.photos)[0]!;
    expect(ogImage("uk", "/stories/x", { src, alt: "Фото" })).toEqual({ url: jpg, width: 1200, height: 630, alt: "Фото" });
    expect(ogImage("uk", "/drivers/hamilton", { src: "/img/drivers/hamilton-420.webp", alt: "" }).url).toBe("/og/section/drivers-uk.jpg");
    expect(ogImage("en", "/seasons/2023/5").url).toBe("/og/section/seasons-en.jpg");
    expect(ogImage("en", "/").url).toBe("/og/section/home-en.jpg");
    expect(ogImage("uk", "/nope").url).toBe("/og/section/home-uk.jpg");
  });

  it("pageMetadata: абсолютна адреса картинки в Open Graph і Twitter, великий формат картки", () => {
    const m = pageMetadata({ locale: "uk", path: "/teams", ...base });
    const og = (m.openGraph as { images: { url: string; width: number }[] }).images[0]!;
    expect(og.url).toMatch(/^https?:\/\/.+\/og\/section\/teams-uk\.jpg$/);
    expect(og.width).toBe(1200);
    expect(m.twitter).toMatchObject({ card: "summary_large_image", images: [og] });
  });
});
