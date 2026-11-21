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
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}");
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

test("хайлайт YouTube FORMULA 1: до кліку — мініатюра без iframe; після — плеєр youtube-nocookie; до 2017 — немає", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && /Content Security Policy|Refused/i.test(m.text()) && errors.push(m.text()));
  await page.goto("/uk/seasons/2024/1");
  const box = page.locator(".rc-video");
  await expect(box).toBeVisible();
  await expect(box.locator("iframe")).toHaveCount(0);
  await expect(box.locator("img")).toHaveAttribute("src", "https://i.ytimg.com/vi/9Y5wMpKXNK4/hqdefault.jpg");
  await box.getByRole("button", { name: /Дивитися хайлайти: Race Highlights \| 2024 Bahrain Grand Prix/ }).click();
  await expect(box.locator("iframe")).toHaveAttribute("src", /^https:\/\/www\.youtube-nocookie\.com\/embed\/9Y5wMpKXNK4\?autoplay=1/);
  expect(errors).toEqual([]);
  await page.goto("/uk/seasons/2016/1");
  await expect(page.locator(".rc-video")).toHaveCount(0);
});

/* ---------- погода вікенду (клієнтський острів; джерела — OpenF1 і MET Norway, у e2e підміняємо /api/weather) ---------- */

type Wx = { air: [number, number]; track: [number, number] | null; humidity: number | null; wind: { kmh: number; from: number | null } | null; rainShare: number | null; mm: number | null; condition: string | null };
const measured = (over: Partial<Wx> = {}): Wx => ({ air: [23.5, 24.6], track: [39.3, 53.7], humidity: 72.7, wind: { kmh: 6.3, from: 184 }, rainShare: 0, mm: null, condition: null, ...over });
const WX_ROWS = [
  { kind: "FP1", state: "done", source: "openf1", data: measured() },
  { kind: "FP2", state: "done", source: "openf1", data: measured({ rainShare: 0.35, wind: { kmh: 0.4, from: null } }) },
  { kind: "FP3", state: "forecast", source: "met", data: { air: [19, 19], track: null, humidity: 60, wind: { kmh: 12, from: 315 }, rainShare: null, mm: 0.4, condition: "rain" } satisfies Wx },
  { kind: "Q", state: "none", source: null, data: null },
  { kind: "R", state: "forecast", source: "met", data: { air: [21, 21], track: null, humidity: 55, wind: null, rainShare: null, mm: 0, condition: "clear" } satisfies Wx },
].map((s, i) => ({ ...s, start: `2025-12-0${5 + (i > 1 ? 1 : 0)}T0${i}:30:00.000Z`, end: `2025-12-0${5 + (i > 1 ? 1 : 0)}T0${i + 1}:30:00.000Z` }));
const mockWeather = (page: import("@playwright/test").Page, sessions: unknown[] | number, delay = 0) =>
  page.route("**/api/weather/**", async (route) => {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (typeof sessions === "number") return route.fulfill({ status: sessions, body: "x" });
    return route.fulfill({ json: { year: 2025, round: 24, updated: "2025-12-07T00:00:00.000Z", sessions } });
  });

test("/uk/seasons/2025/24: погода по сесіях — заміри, прогноз, штиль, «даних ще немає», джерела", async ({ page }) => {
  await mockWeather(page, WX_ROWS);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/uk/seasons/2025/24");
  const rows = page.locator(".rw-tbl tbody tr");
  await expect(rows).toHaveCount(5);
  await expect(page.locator("#rw-h")).toHaveText("Погода на трасі");
  // Заміри: Math.round(23,5) = 24; напрямок 184° — південь; 0 % дощу — «Сухо».
  await expect(rows.nth(0)).toContainText("Перше тренування");
  await expect(rows.nth(0)).toContainText("виміряно на трасі");
  await expect(rows.nth(0).locator("td")).toHaveText(["24–25 °C", "39–54 °C", "73%", "Пд · 6 км/год", "Сухо"]);
  await expect(rows.nth(1).locator("td")).toHaveText(["24–25 °C", "39–54 °C", "73%", "штиль", "Дощ · 35% часу"]);
  // Прогноз: траси нема, напрямок 315° — північний захід, дощ із кількістю опадів.
  await expect(rows.nth(2)).toContainText("прогноз");
  await expect(rows.nth(2).locator("td")).toHaveText(["19 °C", "—", "60%", "ПнЗх · 12 км/год", "Дощ · 0,4 мм"]);
  await expect(rows.nth(3)).toContainText("даних ще немає");
  await expect(rows.nth(3).locator("td")).toHaveText(["—", "—", "—", "—", "—"]);
  await expect(rows.nth(4).locator("td").nth(4)).toHaveText("Ясно");
  await expect(page.locator(".rw-credit a[href='https://openf1.org']")).toHaveText("OpenF1");
  await expect(page.locator(".rw-credit a[href='https://www.met.no/en']")).toHaveText("MET Norway");
  // Телефон: таблиця ховається, замість неї — картки з підписами полів.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".rw-tbl")).toBeHidden();
  const cards = page.locator(".rw-cards li");
  await expect(cards).toHaveCount(5);
  await expect(cards.nth(0).locator("dd")).toHaveText(["24–25 °C", "39–54 °C", "73%", "Пд · 6 км/год", "Сухо"]);
  await expect(cards.nth(0).locator("dt").first()).toHaveText("Повітря");
});

test("/seasons/2025/24 (англійською): назви, одиниці й множина «часу»", async ({ page }) => {
  await mockWeather(page, WX_ROWS);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/seasons/2025/24");
  await expect(page.locator("#rw-h")).toHaveText("Weather at the track");
  const rows = page.locator(".rw-tbl tbody tr");
  await expect(rows.nth(1).locator("td")).toHaveText(["24–25 °C", "39–54 °C", "73%", "calm", "Rain · 35% of the time"]);
  await expect(rows.nth(2).locator("td")).toHaveText(["19 °C", "—", "60%", "NW · 12 km/h", "Rain · 0.4 mm"]);
});

test("погода: нічого не дали джерела (усі «none», 500, 404) — блоку немає, а сторінка цілу й без помилок", async ({ page }) => {
  for (const reply of [WX_ROWS.map((s) => ({ ...s, state: "none", source: null, data: null })), 500, 404] as const) {
    await page.unrouteAll();
    await mockWeather(page, reply as unknown[] | number);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const done = page.waitForResponse("**/api/weather/**");
    await page.goto("/uk/seasons/2025/24");
    await done;
    await expect(page.locator(".rc-tl li")).toHaveCount(5);
    await expect(page.locator(".rw")).toHaveCount(0);
    expect(errors).toEqual([]);
  }
});

test("погода: сезон до 2023 — ні блока, ні запиту; спринт-вікенд 2023 — п'ять рядків", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (r) => r.url().includes("/api/weather/") && asked.push(r.url()));
  await page.goto("/uk/seasons/2022/1");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await page.waitForTimeout(500);
  await expect(page.locator(".rw")).toHaveCount(0);
  expect(asked).toEqual([]);
  const rows = ["FP1", "Q", "SQ", "SR", "R"].map((kind, i) => ({ kind, state: "done", source: "openf1", data: measured(), start: `2023-04-2${8 + (i > 1 ? 1 : 0)}T0${i}:30:00.000Z`, end: `2023-04-2${8 + (i > 1 ? 1 : 0)}T0${i + 1}:30:00.000Z` }));
  await mockWeather(page, rows);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/uk/seasons/2023/4");
  await expect(page.locator(".rw-tbl tbody tr")).toHaveCount(5);
  await expect(page.locator(".rw-tbl tbody th b")).toHaveText(["Перше тренування", "Кваліфікація", "Спринт-кваліфікація", "Спринт", "Гонка"]);
});

test("/api/weather: сезон до 2023 і неіснуюча гонка — 404; у e2e джерела недоступні — 200 без даних, а не 500", async ({ request }) => {
  expect((await request.get("/api/weather/2022/1")).status()).toBe(404);
  expect((await request.get("/api/weather/2025/99")).status()).toBe(404);
  expect((await request.get("/api/weather/abc/1")).status()).toBe(404);
  const ok = await request.get("/api/weather/2025/24");
  expect(ok.status()).toBe(200);
  const body = await ok.json();
  expect(body.sessions.length).toBe(5);
  expect(body.sessions.every((s: { data: unknown }) => s.data === null)).toBe(true);
});

for (const theme of ["light", "dark"] as const)
  for (const width of [320, 390, 768, 1024, 1280])
    test(`погода: без порушень axe, ніщо не виходить за екран: ${theme}, ${width} px`, async ({ page }) => {
      await mockWeather(page, WX_ROWS);
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/uk/seasons/2025/24");
      await expect(page.locator("#rw-h")).toBeVisible();
      await expect(page.locator(width > 720 ? ".rw-tbl tbody tr" : ".rw-cards li").first()).toBeVisible();
      await expectNoA11yViolations(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });

for (const width of [390, 1280])
  test(`погода: заглушка не зсуває сторінку (CLS < 0.1, ${width} px; відповідь із затримкою)`, async ({ page }) => {
    await mockWeather(page, WX_ROWS, 900);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
          if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto("/uk/seasons/2025/24", { waitUntil: "load" });
    await page.locator("#rw-h").scrollIntoViewIfNeeded();
    await expect(page.locator(width > 720 ? ".rw-tbl tbody tr" : ".rw-cards li").first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.1);
  });
