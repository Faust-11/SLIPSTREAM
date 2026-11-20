import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Сторінка пілота (фаза 3d). Точні числа — на пілотах, чия кар'єра завершена (не змінюються з новими гонками):
// Сенна — Вікіпедія: 161 старт, 41 перемога, 80 подіумів, 65 поулів, 610 зарахованих очок, 3 титули.

test("/uk/drivers/senna: банер, факти, підсумки з бази", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const res = await page.goto("/uk/drivers/senna");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Айртон Сенна");
  await expect(page.locator(".th-stamp")).toHaveText("Чемпіон світу ×3: 1988, 1990, 1991");
  // Найшвидших кіл немає: дані Jolpica повні лише з 2004 — неповне число не показуємо.
  await expect(page.locator(".ts b")).toHaveText(["161", "41", "80", "65", "610", "3"]);
  await expect(page.locator(".ts")).not.toContainText("найшвидш");
  const facts = page.locator(".dh-facts");
  await expect(facts).toContainText("Бразилія");
  await expect(facts).toContainText("21 березня 1960 р. — 1 травня 1994 р.");
  await expect(facts).toContainText("Гран-прі Бразилії 1984");
  await expect(facts).toContainText("Остання гонка");
  await expect(page.locator(".sec:has(#s-seasons) tbody tr")).toHaveCount(11);
  expect(errors).toEqual([]);
});

test("/drivers/senna англійською: розряди й підписи EN", async ({ page }) => {
  await page.goto("/drivers/senna");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ayrton Senna");
  await expect(page.getByRole("heading", { level: 2, name: "41 wins" })).toBeVisible();
  await expect(page.locator(".th-stamp")).toHaveText("3× World Champion: 1988, 1990, 1991");
});

test("Гамілтон: найшвидші кола є (кар'єра з 2007), вік, Instagram, напарники з кваліфікаціями, фільтр перемог", async ({ page }) => {
  await page.goto("/uk/drivers/hamilton");
  // Форма слова залежить від числа (70 кіл, 71 коло) — перевіряємо основу.
  await expect(page.locator(".ts")).toContainText(/найшвидш/);
  await expect(page.locator(".dh-facts")).toContainText("7 січня 1985 р. (");
  await expect(page.getByRole("link", { name: /Instagram/ })).toHaveAttribute("href", "https://www.instagram.com/lewishamilton/");
  const alonso = page.locator(".mt", { hasText: "Фернандо Алонсо" });
  await expect(alonso.locator(".hn")).toHaveText(["7", "10", "9", "8"]);
  await expect(alonso.getByRole("link", { name: "Фернандо Алонсо" })).toHaveAttribute("href", "/uk/drivers/alonso");
  await expect(alonso.getByRole("link", { name: "McLaren" })).toHaveAttribute("href", "/uk/teams/mclaren");
  // Перемоги: перша — Канада 2007; фільтр за командою лишає наскрізні номери.
  await expect(page.locator(".wfeat li").first()).toContainText("Гран-прі Канади");
  await page.locator(".sec:has(#s-wins) summary").click();
  const chips = page.getByRole("group", { name: "Перемоги за командами" });
  await chips.getByRole("button", { name: /McLaren/ }).click();
  await expect(page.locator(".wlist li")).toHaveCount(21);
  await expect(page.locator(".wlist li").last()).toHaveAttribute("value", "1");
  await expect(chips.getByRole("button", { name: /McLaren/ })).toHaveAttribute("aria-pressed", "true");
  await chips.getByRole("button", { name: "Усі" }).click();
  await expect(page.locator(".wlist li").first()).toContainText("старт P");
});

test("Сенна — Прост: лише гонки (кваліфікацій до 1994 немає в даних)", async ({ page }) => {
  await page.goto("/uk/drivers/senna");
  const prost = page.locator(".mt", { hasText: "Ален Прост" });
  await expect(prost.locator(".hb")).toHaveCount(1);
  await expect(prost.locator(".hn")).toHaveText(["18", "13"]);
});

test("Шумахер 1997 — DSQ з поясненням, 78 очок збережено", async ({ page }) => {
  await page.goto("/uk/drivers/michael-schumacher");
  const row = page.locator(".sec:has(#s-seasons) tbody tr", { hasText: "1997" });
  await expect(row.locator("abbr")).toHaveText("DSQ");
  await expect(row.locator("abbr")).toHaveAttribute("title", "Виключено з підсумкового заліку");
  await expect(row).toContainText("78");
});

test("невідомий пілот і id з підкресленням — 404", async ({ page }) => {
  expect((await page.goto("/uk/drivers/nope"))?.status()).toBe(404);
  expect((await page.goto("/drivers/max_verstappen"))?.status()).toBe(404);
  expect((await page.goto("/drivers/max-verstappen"))?.status()).toBe(200);
});

test("пілот з одним стартом (Walt Ader): без порожніх блоків, нулів і фото", async ({ page }) => {
  await page.goto("/drivers/ader");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Walt Ader");
  await expect(page.locator(".ts b")).toHaveText(["1"]);
  await expect(page.locator(".th-stamp, #s-wins, #s-mates, #s-miles, svg.sb")).toHaveCount(0);
  await expect(page.locator(".sec:has(#s-seasons) tbody tr")).toHaveCount(1);
});

test("посилання на пілотів: список, картки сезону, сторінка команди; хлібні крихти — назад", async ({ page }) => {
  await page.goto("/uk/drivers");
  await page.locator(".drv-now").getByRole("link").first().click();
  await expect(page).toHaveURL(/\/uk\/drivers\/[a-z0-9-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Пілоти" }).click();
  await expect(page).toHaveURL(/\/uk\/drivers$/);
  await page.locator(".dt tbody").getByRole("link").first().click();
  await expect(page).toHaveURL(/\/uk\/drivers\/[a-z0-9-]+$/);
  await page.goto("/uk/teams/mclaren");
  await page.locator(".champs").getByRole("link", { name: "Айртон Сенна" }).click();
  await expect(page).toHaveURL(/\/uk\/drivers\/senna$/);
});

test("жодного мертвого посилання на пілота: McLaren, Ferrari, перша сторінка таблиці, Гамілтон", async ({ page, request }) => {
  test.setTimeout(120_000);
  const hrefs = new Set<string>();
  for (const url of ["/uk/teams/mclaren", "/teams/ferrari", "/uk/drivers", "/uk/drivers/hamilton", "/drivers/fangio"]) {
    await page.goto(url);
    for (const h of await page.locator('a[href*="/drivers/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")!)))
      hrefs.add(h);
  }
  expect(hrefs.size).toBeGreaterThan(40);
  // Пакетами по 8: послідовно ~130 запитів проти продакшну не вкладались у 30 с (12.11 — тайм-аут тесту, не сайту).
  const dead: string[] = [];
  const list = [...hrefs];
  for (let i = 0; i < list.length; i += 8) {
    const part = list.slice(i, i + 8);
    const codes = await Promise.all(part.map(async (h) => (await request.get(h)).status()));
    codes.forEach((c, k) => c !== 200 && dead.push(`${part[k]} → ${c}`));
  }
  expect(dead).toEqual([]);
});

test.describe("без JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("графік, підсумки, таблиця й усі перемоги на місці; фільтра перемог немає", async ({ page }) => {
    await page.goto("/uk/drivers/senna");
    await expect(page.locator("svg.sb")).toBeVisible();
    await expect(page.locator(".ts b").first()).toHaveText("161");
    await expect(page.locator(".wlist li")).toHaveCount(41);
    await expect(page.locator(".wchips")).toBeHidden();
  });
  test("повний перелік пілотів — посилання на сторінки", async ({ page }) => {
    await page.goto("/uk/drivers/all");
    await expect(page.locator('.drv-noscript a[href="/uk/drivers/senna"]')).toHaveText("Айртон Сенна");
  });
});

test("метадані: canonical, hreflang, JSON-LD Person", async ({ page }) => {
  await page.goto("/uk/drivers/senna");
  await expect(page).toHaveTitle(/Айртон Сенна/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/uk\/drivers\/senna$/);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/drivers\/senna$/);
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}");
  expect(ld).toMatchObject({ "@type": "Person", name: "Айртон Сенна", alternateName: "Ayrton Senna", birthDate: "1960-03-21", deathDate: "1994-05-01" });
});

for (const theme of ["light", "dark"] as const)
  for (const width of [390, 1280])
    test(`без порушень axe: ${theme}, ${width} px — Гамілтон, Сенна, Фанхіо, пілот з одним стартом`, async ({ page }) => {
      // Чотири сторінки з axe поспіль: проти продакшну на завантаженій машині 30 с не вистачало (12.11 — тайм-аут, не порушення).
      test.setTimeout(90_000);
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      for (const id of ["hamilton", "senna", "fangio", "ader"]) {
        await page.goto(`/uk/drivers/${id}`);
        // Згорнуті переліки (усі перемоги, решта напарників) — теж під перевірку.
        await page.locator("details.more").evaluateAll((ds) => ds.forEach((d) => ((d as HTMLDetailsElement).open = true)));
        await expectNoA11yViolations(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), id).toBeLessThanOrEqual(0);
      }
    });

test("CLS < 0.1 (390 px) і портрет — кандидат LCP з fetchpriority=high", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
        if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/uk/drivers/hamilton", { waitUntil: "networkidle" });
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.1);
  await expect(page.locator(".dh-photo img")).toHaveAttribute("fetchpriority", "high");
});

test("розмір HTML найбільших сторінок (Гамілтон, Джек Бребем — 27 напарників) — ≤ 150 КБ gzip", async ({ request }) => {
  const { gzipSync } = await import("node:zlib");
  for (const id of ["hamilton", "jack-brabham"]) {
    const res = await request.get(`/uk/drivers/${id}`, { headers: { "accept-encoding": "gzip" } });
    expect(res.status()).toBe(200);
    expect(gzipSync(await res.body()).length, id).toBeLessThan(150 * 1024);
  }
});
