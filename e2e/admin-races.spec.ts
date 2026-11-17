import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Гонки (7b): хайлайт з офіційного каналу FORMULA 1. Фейк YouTube — scripts/dev/fake-services.mjs (OFFICIAL001 / OTHERCHAN01).
const FAKE = "http://127.0.0.1:4455";
const BASE = "http://localhost:3100";

test.skip(!!process.env.BASE_URL, "фейкові сервіси — лише локально і в CI");

async function login(page: Page) {
  await page.context().addCookies([{ name: "fake_gh", value: "195572242:Faust-11", url: FAKE }]);
  await page.goto("/admin/auth/login?key=e2e-login-key-0123456789");
  await Promise.all([page.waitForURL((u) => u.origin === BASE && !u.pathname.startsWith("/admin/auth")), page.getByRole("link", { name: "Увійти через GitHub" }).click()]);
  await page.getByRole("link", { name: "Гонки", exact: true }).click();
}

test("сезон: етапи з хайлайтами й без; офіційне відео — PR у race-videos.json; чужий канал і не-YouTube — відмова", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Гонки");
  const rows = page.locator(".ad-races li");
  await expect(rows).toHaveCount(23);
  await expect(page.locator("#ad-season")).toContainText("хайлайти 20 з 20");

  const next = rows.nth(20); // етап 21 — ще без відео
  await next.getByRole("textbox").fill("https://youtu.be/OFFICIAL001");
  await next.getByRole("button", { name: "Поставити" }).click();
  await expect(page.getByRole("status")).toContainText("Хайлайт поставлено");
  const pr = await (await page.request.get(`${FAKE}/__last-pr?has=${encodeURIComponent("2026/21")}`)).json();
  expect(pr.title).toBe("Хайлайт · 2026/21: Race Highlights | 2026 Las Vegas Grand Prix");
  expect(pr.paths).toEqual(["src/data/curated/race-videos.json"]);

  await page.locator(".ad-races li").nth(20).getByRole("textbox").fill("https://www.youtube.com/watch?v=OTHERCHAN01");
  await page.locator(".ad-races li").nth(20).getByRole("button", { name: "Поставити" }).click();
  await expect(page.getByRole("status")).toContainText("не з офіційного каналу FORMULA 1");

  await page.locator(".ad-races li").nth(20).getByRole("textbox").fill("https://vimeo.com/123456");
  await page.locator(".ad-races li").nth(20).getByRole("button", { name: "Поставити" }).click();
  await expect(page.getByRole("status")).toContainText("не схоже на посилання YouTube");
});

test("прибрати відео етапу і перейти до банера гонки", async ({ page }) => {
  await login(page);
  const row = page.locator(".ad-races li").nth(19); // етап 20 — з відео
  await row.getByRole("button", { name: "Прибрати відео" }).click();
  await expect(page.getByRole("status")).toContainText("прибирається");
  expect((await (await page.request.get(`${FAKE}/__last-pr?has=${encodeURIComponent("2026/20 —")}`)).json()).title).toBe("Хайлайт · 2026/20 — прибрано");
  await page.locator(".ad-races li").nth(19).getByRole("link", { name: "Банер гонки" }).click();
  await expect(page).toHaveURL(`${BASE}/admin/photos/race/2026-20`);
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [390, 1280]) {
    test(`Гонки без порушень axe і горизонтальної прокрутки: ${colorScheme}, ${width} px`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width, height: 900 });
      await login(page);
      await expectNoA11yViolations(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
