import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Головна (фаза 4b). Еталони — фікстура db.yml (сезон 2026: 20 з 23, чемпіон Антонеллі) і макет головної; час
// зафіксовано (page.clock), щоб відлік не залежав від дати прогону.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-15T12:00:00Z"));
});

test("/uk: герой, чемпіон, смуга сезону, остання й наступна гонка, залік, рекорди", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const res = await page.goto("/uk");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Уся Формула-1. Коло за колом.");
  await expect(page.locator(".hm-meta")).toContainText("Сезон 2026 · 20 з 23 етапів позаду");
  await expect(page.locator(".hm-stamp-champ")).toHaveText("Чемпіон світу 2026");
  await expect(page.locator(".hm-champ-name")).toContainText("Антонеллі");
  await expect(page.locator(".hm-rail-cell")).toHaveCount(23);
  await expect(page.locator(".hm-rail-cell.hm-rail-next")).toHaveCount(1);
  await expect(page.locator(".hm-rail-cell.hm-rail-next .num")).toHaveText("21");
  await expect(page.locator("#hm-last-h")).toHaveText("Гран-прі Бразилії");
  await expect(page.locator(".hm-tbl tbody tr")).toHaveCount(10);
  await expect(page.locator(".hm-podium > li")).toHaveCount(3);
  await expect(page.locator("#hm-next-h")).toHaveText("Гран-прі Лас-Вегаса");
  await expect(page.locator(".hm-count b").first()).toHaveText("6"); // 15.11 12:00 → 22.11 04:00 = 6 дн 16 год
  await expect(page.locator(".hm-map svg path")).toHaveCount(2);
  expect(await page.locator("#hm-st-0 > li").count()).toBeGreaterThan(10);
  await expect(page.locator(".hm-rec").nth(2).locator(".hm-rec-top")).toContainText("Ferrari");
  // Рішення 14.11: кнопка гри веде на /game; блоків «Історії» / «Новачкам» / «Гра» і кнопки прогнозу на головній немає.
  await expect(page.getByRole("link", { name: "Проїхати гаряче коло →" })).toHaveAttribute("href", "/uk/game");
  await expect(page.getByText("Мій прогноз на подіум")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("/: англійська, h1 і кнопка результатів ведуть на сторінку гонки", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("All of Formula 1. Lap by lap.");
  await expect(page.getByRole("link", { name: /^Results: / })).toHaveAttribute("href", "/seasons/2026/20");
});

test("усі внутрішні посилання головної існують", async ({ page, request }) => {
  await page.goto("/uk");
  const hrefs = await page.locator('main a[href^="/"]').evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!.split("#")[0]!))]);
  expect(hrefs.length).toBeGreaterThan(20);
  for (const h of hrefs) expect((await request.get(h)).status(), h).toBe(200);
});

test("перемикач заліку: «Команди» прокручує до панелі команд і стає активним", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/uk");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  const tabs = page.locator(".hm-standings .hm-tabs button");
  await expect(tabs.first()).toHaveAttribute("aria-pressed", "true");
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.locator("#hm-st").evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
  await expect(page.locator("#hm-st-1 > li").first()).toBeInViewport();
});

test("новини: клієнт підвантажує /api/news (знімок e2e/fixtures/news) — по 10 заголовків і постів, посилання назовні", async ({ page }) => {
  await page.goto("/uk");
  await expect(page.locator("#hm-nw-0 > li")).toHaveCount(10);
  await expect(page.locator("#hm-nw-1 .hm-posts > li")).toHaveCount(10);
  await expect(page.locator("#hm-nw-0 a").first()).toHaveAttribute("href", /^https:\/\//);
  // Пост: доступна назва посилання — не лише час, а й автор.
  await expect(page.locator("#hm-nw-1 .hm-post-link").first()).toContainText("пост");
  // Прев'ю видань — як на /news (відгук користувача 15.11).
  await expect(page.locator("#hm-nw-0 img.hm-th").first()).toBeAttached();
  // Прев'ю — мініатюра 112 px поруч із заголовком, а не на всю колонку; заголовок без підкреслення (лише при наведенні).
  const look = await page.locator("#hm-nw-0 > li").first().evaluate((li) => ({
    th: li.querySelector("img")!.getBoundingClientRect().width,
    deco: getComputedStyle(li.querySelector(".hm-hl-t")!).textDecorationLine,
  }));
  expect(look.th).toBeLessThanOrEqual(120);
  expect(look.deco).toBe("none");
});

test("широкий екран: колонка журналістів не нижча за заголовки — зайві пости сховані цілими (відгук 15.11)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/uk");
  await expect(page.locator("#hm-nw-0 > li")).toHaveCount(10);
  await page.locator("#hm-nw-0 img").evaluateAll((imgs) => Promise.all(imgs.map((i) => ((i as HTMLImageElement).loading = "eager"))));
  await expect
    .poll(() =>
      page.evaluate(() => {
        const h = document.getElementById("hm-nw-0")!.getBoundingClientRect();
        const posts = [...document.querySelectorAll<HTMLElement>("#hm-nw-1 .hm-posts > li:not([hidden])")];
        return posts.length > 0 && posts.at(-1)!.getBoundingClientRect().bottom <= h.bottom + 1;
      }),
    )
    .toBe(true);
});

test("схема наступної траси: значок рухається (animateMotion по тому самому шляху); «менше руху» — схований", async ({ page }) => {
  await page.goto("/uk");
  await expect(page.locator(".hm-map-car animateMotion mpath")).toHaveAttribute("href", "#hm-map-route");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".hm-map-car")).toBeHidden();
});

test("гонка стартувала до оновлення даних: «стартувала», відлік — до етапу 22 (як календар)", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-22T05:00:00Z"));
  await page.goto("/uk");
  await expect(page.locator(".hm-count-note")).toContainText("етап 22");
  await expect(page.locator(".hm-count b").first()).toHaveText("7"); // 22.11 05:00 → Катар 29.11 16:00 = 7 дн 11 год
});

test("чемпіонат і рекорди (1280): низ трьох списків рекордів = низ панелі заліку; «Повний залік» — рівні відступи (відгук 15.11)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/uk");
  const m = await page.evaluate(() => {
    const r = (el: Element) => el.getBoundingClientRect();
    const panel = r(document.getElementById("hm-st-0")!);
    const link = r(document.querySelector(".hm-standings > .hm-more")!);
    const col = r(document.querySelector(".hm-standings")!);
    const lists = [...document.querySelectorAll(".hm-rec-list")].map((l) => r(l).bottom);
    const rec = r(document.querySelector(".hm-records")!);
    return { panelBottom: panel.bottom, above: link.top - panel.bottom, below: col.bottom - link.bottom, lists, recBottom: rec.bottom, colBottom: col.bottom };
  });
  expect(Math.abs(m.above - m.below)).toBeLessThanOrEqual(2);
  for (const b of m.lists) expect(Math.abs(b - m.panelBottom)).toBeLessThanOrEqual(2);
  expect(Math.abs(m.recBottom - m.colBottom)).toBeLessThanOrEqual(1);
  // Списки прокручуються, як у макеті: у кожному рекордсменів більше, ніж уміщається.
  for (const over of await page.locator(".hm-rec-list").evaluateAll((ls) => ls.map((l) => l.scrollHeight > l.clientHeight))) expect(over).toBe(true);
});

test("рекорди на телефоні — вкладки «Перемоги / Титули / Кубки» в одному блоці (відгук 15.11)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/uk");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  const tabs = page.locator(".hm-records .hm-tabs button");
  await expect(tabs).toHaveCount(3);
  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#hm-rc-2 .hm-rec-top")).toBeInViewport();
});

test("автори фото — найнижчий рядок підвалу, без окремого блока між сторінкою й підвалом (відгук 15.11)", async ({ page }) => {
  await page.goto("/uk");
  const m = await page.evaluate(() => {
    const c = document.querySelector(".page-credits")!.getBoundingClientRect();
    const f = document.querySelector(".site-foot")!.getBoundingClientRect();
    return { gap: c.top - f.bottom, docEnd: document.documentElement.scrollHeight - (c.bottom + window.scrollY) };
  });
  expect(Math.abs(m.gap)).toBeLessThanOrEqual(1);
  expect(Math.abs(m.docEnd)).toBeLessThanOrEqual(1);
});

test.describe("без JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("обидві панелі заліку — у серверній розмітці; відлік — «—»; новин немає, є посилання «Усі новини»", async ({ page }) => {
    await page.goto("/uk");
    expect(await page.locator("#hm-st-0 > li").count()).toBeGreaterThan(10);
    await expect(page.locator("#hm-st-1 > li").first()).toBeAttached();
    await expect(page.locator(".hm-count b").first()).toHaveText("—");
    await expect(page.getByRole("link", { name: "Усі новини →" })).toHaveAttribute("href", "/uk/news");
  });
});

for (const theme of ["light", "dark"] as const)
  for (const width of [320, 390, 768, 1024, 1280])
    test(`без порушень axe; ніщо не виходить за екран: ${theme}, ${width} px`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/uk");
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
  await page.goto("/uk", { waitUntil: "load" });
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.1);
  const { gzipSync } = await import("node:zlib");
  const res = await request.get("/uk");
  expect(gzipSync(await res.body()).length).toBeLessThan(100 * 1024);
});
