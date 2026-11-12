import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Сторінка «Сезони» (фаза 3e). Точні числа — на завершених сезонах (не змінюються з новими гонками).

test("/uk/seasons: вступ, десятиліття, картки завершених сезонів", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const res = await page.goto("/uk/seasons");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Сезони");
  await expect(page.locator(".sn-facts li").nth(2)).toContainText("7");
  await expect(page.locator(".sn-facts li").nth(2)).toContainText("Шумахер");
  await expect(page.locator(".sn-facts li").nth(2)).toContainText("Гамілтон");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["2020-ті", "2010-ті", "2000-ті", "1990-ті", "1980-ті", "1970-ті", "1960-ті", "1950-ті"]);
  const d2010 = page.locator("#d2010");
  await expect(d2010.locator(".dec-side")).toContainText("10 сезонів · 3 чемпіони");
  await expect(d2010.locator(".who")).toHaveText("Гамілтон, Росберг, Феттель");
  await expect(d2010.locator(".slot")).toHaveCount(10);
  const c1988 = page.getByRole("article", { name: /1988/ });
  await expect(c1988).toContainText("Айртон Сенна");
  await expect(c1988).toContainText("McLaren");
  await expect(c1988).toContainText("8 перемог з 16 гонок");
  await expect(c1988).toContainText("Кубок: McLaren");
  await expect(page.getByRole("article", { name: /1950/ })).toContainText("Кубка конструкторів ще не було");
  // 1997: Шумахера виключено з заліку — чемпіон Вільньов.
  await expect(page.getByRole("article", { name: /1997/ })).toContainText("Вільньов");
  expect(errors).toEqual([]);
});

test("/seasons англійською", async ({ page }) => {
  await page.goto("/seasons");
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText("2020s");
  const c2023 = page.getByRole("article", { name: /2023/ });
  await expect(c2023).toContainText("19 wins from 22 races");
  await expect(c2023).toContainText("Constructors: Red Bull");
});

test("перша картка — поточний сезон: «Сезон триває» лише поки лишились етапи; порядок — від нових до старих", async ({ page }) => {
  await page.goto("/uk/seasons");
  const years = (await page.locator(".slot .yr").allTextContents()).map(Number);
  expect(years.length).toBeGreaterThanOrEqual(77);
  expect(years).toEqual([...years].sort((a, b) => b - a));
  expect(years.at(-1)).toBe(1950);
  const first = page.locator(".slot").first();
  await expect(first).toHaveClass(/pole/);
  await expect(first.locator("img")).toHaveAttribute("fetchpriority", "high");
});

test("посилання картки: пілот, команда, Кубок — на існуючі сторінки; чипи — якорі на десятиліття", async ({ page, request }) => {
  await page.goto("/uk/seasons");
  const c = page.getByRole("article", { name: /1988/ });
  await expect(c.getByRole("link", { name: "Айртон Сенна" })).toHaveAttribute("href", "/uk/drivers/senna");
  await expect(c.getByRole("link", { name: "McLaren" }).first()).toHaveAttribute("href", "/uk/teams/mclaren");
  const hrefs = [...new Set(await page.locator(".car a").evaluateAll((as) => as.map((a) => a.getAttribute("href")!)))];
  expect(hrefs.length).toBeGreaterThan(40);
  const dead: string[] = [];
  for (let i = 0; i < hrefs.length; i += 8) {
    const part = hrefs.slice(i, i + 8);
    const codes = await Promise.all(part.map(async (h) => (await request.get(h)).status()));
    codes.forEach((code, k) => code !== 200 && dead.push(`${part[k]} → ${code}`));
  }
  expect(dead).toEqual([]);
  await page.getByRole("navigation", { name: "Десятиліття" }).getByRole("link", { name: "1980-ті" }).click();
  await expect(page).toHaveURL(/#d1980$/);
  await expect(page.locator("#d1980")).toBeInViewport();
  await expect(page.getByRole("navigation", { name: "Десятиліття" }).getByRole("link", { name: "1980-ті" })).toHaveAttribute("aria-current", "true");
});

test.describe("без JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("усі картки й чипи на місці", async ({ page }) => {
    await page.goto("/uk/seasons");
    expect(await page.locator(".slot").count()).toBeGreaterThanOrEqual(77);
    await expect(page.locator('.sn-chips a[href="#d1950"]')).toBeVisible();
    await expect(page.getByRole("article", { name: /1976/ })).toContainText("Джеймс Гант");
  });
});

test("метадані: canonical, hreflang, JSON-LD ItemList", async ({ page }) => {
  await page.goto("/uk/seasons");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/uk\/seasons$/);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/seasons$/);
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(ld["@type"]).toBe("ItemList");
  expect(ld.itemListElement.length).toBe(ld.numberOfItems);
});

for (const theme of ["light", "dark"] as const)
  for (const width of [320, 390, 768, 1280])
    test(`без порушень axe і горизонтальної прокрутки: ${theme}, ${width} px`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/uk/seasons");
      await expectNoA11yViolations(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });

test("CLS < 0.1 (390 px); розмір HTML ≤ 100 КБ gzip", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
        if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/uk/seasons", { waitUntil: "networkidle" });
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.1);
  const { gzipSync } = await import("node:zlib");
  const res = await request.get("/uk/seasons", { headers: { "accept-encoding": "gzip" } });
  expect(gzipSync(await res.body()).length).toBeLessThan(100 * 1024);
});
