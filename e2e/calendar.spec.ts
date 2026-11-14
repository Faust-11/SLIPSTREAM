import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Календар поточного сезону (фаза 3i). Еталони — макет «Календар 2026» і фікстура db.yml; час зафіксовано (page.clock),
// щоб «наступна гонка» не залежала від дати прогону.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-15T12:00:00Z"));
});

test("/uk/calendar: 2026, 20 з 23, чемпіон Антонеллі, Кубок Mercedes, 6 спринтів; наступна — Лас-Вегас", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const res = await page.goto("/uk/calendar");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Календар\s*2026/);
  await expect(page.locator(".cl-stamp")).toHaveText("Сезон 2026 · проведено 20 з 23 етапів");
  await expect(page.locator(".cl-kf")).toContainText("Чемпіон");
  await expect(page.locator(".cl-kf")).toContainText("Антонеллі");
  await expect(page.locator(".cl-kf")).toContainText("Mercedes");
  await expect(page.locator(".cl-next .cl-next-name")).toHaveText("Гран-прі Лас-Вегаса");
  await expect(page.locator(".cl-count b").first()).toHaveText("6"); // 15.11 12:00 → 22.11 04:00 = 6 дн 16 год
  await expect(page.locator(".cl-strip > li")).toHaveCount(23);
  await expect(page.locator(".cl-grid > li")).toHaveCount(23);
  await expect(page.locator(".cl-cancel")).toContainText("Гран-прі Саудівської Аравії");
  expect(errors).toEqual([]);
});

test("місцевий час: пояс браузера (Europe/Kyiv) — FP1 Лас-Вегаса 20.11 02:30; без JS — UTC", async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: "Europe/Kyiv" });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date("2026-11-15T12:00:00Z"));
  await page.goto("/uk/calendar");
  await expect(page.locator("#r21 .cl-sess time").first()).toContainText("02:30");
  // Chrome віддає застарілий псевдонім «Europe/Kiev» — показуємо те, що повідомив браузер.
  await expect(page.locator(".cl-tz")).toContainText(/Europe\/Ki(y|e)v/);
  await ctx.close();
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const p2 = await noJs.newPage();
  await p2.goto("/uk/calendar");
  await expect(p2.locator("#r21 .cl-sess time").first()).toHaveText("пт, 20 лист. · 00:30");
  await expect(p2.locator(".cl-tz")).toHaveText("Час — UTC.");
  // Без JS фільтр не працює — чипи сховано; на 320 px нічого не виходить за екран.
  await expect(p2.locator(".cl-chips")).toBeHidden();
  await p2.setViewportSize({ width: 320, height: 800 });
  expect(await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await noJs.close();
});

test("після старту гонки до оновлення даних: наступна — Катар і в банері, і в смузі та картках; етап 21 — «стартувала»", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-23T10:00:00Z"));
  await page.goto("/uk/calendar");
  await expect(page.locator(".cl-next .cl-next-name")).toHaveText("Гран-прі Катару");
  await expect(page.locator(".cl-next-note")).toContainText("етапу 21");
  // Рев'ю PR #19: смуга й картки лишались у стані збірки (Лас-Вегас — «наступний»).
  await expect(page.locator("#r21")).toHaveAttribute("data-live", "started");
  await expect(page.locator("#r21 .cl-wait")).toBeVisible();
  await expect(page.locator("#r22")).toHaveAttribute("data-live", "next");
  await expect(page.locator(".cl-strip > li").nth(20)).toHaveAttribute("data-live", "started");
  await expect(page.locator(".cl-strip > li").nth(21)).toHaveAttribute("data-live", "next");
  await expect(page.locator("#r22 .cl-wait")).toBeHidden();
});

test("фінал до оновлення даних: остання гонка стартувала — «Етап 23 · Абу-Дабі», а не «сезон завершено»", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-12-06T13:00:10Z"));
  await page.goto("/uk/calendar");
  await expect(page.locator(".cl-next-k")).toHaveText("Етап 23");
  await expect(page.locator(".cl-next .cl-next-name")).toHaveText("Гран-прі Абу-Дабі");
  await expect(page.locator(".cl-next-note")).toContainText("етапу 23");
  await expect(page.locator(".cl-next")).not.toContainText("завершено");
  await expect(page.locator(".cl-count")).toHaveCount(0);
});

test("відлік: хвилини змінюються на межі хвилини, без запізнення", async ({ page }) => {
  // 22.11 04:00 − 15.11 12:00:50 = 6 дн 15 год 59 хв 10 с → «59»; о 12:01:00 лишається 58 хв 60 с → «58» одразу на межі
  // (рев'ю PR #19: інтервал від монтування й округлений знімок давали запізнення до ~60 с).
  await page.clock.install({ time: new Date("2026-11-15T12:00:50Z") });
  await page.goto("/uk/calendar");
  await expect(page.locator(".cl-count b").nth(2)).toHaveText("59");
  await page.clock.runFor(12_000); // 12:01:02 — тік на межі 12:01:00 уже спрацював
  await expect(page.locator(".cl-count b").nth(2)).toHaveText("58");
});

test("місцева дата картки — у поясі браузера, як і сесії (America/Los_Angeles: Лас-Вегас — 21 листопада)", async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: "America/Los_Angeles" });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date("2026-11-15T12:00:00Z"));
  await page.goto("/uk/calendar");
  await expect(page.locator("#r21 .cl-sess li.race time")).toContainText("21 лист. · 20:00");
  await expect(page.locator("#r21 .cl-dt")).toHaveText("21 лист.");
  await ctx.close();
});

test("посилання на сховану фільтром картку скидає фільтр на «Усі»", async ({ page }) => {
  await page.goto("/uk/calendar?f=done");
  await expect(page.locator("#r21")).toBeHidden();
  await expect(page.locator("#r21")).toHaveAttribute("data-live", "next"); // гідратовано: обробник кліку вже є
  await page.locator(".cl-strip > li").nth(20).locator("a").click();
  await expect(page.locator("#r21")).toBeVisible();
  await expect(page).not.toHaveURL(/f=done/);
  await expect(page.getByRole("button", { name: /Усі · 23/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Минули · 20/ }).click();
  await page.locator(".cl-next-name a").click();
  await expect(page.locator("#r21")).toBeInViewport();
});

test("опис сторінки — правильна множина («усі 23 етапи»)", async ({ page }) => {
  await page.goto("/uk/calendar");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /усі 23 етапи —/);
});

test("фільтр етапів: стан в адресі, role=status, посилання з ?f=", async ({ page }) => {
  await page.goto("/uk/calendar");
  await page.getByRole("button", { name: /Спринт-вікенди · 6/ }).click();
  await expect(page.locator(".cl-grid > li:visible")).toHaveCount(6);
  await expect(page.locator(".cl-count-st")).toHaveText("6 етапів");
  await expect(page).toHaveURL(/f=sprint/);
  await page.goto("/uk/calendar?f=ahead");
  await expect(page.locator(".cl-grid > li:visible")).toHaveCount(3);
  await expect(page.getByRole("button", { name: /Попереду · 3/ })).toHaveAttribute("aria-pressed", "true");
});

test("посилання: проведений етап → сторінка гонки, траса → сторінка траси; усі посилання існують", async ({ page, request }) => {
  await page.goto("/uk/calendar");
  await expect(page.locator("#r1 h3 a")).toHaveAttribute("href", "/uk/seasons/2026/1");
  await expect(page.locator("#r1 .cl-circ")).toHaveAttribute("href", "/uk/circuits/albert-park");
  const hrefs = [...new Set(await page.locator(".cl-page a").evaluateAll((as) => as.map((a) => a.getAttribute("href")!)))].filter((h) => h.startsWith("/"));
  const dead: string[] = [];
  for (let i = 0; i < hrefs.length; i += 8) {
    const part = hrefs.slice(i, i + 8);
    const codes = await Promise.all(part.map(async (h) => (await request.get(h)).status()));
    codes.forEach((c, k) => c !== 200 && dead.push(`${part[k]} → ${c}`));
  }
  expect(dead).toEqual([]);
});

test("залік: перша десятка пілотів і посилання на повний залік сезону", async ({ page }) => {
  await page.goto("/uk/calendar");
  await expect(page.getByRole("table", { name: /перша десятка/ }).locator("tbody tr")).toHaveCount(10);
  await expect(page.locator(".cl-more")).toHaveAttribute("href", "/uk/seasons/2026");
});

for (const theme of ["light", "dark"] as const)
  for (const width of [320, 390, 768, 1024, 1280])
    test(`без порушень axe; ніщо не виходить за екран: ${theme}, ${width} px`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/uk/calendar");
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
  await page.goto("/uk/calendar", { waitUntil: "networkidle" });
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.1);
  const { gzipSync } = await import("node:zlib");
  const res = await request.get("/uk/calendar");
  expect(gzipSync(await res.body()).length).toBeLessThan(100 * 1024);
});
