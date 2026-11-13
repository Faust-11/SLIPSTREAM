import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Сторінка сезону (фаза 3f). Еталони — макет 2025 і заміри (docs/decisions.md, «Фаза 3f»): числа завершених сезонів не змінюються.

test("/uk/seasons/2025: банер, ключові числа, битва за титул, претенденти (макет)", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const res = await page.goto("/uk/seasons/2025");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Сезон 2025");
  await expect(page.locator(".sh p")).toContainText("Ландо Норріс виграв титул для McLaren з перевагою 2 очки");
  await expect(page.locator(".sk li")).toHaveText([/^24\s*гонки/, /^6\s*спринтів/, /^4\s*різні переможці/, /^2\s*очки між першим і другим/, /^14\s*перемог McLaren з 24/]);
  const fight = page.locator(".fight");
  await expect(fight.locator(".fc-legend li")).toHaveText(["Норріс", "Ферстаппен", "Піастрі", "Расселл"]);
  await expect(fight.locator(".fc-strip li")).toHaveCount(24);
  await expect(fight.getByRole("img", { name: /Очки після кожного етапу: Норріс, Ферстаппен, Піастрі, Расселл/ })).toBeVisible();
  await expect(fight.locator(".story")).toContainText("Після етапу 15 (Зандворт) Ферстаппен відставав від лідера на 104 очки");
  await expect(fight.locator(".story")).toContainText("Лідер змінювався 2 рази");
  const cons = page.locator(".con");
  await expect(cons).toHaveCount(3);
  await expect(cons.nth(0)).toContainText("Чемпіон");
  await expect(cons.nth(1)).toContainText("−2 оч.");
  await expect(cons.nth(2).locator(".roundel")).toHaveText("81");
  expect(errors).toEqual([]);
});

test("календар 2025: 24 етапи, 6 спринтів, Лас-Вегас — дискваліфікація McLaren, Абу-Дабі — вирішальна", async ({ page }) => {
  await page.goto("/uk/seasons/2025");
  const races = page.locator(".cal .race");
  await expect(races).toHaveCount(24);
  await expect(page.locator(".cal abbr.tag")).toHaveCount(6);
  await expect(races.filter({ hasText: "Лас-Вегас" })).toContainText("Дискваліфіковано: Норріс, Піастрі");
  await expect(page.locator(".cal .decider")).toHaveCount(1);
  await expect(page.locator(".cal .decider")).toContainText("Абу-Дабі");
  await expect(page.locator(".cal .decider")).toContainText("Титул вирішено");
  await expect(races.first()).toContainText("Мельбурн");
});

test("таблиці 2025: пілоти від Норріса, конструктори від McLaren; посилання — на існуючі сторінки", async ({ page, request }) => {
  await page.goto("/uk/seasons/2025");
  const [drivers, teams] = [page.locator("table.st").nth(0), page.locator("table.st").nth(1)];
  await expect(drivers.locator("caption")).toHaveText("Пілоти");
  await expect(drivers.locator("tbody tr").first()).toContainText("Ландо Норріс");
  await expect(drivers.locator("tbody tr").first().locator(".st-pts")).toHaveText("423");
  await expect(teams.locator("tbody tr").first()).toContainText("McLaren");
  const hrefs = [...new Set(await page.locator("main a, .season-page a").evaluateAll((as) => as.map((a) => a.getAttribute("href")!)))].filter(
    (h) => h.startsWith("/"),
  );
  const dead: string[] = [];
  for (let i = 0; i < hrefs.length; i += 8) {
    const part = hrefs.slice(i, i + 8);
    const codes = await Promise.all(part.map(async (h) => (await request.get(h)).status()));
    codes.forEach((c, k) => c !== 200 && dead.push(`${part[k]} → ${c}`));
  }
  expect(dead).toEqual([]);
});

test("1988: зараховано лише кращі результати — Прост більше загалом; вирішено в Сузуці", async ({ page }) => {
  await page.goto("/uk/seasons/1988");
  const story = page.locator(".story");
  await expect(story).toContainText("Прост набрав більше очок загалом (105 проти 94)");
  await expect(story).toContainText("Титул вирішено після етапу 15 (Судзука)");
  await expect(page.locator(".cal .decider")).toContainText("Судзука");
});

test("1997: Шумахер виключений — у тексті й таблиці з позначкою, на графіку є", async ({ page }) => {
  await page.goto("/seasons/1997");
  await expect(page.locator(".story")).toContainText("was excluded from the final standings");
  await expect(page.locator("table.st").first().locator("tbody tr").last()).toContainText("excluded");
  await expect(page.locator(".fc-legend")).toContainText("Schumacher");
});

test("1950: без Кубка конструкторів і попереднього сезону; Indy 500 у календарі", async ({ page }) => {
  await page.goto("/uk/seasons/1950");
  await expect(page.locator(".sh p")).toContainText("Кубка конструкторів ще не було");
  await expect(page.locator("table.st")).toHaveCount(1);
  await expect(page.locator(".sp-crumbs .nb")).toHaveText(["1951 ›"]);
  await expect(page.locator(".cal")).toContainText("Індіанаполіс");
});

test("усі сезони мають сторінку; рік на картці списку — посилання на неї", async ({ page, request }) => {
  await page.goto("/uk/seasons");
  const links = page.locator(".slot a.yr");
  const years = (await links.allTextContents()).map(Number);
  expect(years.length).toBeGreaterThanOrEqual(77);
  const bad: string[] = [];
  for (let i = 0; i < years.length; i += 8) {
    const part = years.slice(i, i + 8);
    const codes = await Promise.all(part.map(async (y) => (await request.get(`/uk/seasons/${y}`)).status()));
    codes.forEach((c, k) => c !== 200 && bad.push(`${part[k]} → ${c}`));
  }
  expect(bad).toEqual([]);
  await expect(links.filter({ hasText: "1988" })).toHaveAccessibleName("Сезон 1988");
  await links.filter({ hasText: "1988" }).click();
  await expect(page).toHaveURL(/\/uk\/seasons\/1988$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Сезон 1988");
  expect((await request.get("/uk/seasons/1949")).status()).toBe(404);
});

test.describe("без JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("графік, календар і таблиці на місці (серверна розмітка)", async ({ page }) => {
    await page.goto("/uk/seasons/2025");
    await expect(page.locator(".fc-chart path.ln")).toHaveCount(4);
    await expect(page.locator(".cal .race")).toHaveCount(24);
    await expect(page.locator("table.st")).toHaveCount(2);
  });
});

test("метадані: canonical, hreflang, JSON-LD SportsEvent", async ({ page }) => {
  await page.goto("/uk/seasons/2025");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/uk\/seasons\/2025$/);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/seasons\/2025$/);
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(ld).toMatchObject({ "@type": "SportsEvent", name: "Сезон 2025", startDate: "2025-03-16", endDate: "2025-12-07" });
  // 2026: скасований етап (Саудівська Аравія, 19 квітня) не стає кінцем сезону (рев'ю 13.11).
  await page.goto("/uk/seasons/2026");
  const ld26 = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(ld26.endDate > "2026-11-01").toBe(true);
});

for (const theme of ["light", "dark"] as const)
  for (const width of [320, 390, 768, 1280])
    test(`без порушень axe; ніщо не виходить за екран: ${theme}, ${width} px`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/uk/seasons/2025");
      // Картки нижче першого екрана — з content-visibility: auto; для пропущеного елемента axe бере тло сторінки замість
      // тла картки (замір 13.11: «вирішальна» картка — 1,44:1 з увімкненою, 0 порушень з вимкненою; насправді ~11:1).
      // Перевіряємо сторінку такою, якою її бачать після прокрутки.
      await page.addStyleTag({ content: ".season-page * { content-visibility: visible !important; }" });
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
  await page.goto("/uk/seasons/2025", { waitUntil: "networkidle" });
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.1);
  const { gzipSync } = await import("node:zlib");
  const res = await request.get("/uk/seasons/2025", { headers: { "accept-encoding": "gzip" } });
  expect(gzipSync(await res.body()).length).toBeLessThan(100 * 1024);
});
