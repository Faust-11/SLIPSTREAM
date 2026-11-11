import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

const SECTIONS = ["/seasons", "/calendar", "/news", "/drivers", "/teams", "/circuits", "/stories", "/newbie", "/game"];
const PAGES = ["/", ...SECTIONS];
const uk = (p: string) => (p === "/" ? "/uk" : `/uk${p}`);

for (const path of PAGES) {
  for (const locale of ["en", "uk"] as const) {
    const url = locale === "en" ? path : uk(path);
    test(`${url}: 200, hreflang, canonical, noindex`, async ({ page, baseURL }) => {
      const res = await page.goto(url);
      expect(res?.status()).toBe(200);
      const origin = new URL(baseURL!).origin;
      const head = await page.evaluate(() => ({
        alternates: Object.fromEntries(
          [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => [
            l.getAttribute("hreflang"),
            l.getAttribute("href"),
          ]),
        ),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
        robots: document.querySelector('meta[name="robots"]')?.getAttribute("content"),
        ogLocale: document.querySelector('meta[property="og:locale"]')?.getAttribute("content"),
        description: document.querySelector('meta[name="description"]')?.getAttribute("content"),
        h1: document.querySelectorAll("h1").length,
        title: document.title,
      }));
      // Абсолютні URL: SITE_URL не задано → localhost:3000 у локальній збірці; перевіряємо шлях.
      const pathOf = (u: string | undefined | null) => (u ? new URL(u, origin).pathname : u);
      expect(Object.keys(head.alternates).sort()).toEqual(["en", "uk", "x-default"]);
      expect(pathOf(head.alternates.en)).toBe(path);
      expect(pathOf(head.alternates.uk)).toBe(uk(path));
      expect(pathOf(head.alternates["x-default"])).toBe(path);
      expect(pathOf(head.canonical)).toBe(url);
      expect(head.robots).toBe("noindex, nofollow");
      expect(head.ogLocale).toBe(locale === "en" ? "en_GB" : "uk_UA");
      expect(head.description?.length).toBeGreaterThan(20);
      expect(head.h1).toBe(1);
      expect(head.title).toContain("Slipstream");
    });
  }
}

test("заголовки вкладок різні для розділів і мов", async ({ request }) => {
  // Через HTTP (без браузера): 20 сторінок за секунди, а не за 30 с навігацій.
  const titles = new Set<string>();
  for (const path of PAGES) {
    for (const url of [path, uk(path)]) {
      const html = await (await request.get(url)).text();
      titles.add(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "");
    }
  }
  expect(titles.size).toBe(PAGES.length * 2);
});

test("/robots.txt забороняє все до запуску й вказує sitemap", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toMatch(/User-Agent: \*/i);
  expect(body).toMatch(/^Disallow: \/$/m);
  expect(body).toMatch(/^Sitemap: https?:\/\/.+\/sitemap\.xml$/m);
});

test("/sitemap.xml: кожна сторінка обома мовами з hreflang", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  expect(locs.sort()).toEqual([...PAGES, ...PAGES.map(uk)].sort());
  expect((xml.match(/hreflang="x-default"/g) ?? []).length).toBe(PAGES.length * 2);
});

test("/uk/nope → 404 українською з посиланнями на розділи", async ({ page }) => {
  const res = await page.goto("/uk/nope");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Сторінку не знайдено");
  const nav = page.getByRole("navigation", { name: "Розділи" });
  await expect(nav.getByRole("link")).toHaveCount(9);
  await expect(nav.getByRole("link", { name: "Команди" })).toHaveAttribute("href", "/uk/teams");
  await expectNoA11yViolations(page);
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const path of ["/stories", "/game", "/uk/newbie", "/uk/calendar", "/news", "/uk/teams"]) {
    test(`без порушень axe: ${path} (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      await expectNoA11yViolations(page);
    });
  }
}
