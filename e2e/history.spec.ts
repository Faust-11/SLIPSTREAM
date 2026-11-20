import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/** Дні розділу «Цей день у Формулі-1» зі sitemap (обидві мови) — стабільніше за жорстко прописані дати. */
async function historyDays(request: import("@playwright/test").APIRequestContext): Promise<string[]> {
  const xml = await (await request.get("/sitemap.xml")).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  return [...new Set(locs.map((l) => /\/history\/(\d{2}-\d{2})$/.exec(l)?.[1]).filter((d): d is string => !!d))].sort();
}

test("/uk/history: перелік 12 місяців, дні з подіями — посилання, «Сьогодні» веде на сторінку дати", async ({ page, request }) => {
  const days = await historyDays(request);
  expect(days.length, "днів із подіями").toBeGreaterThan(300);
  await page.goto("/uk/history");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Цей день у Формулі-1");
  await expect(page.locator(".oth-month")).toHaveCount(12);
  await expect(page.locator(".oth-days a")).toHaveCount(days.length);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/uk\/history$/);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/history$/);
  // «Сьогодні» — за годинником браузера (після гідратації).
  await page.clock.install({ time: new Date("2026-03-15T12:00:00") });
  await page.reload();
  await expect(page.locator(".oth-today")).toHaveAttribute("href", /\/uk\/history\/03-15$/);
});

test("/uk/history/<день>: гонки, народження, навігація, розмітка, canonical і hreflang", async ({ page, request }) => {
  const days = await historyDays(request);
  const day = days.includes("10-19") ? "10-19" : days[0]!;
  await page.goto(`/uk/history/${day}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("у Формулі-1");
  await expect(page.locator("h2").first()).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/uk/history/${day}$`));
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", new RegExp(`/history/${day}$`));
  // Пілоти й гонки — посилання на наявні сторінки.
  const links = await page.locator(".oth a[href^='/uk/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  expect(links.some((h) => /^\/uk\/(drivers|seasons)\//.test(h))).toBe(true);
  // Попередній/наступний день — існуючі сторінки.
  const next = await page.locator('a[rel="next"]').getAttribute("href");
  expect(next).toMatch(/^\/uk\/history\/\d{2}-\d{2}$/);
  expect((await request.get(next!)).status()).toBe(200);
  // Розмітка: WebPage і BreadcrumbList з двома рівнями + корінь.
  const types = await page.locator('script[type="application/ld+json"]').evaluateAll((s) => s.map((x) => JSON.parse(x.textContent ?? "{}")["@type"]));
  expect(types).toEqual(expect.arrayContaining(["WebPage", "BreadcrumbList"]));
});

test("/history/<день> англійською і неіснуючі дати — 404", async ({ page, request }) => {
  const days = await historyDays(request);
  const res = await page.goto(`/history/${days[0]}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("in Formula 1");
  for (const bad of ["/history/02-30", "/uk/history/13-01", "/uk/history/9-2", "/history/abc"]) {
    expect((await request.get(bad)).status(), bad).toBe(404);
  }
});

test("футер: посилання «Цей день у F1» веде на розділ", async ({ page }) => {
  await page.goto("/uk");
  await expect(page.locator(".foot-service").getByRole("link", { name: "Цей день у F1" })).toHaveAttribute("href", "/uk/history");
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const path of ["/uk/history", "/uk/history/10-19"]) {
    test(`без порушень axe: ${path} (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      await expectNoA11yViolations(page);
    });
  }
}
