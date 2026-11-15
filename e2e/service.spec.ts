import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Службові сторінки (фаза 8): «Про сайт» і «Джерела й ліцензії».

test("футер: посилання на «Про сайт» і «Джерела й ліцензії» обома мовами", async ({ page }) => {
  await page.goto("/uk/teams");
  const nav = page.getByRole("navigation", { name: "Службові сторінки" });
  await expect(nav.getByRole("link", { name: "Про сайт" })).toHaveAttribute("href", "/uk/about");
  await expect(nav.getByRole("link", { name: "Джерела й ліцензії" })).toHaveAttribute("href", "/uk/sources");
  await page.goto("/teams");
  await expect(page.getByRole("navigation", { name: "About this site" }).getByRole("link", { name: "Sources and licences" })).toHaveAttribute("href", "/sources");
});

test("/uk/about: розділи, цифри з даних, зміст веде на розділи; без адреси — текст про домен", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/uk/about");
  await expect(page.locator("h1")).toContainText("Slipstream");
  await expect(page.locator(".sv-facts > div")).toHaveCount(5);
  for (const h of await page.locator(".sv-idx a").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).hash))) await expect(page.locator(h)).toHaveCount(1);
  await expect(page.locator(".sv-contact")).toContainText(/з'явиться разом із доменом|@/);
  expect(errors).toEqual([]);
});

test("/uk/sources: перелік джерел, графік ліцензій = кількість фото, пошук авторів", async ({ page }) => {
  await page.goto("/uk/sources");
  await expect(page.locator(".sv-reg tbody tr")).toHaveCount(10);
  const total = Number((await page.locator(".sv-facts dt").first().textContent())!.replace(/\D/g, ""));
  const items = page.locator("#sv-credits > li");
  await expect(items).toHaveCount(total);
  // Сума стовпчиків = усі фото.
  const bars = (await page.locator(".sv-bar dd span").allTextContents()).map((s) => Number(s.replace(/\D/g, "")));
  expect(bars.reduce((a, b) => a + b, 0)).toBe(total);
  const q = page.getByRole("searchbox", { name: "Пошук автора або фото" });
  await q.fill("hulkenberg");
  expect(await page.locator("#sv-credits > li:visible").count()).toBeGreaterThanOrEqual(1);
  await q.fill("жжжжжж");
  await expect(page.locator("#sv-credits > li:visible")).toHaveCount(0);
  await expect(page.locator("#sv-credits-empty")).toBeVisible();
});

test("без JS: увесь перелік авторів, поля пошуку немає", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/sources");
  expect(await page.locator("#sv-credits > li").count()).toBeGreaterThan(100);
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await ctx.close();
});

for (const colorScheme of ["light", "dark"] as const)
  for (const path of ["/uk/about", "/sources"])
    test(`без порушень axe; без горизонтального скролу на 320 px: ${path} (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await page.setViewportSize({ width: 1280, height: 900 });
      await expectNoA11yViolations(page);
    });
