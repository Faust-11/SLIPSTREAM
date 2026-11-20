import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Розклад за київським часом (/kyiv-time). Еталон — фікстура db.yml: наступний етап — Лас-Вегас (FP1 20.11 00:30 UTC,
// гонка 22.11 04:00 UTC → у Києві UTC+2: 02:30 і 06:00). Час зафіксовано, як у календарі.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-15T12:00:00Z"));
});

test("/uk/kyiv-time: наступний етап — Лас-Вегас, сесії й гонка за київським часом, таблиця на 23 етапи", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const res = await page.goto("/uk/kyiv-time");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Розклад Формули-1 за київським часом");
  await expect(page.locator(".kt-next h2")).toHaveText("Гран-прі Лас-Вегаса");
  const sessions = page.locator(".kt-sess");
  await expect(sessions).toContainText("пт, 20 лист. · 02:30");
  await expect(sessions.locator("li.race")).toContainText("нд, 22 лист. · 06:00");
  await expect(sessions.locator("li.race")).toContainText("UTC+2");
  await expect(page.locator(".kt-table tbody tr")).toHaveCount(23);
  expect(errors).toEqual([]);
});

test("/kyiv-time (EN): той самий етап англійською", async ({ page }) => {
  await page.goto("/kyiv-time");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Formula 1 schedule in Kyiv time");
  await expect(page.locator(".kt-sess")).toContainText("Fri 20 Nov · 02:30");
  await expect(page.locator(".kt-sess li.race")).toContainText("Sun 22 Nov · 06:00");
});

test("метадані: canonical, hreflang, JSON-LD (SportsEvent із київським зсувом) і BreadcrumbList", async ({ page }) => {
  await page.goto("/uk/kyiv-time");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/uk\/kyiv-time$/);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/kyiv-time$/);
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const lds = blocks.map((b) => JSON.parse(b));
  const list = lds.find((l) => l["@type"] === "ItemList");
  expect(list.itemListElement[0].item).toMatchObject({ "@type": "SportsEvent", name: "Гран-прі Лас-Вегаса 2026", startDate: "2026-11-22T06:00:00+02:00" });
  expect(lds.map((l) => l["@type"])).toContain("BreadcrumbList");
});

test("з календаря є посилання на розклад за київським часом", async ({ page }) => {
  await page.goto("/uk/calendar");
  await expect(page.locator('a[href="/uk/kyiv-time"]')).toHaveCount(1);
});

for (const theme of ["light", "dark"] as const)
  for (const width of [320, 390, 1280])
    test(`без порушень axe; ніщо не виходить за екран: ${theme}, ${width} px`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/uk/kyiv-time");
      await expectNoA11yViolations(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
