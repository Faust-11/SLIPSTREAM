import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Траси (фаза 3h). Еталони — макети «Список трас» і «Траса: Яс-Марина», заміри — docs/decisions.md («Фаза 3h»).

test("/uk/circuits: 78 трас, 34 країни, 23 у календарі; Монца перша (76 гонок)", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const res = await page.goto("/uk/circuits");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Траси");
  await expect(page.locator(".facts")).toContainText("78");
  await expect(page.locator(".facts")).toContainText("34");
  await expect(page.locator(".facts")).toContainText("у календарі 2026");
  const cards = page.locator(".ct-grid > li");
  // Перший екран — 24 картки (як у «Командах»), решта — «Показати ще».
  await expect(cards).toHaveCount(24);
  await page.locator(".ct-more").click();
  await expect(cards).toHaveCount(48);
  await expect(cards.nth(24).locator("h3 a")).toBeFocused();
  await expect(cards.first()).toContainText("Autodromo Nazionale di Monza");
  await expect(cards.first()).toContainText("1950–1979, 1981–2026");
  await expect(cards.first().locator(".ct-n")).toHaveText("76");
  expect(errors).toEqual([]);
});

test("пошук, фільтр і сортування — стан в адресі; результат оголошує role=status", async ({ page }) => {
  await page.goto("/uk/circuits");
  await page.getByRole("searchbox", { name: "Пошук траси" }).fill("японія");
  await expect(page.locator(".ct-grid > li")).toHaveCount(3); // Сузука, Фудзі, Окаяма (код країни JPN, фікстура)
  await expect(page).toHaveURL(/\?q=/);
  await page.getByRole("searchbox", { name: "Пошук траси" }).fill("");
  await page.getByRole("button", { name: "Календар 2026" }).click();
  await expect(page.getByRole("button", { name: "Календар 2026" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".ct-grid > li")).toHaveCount(23);
  await expect(page.locator(".ct-count")).toHaveText("23 траси");
  await expect(page).toHaveURL(/f=cal/);
  await page.getByLabel("Сортувати").selectOption("y0");
  // Найстаріші: з 1950 — кілька трас, рівні — за кількістю гонок (Монца 76).
  await expect(page.locator(".ct-grid > li").first()).toContainText("Monza");
  await page.goto("/uk/circuits?f=old&q=pescara");
  await expect(page.locator(".ct-grid > li")).toHaveCount(1);
  await expect(page.locator(".ct-grid > li")).toContainText("Pescara");
});

test("швидкий набір у пошуку не губить символів (луна адреси; рев'ю 13.11)", async ({ page }) => {
  await page.goto("/uk/circuits");
  const box = page.getByRole("searchbox", { name: "Пошук траси" });
  for (let i = 0; i < 3; i++) {
    await box.fill("");
    await box.pressSequentially("silverstone circuit", { delay: 0 });
    await page.waitForTimeout(400);
    await expect(box).toHaveValue("silverstone circuit");
  }
  await expect(page).toHaveURL(/q=silverstone\+circuit/);
  await expect(page.locator(".ct-grid > li")).toHaveCount(1);
});

test("картка списку веде на сторінку траси (Яс-Марина — поза першими 24, через пошук)", async ({ page }) => {
  await page.goto("/uk/circuits");
  await page.getByRole("searchbox", { name: "Пошук траси" }).fill("yas"); // у рядку пошуку — назва траси й місце («Абу-Дабі»), «яс» там немає
  await page.getByRole("link", { name: "Yas Marina Circuit" }).click();
  await expect(page).toHaveURL(/\/uk\/circuits\/yas-marina$/);
});

test("/uk/circuits/yas-marina: банер, цифри, смуга, гонки, титули, лідери (макет)", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const res = await page.goto("/uk/circuits/yas-marina");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Абу-Дабі");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Yas Marina Circuit");
  await expect(page.locator(".ct-stamp")).toHaveText("Наступна гонка: 6 грудня 2026 р. · етап 23");
  await expect(page.locator(".ct-hero p")).toContainText("Гран-прі Абу-Дабі з 2009 року");
  await expect(page.locator(".ct-big")).toContainText("5,281");
  await expect(page.locator(".ct-stats")).toContainText("1:25.637");
  await expect(page.locator(".ct-stats")).toContainText("Кевін Магнуссен");
  const strip = page.locator(".ct-strip");
  for (const v of ["17", "7", "12", "P4", "14", "5"]) await expect(strip).toContainText(v);
  const rows = page.getByRole("table", { name: /Гонки чемпіонату на трасі/ }).locator("tbody tr");
  await expect(rows).toHaveCount(17);
  await expect(rows.first()).toContainText("2025");
  await expect(page.locator(".ct-tbl .ct-badge")).toHaveCount(5);
  await expect(page.locator(".ct-dec")).toHaveCount(5);
  await expect(page.locator(".ct-rank").first().locator("li").first()).toContainText("Гамілтон");
  expect(errors).toEqual([]);
});

test("усі посилання сторінки траси ведуть на існуючі сторінки; невідома траса — 404", async ({ page, request }) => {
  await page.goto("/uk/circuits/yas-marina");
  const hrefs = [...new Set(await page.locator(".ct-page a").evaluateAll((as) => as.map((a) => a.getAttribute("href")!)))].filter((h) => h.startsWith("/"));
  const dead: string[] = [];
  for (let i = 0; i < hrefs.length; i += 8) {
    const part = hrefs.slice(i, i + 8);
    const codes = await Promise.all(part.map(async (h) => (await request.get(h)).status()));
    codes.forEach((c, k) => c !== 200 && dead.push(`${part[k]} → ${c}`));
  }
  expect(dead).toEqual([]);
  expect((await request.get("/uk/circuits/nope")).status()).toBe(404);
});

test("сторінка гонки посилається на трасу", async ({ page }) => {
  await page.goto("/uk/seasons/2025/24");
  await page.locator(".rc-hero p a", { hasText: "Абу-Дабі" }).click();
  await expect(page).toHaveURL(/\/uk\/circuits\/yas-marina$/);
});

test("траса без фото й фактів (Пескара, 1957): темний банер, одна гонка", async ({ page }) => {
  await page.goto("/circuits/pescara");
  await expect(page.locator(".ct-hero")).not.toHaveClass(/has-photo/);
  await expect(page.locator(".ct-tbl tbody tr")).toHaveCount(1);
  await expect(page.locator(".ct-stamp")).toHaveCount(0);
});

test("усі 78 трас мають сторінку обома мовами", async ({ page, request }) => {
  await page.goto("/circuits");
  while (await page.locator(".ct-more").count()) await page.locator(".ct-more").click();
  const hrefs = await page.locator(".ct-card h3 a").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  expect(hrefs).toHaveLength(78);
  const bad: string[] = [];
  for (let i = 0; i < hrefs.length; i += 13) {
    const part = hrefs.slice(i, i + 13).flatMap((h) => [h, `/uk${h}`]);
    const codes = await Promise.all(part.map((h) => request.get(h).then((r) => r.status())));
    codes.forEach((c, k) => c !== 200 && bad.push(`${part[k]} → ${c}`));
  }
  expect(bad).toEqual([]);
});

test.describe("без JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("список і таблиця гонок — серверна розмітка", async ({ page }) => {
    await page.goto("/uk/circuits");
    await expect(page.locator(".ct-grid > li")).toHaveCount(24);
    await expect(page.locator(".ct-rest li")).toHaveCount(54);
    await page.goto("/uk/circuits/monza");
    await expect(page.locator(".ct-tbl tbody tr")).toHaveCount(76);
  });
});

test("метадані: canonical, hreflang, JSON-LD", async ({ page }) => {
  await page.goto("/uk/circuits/yas-marina");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/uk\/circuits\/yas-marina$/);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/circuits\/yas-marina$/);
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(ld).toMatchObject({ "@type": "SportsActivityLocation", name: "Yas Marina Circuit" });
});

for (const path of ["/uk/circuits", "/uk/circuits/yas-marina"])
  for (const theme of ["light", "dark"] as const)
    for (const width of [320, 390, 768, 1024, 1280])
      test(`${path}: без порушень axe; ніщо не виходить за екран: ${theme}, ${width} px`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        // Для пропущених content-visibility елементів axe бере тло сторінки (урок 3f).
        await page.addStyleTag({ content: ".ct-grid > li, .ct-page * { content-visibility: visible !important; }" });
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
  for (const path of ["/uk/circuits", "/uk/circuits/monza"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls), path).toBeLessThan(0.1);
    const { gzipSync } = await import("node:zlib");
    const res = await request.get(path);
    expect(gzipSync(await res.body()).length, path).toBeLessThan(100 * 1024);
  }
});
