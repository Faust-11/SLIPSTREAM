import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Новини (фаза 4a). Сервер — зі знімком e2e/fixtures/news (NEWS_FIXTURES=1): 48 заголовків (2 дублі склеєно),
// 40 постів; час зафіксовано, щоб «наступна гонка» й відносний час не залежали від дати прогону.

// Проти продакшну (BASE_URL) новини живі: точні числа знімка (48 / 2 дублі / Лас-Вегас) перевіряємо лише локально,
// там — структуру й лічильники, взяті з самої сторінки (знімок 14.11 збігся з продом випадково: 50 − 2 дублі = 48).
const SNAPSHOT = !process.env.BASE_URL;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-15T12:00:00Z"));
});

test("/uk/news: заголовки трьох видань, пости журналістів, наступна гонка; без помилок у консолі", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const res = await page.goto("/uk/news");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Новини\s+з паддоку$/);
  if (SNAPSHOT) await expect(page.locator(".nw-upd")).toContainText("2 дублі склеєно");
  await expect(page.locator(".nw-src").filter({ hasText: "Formula 1" }).first()).toBeVisible();
  await expect(page.locator(".nw-src").filter({ hasText: "Motorsport.com" }).first()).toBeVisible();
  await expect(page.locator(".nw-next")).toHaveAttribute("href", SNAPSHOT ? "/uk/calendar#r21" : /^\/uk\/calendar#r\d+$/);
  if (SNAPSHOT) await expect(page.locator(".nw-next b")).toHaveText("Гран-прі Лас-Вегаса");
  expect(errors).toEqual([]);
});

test("посилання: видання — https на їхні домени без utm_*, пости — bsky.app; усі в новій вкладці з noopener", async ({ page }) => {
  await page.goto("/uk/news");
  const hl = await page.locator(".nw-hl a").evaluateAll((as) => as.map((a) => [a.getAttribute("href")!, a.getAttribute("rel"), a.getAttribute("target")]));
  expect(hl.length).toBeGreaterThan(40);
  for (const [href, rel, target] of hl) {
    expect(href).toMatch(/^https:\/\/www\.(formula1|motorsport|autosport)\.com\//);
    expect(href).not.toContain("utm_");
    expect([rel, target]).toEqual(["noopener", "_blank"]);
  }
  const po = await page.locator(".nw-open").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  expect(po.length).toBe(SNAPSHOT ? 40 : await page.locator("#nw-bsky > li").count());
  expect(po.every((h) => /^https:\/\/bsky\.app\/profile\/[a-z0-9.-]+\/post\/[a-z0-9]+$/i.test(h))).toBe(true);
  const imgs = await page.locator(".nw-th[src]").evaluateAll((is) => is.map((i) => (i as HTMLImageElement).src));
  expect(imgs.every((s) => /^https:\/\/(media\.formula1\.com|cdn-\d+\.motorsport\.com)\//.test(s))).toBe(true);
});

test("вкладки: «Видання» ховає журналістів, стан у адресі; посилання з ?v=bsky", async ({ page }) => {
  await page.goto("/uk/news");
  await page.getByRole("button", { name: SNAPSHOT ? /Видання · 48/ : /Видання · \d+/ }).click();
  await expect(page.locator(".nw-col-bsky")).toBeHidden();
  await expect(page.locator(".nw-col-rss")).toBeVisible();
  await expect(page).toHaveURL(/v=rss/);
  await page.goto("/uk/news?v=bsky");
  await expect(page.locator(".nw-col-rss")).toBeHidden();
  await expect(page.getByRole("button", { name: SNAPSHOT ? /Журналісти · 40/ : /Журналісти · \d+/ })).toHaveAttribute("aria-pressed", "true");
});

test("посилання з ?v=bsky: одна колонка з першого кадру — без стрибка (CLS < 0.02)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
        if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/uk/news?v=bsky", { waitUntil: "networkidle" });
  await expect(page.locator(".nw-col-rss")).toBeHidden();
  await expect(page.locator("html")).not.toHaveAttribute("data-nw-v", /.*/);
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.02);
});

test("доступність: посилання на пости названо автором; «Показати ще» переводить фокус на перший новий запис", async ({ page }) => {
  await page.goto("/uk/news");
  await expect(page.locator(".nw-open").first()).toHaveAccessibleName(/^Відкрити в Bluesky — пост \S.+$/);
  await page.locator(".nw-col-bsky .nw-more").click();
  await expect(page.locator("#nw-bsky > li").nth(20)).toBeFocused();
});

test("«Показати ще»: 12 → 24 заголовки, 20 → 40 постів, потім кнопки немає", async ({ page }) => {
  await page.goto("/uk/news");
  const hl = page.locator("#nw-rss > li:visible");
  const po = page.locator("#nw-bsky > li:visible");
  await expect(hl).toHaveCount(12);
  await expect(po).toHaveCount(20);
  await page.locator(".nw-col-rss .nw-more").click();
  await expect(hl).toHaveCount(24);
  const total = SNAPSHOT ? 48 : await page.locator("#nw-rss > li").count();
  await expect(page.locator(".nw-col-rss .nw-more")).toHaveText(`Показати ще ${Math.min(12, total - 24)} · лишилось ${total - 24}`);
  await page.locator(".nw-col-bsky .nw-more").click();
  await expect(po).toHaveCount(SNAPSHOT ? 40 : Math.min(40, await page.locator("#nw-bsky > li").count()));
  await expect(page.locator(".nw-col-bsky .nw-more")).toHaveCount(0);
});

test("без JS: усі записи видно, вкладок і «Показати ще» немає, час — UTC", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/uk/news");
  // Локально — точні числа знімка (сервер віддає всі записи); проти продакшну — усі, що є в розмітці (рев'ю PR #21).
  await expect(page.locator("#nw-rss > li:visible")).toHaveCount(SNAPSHOT ? 48 : await page.locator("#nw-rss > li").count());
  await expect(page.locator("#nw-bsky > li:visible")).toHaveCount(SNAPSHOT ? 40 : await page.locator("#nw-bsky > li").count());
  await expect(page.locator(".nw-tabs")).toBeHidden();
  await expect(page.locator(".nw-more")).toHaveCount(2);
  await expect(page.locator(".nw-more").first()).toBeHidden();
  await expect(page.locator(".nw-hl .nw-time").first()).toContainText("UTC");
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await ctx.close();
});

test("ISR: сторінка кешується на 30 хв (s-maxage=1800)", async ({ request, baseURL }) => {
  test.skip(!/localhost/.test(baseURL ?? ""), "заголовок кешу — лише next start (Vercel віддає свої)");
  const res = await request.get("/uk/news");
  expect(res.headers()["cache-control"]).toContain("s-maxage=1800");
});

for (const theme of ["light", "dark"] as const)
  for (const width of [320, 390, 768, 1024, 1280])
    test(`без порушень axe; ніщо не виходить за екран: ${theme}, ${width} px`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/uk/news");
      await expectNoA11yViolations(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });

test("CLS < 0.1 (390 px); розмір HTML ≤ 60 КБ gzip", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
        if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/uk/news", { waitUntil: "networkidle" });
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.1);
  const { gzipSync } = await import("node:zlib");
  const res = await request.get("/uk/news");
  expect(gzipSync(await res.body()).length).toBeLessThan(60 * 1024);
});
