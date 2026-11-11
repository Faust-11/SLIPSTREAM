import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

const TITLE = { en: "Page not found", uk: "Сторінку не знайдено" } as const;

/** Серверний HTML 404 (без JS): статус і обидві мовні версії з власним lang. */
async function expectServer404(request: APIRequestContext, path: string) {
  const res = await request.get(path, { headers: { accept: "text/html" } });
  expect(res.status(), path).toBe(404);
  const html = await res.text();
  expect(html).toContain('<section lang="en"');
  expect(html).toContain('<section lang="uk"');
  expect(html).toContain(TITLE.en);
  expect(html).toContain(TITLE.uk);
}

/** У браузері 404 показує лише мову адреси. */
async function expectBrowser404(page: Page, path: string, lang: "en" | "uk") {
  const res = await page.goto(path);
  expect(res?.status(), path).toBe(404);
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(TITLE[lang]);
  await expect(page).toHaveTitle("404 · Slipstream");
  await expectNoA11yViolations(page);
}

test.describe("мови й маршрутизація", () => {
  test("/ → 200, html[lang=en]", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("/uk → 200, html[lang=uk]", async ({ page }) => {
    const res = await page.goto("/uk");
    expect(res?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  });

  test("/en/teams → 308 на /teams зі збереженням query", async ({ request }) => {
    const res = await request.get("/en/teams?q=lotus", { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toBe("/teams?q=lotus");
  });

  test("/en → 308 на /", async ({ request }) => {
    const res = await request.get("/en", { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toBe("/");
  });

  test("редирект /en не веде на чужий домен", async ({ request, baseURL }) => {
    for (const path of ["/en//evil.com", "/en/%2F%2Fevil.com", "/en/%5Cevil.com"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      const location = res.headers()["location"] ?? "";
      expect(location, path).not.toMatch(/^(\/\/|\/\\|https?:)/);
      expect(new URL(location, baseURL).origin, path).toBe(new URL(baseURL!).origin);
    }
  });

  test("/de/teams → 404 англійською", async ({ page, request }) => {
    await expectServer404(request, "/de/teams");
    await expectBrowser404(page, "/de/teams", "en");
  });

  test("/uk/nope → 404 українською", async ({ page, request }) => {
    await expectServer404(request, "/uk/nope");
    await expectServer404(request, "/uk/a/b/c");
    await expectBrowser404(page, "/uk/nope", "uk");
  });

  test("/ukraine → 404 англійською (не плутається з /uk)", async ({ page }) => {
    await expectBrowser404(page, "/ukraine", "en");
  });

  test("RSC-запити до невідомих адрес → 404, а не 500", async ({ request }) => {
    for (const path of ["/uk/nope", "/de/teams", "/nope"]) {
      const res = await request.get(path, { headers: { RSC: "1" } });
      expect(res.status(), `RSC ${path}`).toBe(404);
    }
    // Vercel віддає готові .rsc відомих сторінок (200) — вимога лише «не 500».
    for (const path of ["/teams.rsc", "/uk.rsc"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBeLessThan(500);
    }
    for (const path of ["/nope.png", "/_global-error"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(404);
    }
  });

  test("файл з public/ віддається без rewrite", async ({ request }) => {
    // Реальний файл замість проби фази 1: фото з public/img не мають іти в rewrite на /en/…
    const res = await request.get("/img/cars/ferrari-480.webp");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/webp");
  });
});
