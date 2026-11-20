import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

const SECTIONS = ["/seasons", "/calendar", "/predictions", "/news", "/drivers", "/teams", "/circuits", "/stories", "/newbie", "/game"];
const PAGES = ["/", ...SECTIONS].concat(["/about", "/sources"]); // службові сторінки (фаза 8) — у sitemap, не в меню
const uk = (p: string) => (p === "/" ? "/uk" : `/uk${p}`);

/**
 * Очікуваний origin абсолютних URL у метаданих: адреса тестового сервера (SITE_URL у збірці),
 * для прев'ю Vercel — продакшн-домен (E2E_SITE_URL). Корінь — без кінцевого «/», як canonical Next.
 */
function absolute(baseURL: string | undefined, path: string): string {
  const site = (process.env.E2E_SITE_URL ?? new URL(baseURL!).origin).replace(/\/$/, "");
  return path === "/" ? site : site + path;
}

for (const path of PAGES) {
  for (const locale of ["en", "uk"] as const) {
    const url = locale === "en" ? path : uk(path);
    test(`${url}: 200, hreflang, canonical, noindex`, async ({ page, baseURL }) => {
      const res = await page.goto(url);
      expect(res?.status()).toBe(200);
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
      // Повні абсолютні URL — рядки цілком (відносні hreflang Google не приймає).
      expect(head.alternates).toEqual({
        en: absolute(baseURL, path),
        uk: absolute(baseURL, uk(path)),
        "x-default": absolute(baseURL, path),
      });
      expect(head.canonical).toBe(absolute(baseURL, url));
      expect(head.robots).toBe("noindex, nofollow");
      expect(head.ogLocale).toBe(locale === "en" ? "en_GB" : "uk_UA");
      expect(head.description?.length).toBeGreaterThan(20);
      expect(head.h1).toBe(1);
      expect(head.title).toContain("Outlap");
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

/** Типи сторінок-деталей у sitemap (адреса без префікса мови). */
const DETAIL_KINDS: [string, RegExp][] = [
  ["сезон", /^\/seasons\/\d{4}$/],
  ["гонка", /^\/seasons\/\d{4}\/\d+$/],
  ["пілот", /^\/drivers\/[a-z0-9-]+$/],
  ["команда", /^\/teams\/[a-z0-9-]+$/],
  ["траса", /^\/circuits\/[a-z0-9-]+$/],
  ["історія", /^\/stories\/[a-z0-9-]+$/],
];

async function sitemapLocs(request: import("@playwright/test").APIRequestContext) {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  const xml = await res.text();
  return { xml, locs: [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!) };
}

test("/sitemap.xml: розділи й сторінки-деталі обома мовами з hreflang, <loc> унікальні", async ({ request, baseURL }) => {
  const { xml, locs } = await sitemapLocs(request);
  expect(new Set(locs).size, "дублі <loc>").toBe(locs.length);
  for (const p of [...PAGES, ...PAGES.map(uk)]) expect(locs, p).toContain(absolute(baseURL, p));
  // Кожен тип сторінки-деталі — обома мовами (UK-адреса = /uk + EN-адреса).
  const site = absolute(baseURL, "/");
  const paths = locs.map((l) => (l === site ? "/" : l.slice(site.length)));
  for (const [name, re] of DETAIL_KINDS) {
    const en = paths.filter((p) => re.test(p));
    expect(en.length, `${name}: сторінок в sitemap`).toBeGreaterThan(0);
    for (const p of en.slice(0, 5)) expect(paths, `${name}: UK-пара для ${p}`).toContain(uk(p));
  }
  expect((xml.match(/hreflang="x-default"/g) ?? []).length).toBe(locs.length);
});

test("вибірка сторінок з sitemap — noindex і canonical на себе (сторінки без pageMetadata теж)", async ({ request, baseURL }) => {
  const { locs } = await sitemapLocs(request);
  const site = absolute(baseURL, "/");
  const pathOf = (l: string) => (l === site ? "/" : l.slice(site.length));
  // Усі розділи + по три сторінки кожного типу-деталі (повний обхід ≈ тисячі адрес — задовго для CI).
  const picked = new Set(locs.filter((l) => PAGES.some((p) => l === absolute(baseURL, p) || l === absolute(baseURL, uk(p)))));
  for (const [, re] of DETAIL_KINDS) {
    for (const l of locs.filter((x) => re.test(pathOf(x).replace(/^\/uk(?=\/)/, ""))).slice(0, 3)) picked.add(l);
  }
  for (const loc of picked) {
    const html = await (await request.get(pathOf(loc))).text();
    expect(html, loc).toContain('<meta name="robots" content="noindex, nofollow"/>');
    expect(html, loc).toContain(`<link rel="canonical" href="${loc}"/>`);
  }
});

test("розмітка schema.org: головна — WebSite+Organization, деталі — BreadcrumbList; JSON-LD валідний", async ({ request }) => {
  const types = async (path: string) => {
    const html = await (await request.get(path)).text();
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) => JSON.parse(m[1]!));
    return blocks.map((b) => b["@type"]);
  };
  expect(await types("/")).toEqual(expect.arrayContaining(["WebSite", "Organization"]));
  expect(await types("/uk")).toEqual(expect.arrayContaining(["WebSite", "Organization"]));
  for (const path of ["/drivers", "/teams", "/circuits", "/seasons", "/stories", "/game", "/news", "/uk/calendar"]) {
    expect(await types(path), path).toContain("BreadcrumbList");
  }
});

test("/uk/nope → 404 українською з посиланнями на розділи", async ({ page }) => {
  const res = await page.goto("/uk/nope");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Сторінку не знайдено");
  const nav = page.getByRole("navigation", { name: "Розділи" });
  await expect(nav.getByRole("link")).toHaveCount(10);
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
