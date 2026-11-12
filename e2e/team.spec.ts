import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Сторінка команди (фаза 3b). Еталон McLaren — Вікіпедія 12.11: 1013 стартів, 206 перемог, 566 подіумів,
// 181 поул, 10 Кубків, 13 титулів пілотів (дані — фікстура бази e2e/fixtures/db).

test("/uk/teams/mclaren: банер, факти, підсумки з бази", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const res = await page.goto("/uk/teams/mclaren");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("McLaren");
  await expect(page.locator(".th-stamp")).toHaveText("Кубок конструкторів ×10");
  await expect(page.locator(".ts b")).toHaveText(["1 013", "206", "566", "181", "56", "10", "13"]);
  await expect(page.locator(".tf")).toContainText("Брюс Макларен");
  await expect(page.locator(".tf")).toContainText("Гран-прі Монако 1966");
  await expect(page.getByRole("link", { name: /Instagram/ })).toHaveAttribute("href", "https://www.instagram.com/mclaren/");
  await expect(page.locator(".notes")).toContainText("4 Кубки поспіль");
  await expect(page.locator(".notes")).toContainText("26 років");
  expect(errors).toEqual([]);
});

test("/teams/mclaren англійською: ті самі числа з розрядами EN", async ({ page }) => {
  await page.goto("/teams/mclaren");
  await expect(page.locator(".ts b").first()).toHaveText("1,013");
  await expect(page.getByRole("heading", { level: 2, name: "206 wins" })).toBeVisible();
});

test("невідома команда — 404", async ({ page }) => {
  const res = await page.goto("/uk/teams/nope");
  expect(res?.status()).toBe(404);
});

test("картка в списку веде на сторінку команди, хлібні крихти — назад", async ({ page }) => {
  await page.goto("/uk/teams");
  await page.getByRole("link", { name: "McLaren", exact: true }).click();
  await expect(page).toHaveURL(/\/uk\/teams\/mclaren$/);
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Команди" }).click();
  await expect(page).toHaveURL(/\/uk\/teams$/);
});

test("мала команда (Andrea Moda): без порожніх блоків і нулів", async ({ page }) => {
  await page.goto("/uk/teams/andrea-moda");
  await expect(page.locator(".ts b")).toHaveText(["1"]);
  await expect(page.locator(".th-stamp")).toHaveCount(0);
  await expect(page.locator("#s-wins, #s-champs, #s-pair")).toHaveCount(0);
});

test("таблиці сезонів і перемог — повні (McLaren: 61 сезон, 206 перемог), 2007 — «виключена»", async ({ page }) => {
  await page.goto("/uk/teams/mclaren");
  await page.getByText("Показати 61 сезон").click();
  const seasons = page.locator("#s-seasons ~ * table tbody tr, .sec:has(#s-seasons) tbody tr");
  await expect(seasons).toHaveCount(61);
  await expect(page.locator(".sec:has(#s-seasons) tr", { hasText: "2007" })).toContainText("виключена");
  await page.getByText("Показати всі 206").click();
  await expect(page.locator(".wlist li")).toHaveCount(206);
  await expect(page.locator(".wlist li").first()).toHaveAttribute("value", "206");
});

test.describe("без JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("графік, підсумки й таблиці на місці", async ({ page }) => {
    await page.goto("/uk/teams/mclaren");
    await expect(page.locator("svg.sc")).toBeVisible();
    await expect(page.locator(".ts b").first()).toHaveText("1 013");
    await expect(page.locator(".sec:has(#s-wins) details")).toHaveCount(1);
  });
});

test("метадані: canonical, hreflang, JSON-LD SportsTeam", async ({ page }) => {
  await page.goto("/uk/teams/mclaren");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/uk\/teams\/mclaren$/);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/teams\/mclaren$/);
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(ld).toMatchObject({ "@type": "SportsTeam", name: "McLaren", founder: [{ name: "Брюс Макларен" }] });
});

for (const theme of ["light", "dark"] as const)
  for (const width of [390, 1280])
    test(`без порушень axe: ${theme}, ${width} px, McLaren і Andrea Moda`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      for (const id of ["mclaren", "andrea-moda"]) {
        await page.goto(`/uk/teams/${id}`);
        await expectNoA11yViolations(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      }
    });

test("CLS < 0.1 (390 px) і банер — кандидат LCP з fetchpriority=high", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
        if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/uk/teams/mclaren", { waitUntil: "networkidle" });
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.1);
  await expect(page.locator(".th img")).toHaveAttribute("fetchpriority", "high");
});

test("розмір HTML найбільшої сторінки (Ferrari) — ≤ 150 КБ gzip", async ({ request }) => {
  const res = await request.get("/uk/teams/ferrari", { headers: { "accept-encoding": "gzip" } });
  expect(res.status()).toBe(200);
  const body = await res.body(); // Playwright розпаковує; оцінюємо стиснутий розмір тим самим gzip
  const { gzipSync } = await import("node:zlib");
  expect(gzipSync(body).length).toBeLessThan(150 * 1024);
});
