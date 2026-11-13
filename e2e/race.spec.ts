import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Сторінка гонки (фаза 3g). Еталони — макет Абу-Дабі 2025 і заміри (docs/decisions.md, «Фаза 3g»).

test("/uk/seasons/2025/24: банер, смуга, «як вирішився титул», коло за колом (макет)", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const res = await page.goto("/uk/seasons/2025/24");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Гран-прі Абу-Дабі\s*2025/);
  await expect(page.locator(".rc-stamp")).toHaveText("Вирішальна гонка сезону");
  await expect(page.locator(".rc-hero p")).toContainText("Етап 24 з 24 · Абу-Дабі");
  const strip = page.locator(".rc-strip");
  await expect(strip).toContainText("Макс Ферстаппен");
  await expect(strip.locator(".champ")).toContainText("Ландо Норріс");
  await expect(page.locator(".rc-title-text")).toContainText("Фініш на P4 замість P3: Норріс — 420, Ферстаппен — 421");
  await expect(page.locator(".rc-tt li")).toHaveCount(3);
  await expect(page.locator(".rc-story")).toContainText("Ферстаппен лідирував на всіх колах, крім 24–40");
  await expect(page.locator(".rc-story")).toContainText("Норріс після піт-стопу на колі 16 опускався до P9, фініш — P3");
  await expect(page.getByRole("img", { name: /Позиції по колах: Ферстаппен, Піастрі, Норріс/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("протокол і кваліфікація Абу-Дабі 2025: 1:26:07.469, Піастрі +12.594, поул 1:22.207", async ({ page }) => {
  await page.goto("/uk/seasons/2025/24");
  const race = page.getByRole("table", { name: /Гонка · 58 кіл/ });
  await expect(race.locator("tbody tr")).toHaveCount(20);
  await expect(race.locator("tbody tr").first()).toContainText("1:26:07.469");
  await expect(race.locator("tbody tr").nth(1)).toContainText("+12.594");
  const quali = page.getByRole("table", { name: "Кваліфікація" });
  await expect(quali.locator("tbody tr").first()).toContainText("1:22.207");
  await expect(page.locator(".rc-tl li").first()).toContainText("Норріс");
});

test("посилання: з календаря сезону — на гонку; усі посилання сторінки гонки — на існуючі сторінки", async ({ page, request }) => {
  await page.goto("/uk/seasons/2025");
  await page.locator(".cal a.city", { hasText: "Мельбурн" }).click();
  await expect(page).toHaveURL(/\/uk\/seasons\/2025\/1$/);
  await page.goto("/uk/seasons/2025/24");
  const hrefs = [...new Set(await page.locator(".race-page a").evaluateAll((as) => as.map((a) => a.getAttribute("href")!)))].filter((h) => h.startsWith("/"));
  const dead: string[] = [];
  for (let i = 0; i < hrefs.length; i += 8) {
    const part = hrefs.slice(i, i + 8);
    const codes = await Promise.all(part.map(async (h) => (await request.get(h)).status()));
    codes.forEach((c, k) => c !== 200 && dead.push(`${part[k]} → ${c}`));
  }
  expect(dead).toEqual([]);
  expect((await request.get("/uk/seasons/2025/99")).status()).toBe(404);
});

test("усі етапи 2025 і 1950 мають сторінку", async ({ request }) => {
  const bad: string[] = [];
  for (const [y, n] of [[2025, 24], [1950, 7]] as const) {
    const codes = await Promise.all(Array.from({ length: n }, (_, i) => request.get(`/seasons/${y}/${i + 1}`).then((r) => r.status())));
    codes.forEach((c, i) => c !== 200 && bad.push(`${y}/${i + 1} → ${c}`));
  }
  expect(bad).toEqual([]);
});

test("1952 Італія: поул лише Аскарі (виправлення з джерелом), Мосс стартував 9-м; без графіка кіл", async ({ page }) => {
  await page.goto("/uk/seasons/1952/8");
  const pole = page.locator(".rc-strip div", { hasText: "Поул" });
  await expect(pole).toContainText("Альберто Аскарі");
  await expect(pole).not.toContainText("Мосс");
  await expect(page.locator(".rc-lc")).toHaveCount(0);
});

test("1988 Сузука англійською: вирішальна гонка", async ({ page }) => {
  await page.goto("/seasons/1988/15");
  await expect(page.locator(".rc-stamp")).toHaveText("Season decider");
  await expect(page.locator(".rc-strip .champ")).toContainText("Senna");
});

test.describe("без JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("графік кіл і таблиці на місці (серверна розмітка)", async ({ page }) => {
    await page.goto("/uk/seasons/2025/24");
    await expect(page.locator(".rc-lc-chart path.ln").first()).toBeVisible();
    await expect(page.locator(".rc-tbl table")).toHaveCount(2);
  });
});

test("метадані: canonical, hreflang, JSON-LD SportsEvent", async ({ page }) => {
  await page.goto("/uk/seasons/2025/24");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/uk\/seasons\/2025\/24$/);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/seasons\/2025\/24$/);
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(ld).toMatchObject({ "@type": "SportsEvent", endDate: "2025-12-07" });
});

for (const theme of ["light", "dark"] as const)
  for (const width of [320, 390, 768, 1280])
    test(`без порушень axe; ніщо не виходить за екран: ${theme}, ${width} px`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/uk/seasons/2025/24");
      // Як на сторінці сезону: для пропущених content-visibility елементів axe бере тло сторінки (урок 3f).
      await page.addStyleTag({ content: ".race-page * { content-visibility: visible !important; }" });
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
  await page.goto("/uk/seasons/2025/24", { waitUntil: "networkidle" });
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.1);
  const { gzipSync } = await import("node:zlib");
  const res = await request.get("/uk/seasons/2025/24", { headers: { "accept-encoding": "gzip" } });
  expect(gzipSync(await res.body()).length).toBeLessThan(100 * 1024);
});
