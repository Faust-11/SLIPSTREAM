import { expect, test, type APIRequestContext } from "@playwright/test";

/** 404 має бути відрендерений сервером (без JS): правильний lang і заголовок у сирому HTML. */
async function expectServer404(request: APIRequestContext, path: string, lang: string, title: string) {
  const res = await request.get(path, { headers: { accept: "text/html" } });
  expect(res.status()).toBe(404);
  const html = await res.text();
  expect(html).toContain(`<html lang="${lang}"`);
  expect(html).toContain(title);
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

  test("/de/teams → 404 англійською", async ({ page, request }) => {
    const res = await page.goto("/de/teams");
    expect(res?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expectServer404(request, "/de/teams", "en", "Page not found");
  });

  test("/uk/nope → 404 українською", async ({ page, request }) => {
    const res = await page.goto("/uk/nope");
    expect(res?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", "uk");
    await expectServer404(request, "/uk/nope", "uk", "Сторінку не знайдено");
    await expectServer404(request, "/uk/a/b/c", "uk", "Сторінку не знайдено");
  });

  test("/ukraine → 404 англійською (не плутається з /uk)", async ({ request }) => {
    await expectServer404(request, "/ukraine", "en", "Page not found");
  });

  test("мову 404 не можна підмінити заголовком запиту", async ({ request }) => {
    const res = await request.get("/de/teams", { headers: { "x-ss-locale": "uk" } });
    expect(await res.text()).toContain('<html lang="en"');
  });

  test("неіснуючий файл → 404, а не 500", async ({ request }) => {
    await expectServer404(request, "/nope.png", "en", "Page not found");
  });

  test("файл з public/ віддається без rewrite", async ({ request }) => {
    const res = await request.get("/e2e-probe.txt");
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("slipstream");
  });
});
