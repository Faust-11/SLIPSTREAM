import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Історії (7c): список. Фейковий GitHub — scripts/dev/fake-services.mjs; історії — справжні файли content/stories (33).
const FAKE = "http://127.0.0.1:4455";
const BASE = "http://localhost:3100";

test.skip(!!process.env.BASE_URL, "фейкові сервіси — лише локально і в CI");

async function login(page: Page) {
  await page.context().addCookies([{ name: "fake_gh", value: "195572242:Faust-11", url: FAKE }]);
  await page.goto("/admin/auth/login?key=e2e-login-key-0123456789");
  await Promise.all([page.waitForURL((u) => u.origin === BASE && !u.pathname.startsWith("/admin/auth")), page.getByRole("link", { name: "Увійти через GitHub" }).click()]);
  await page.getByRole("link", { name: "Історії", exact: true }).click();
}

test("список: усі історії, лічильники фільтрів, пошук, без помилок", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Історії");
  await expect(page.locator(".ad-stories tbody tr")).toHaveCount(33);
  const filters = page.getByRole("navigation", { name: "Фільтр історій" });
  await expect(filters.getByRole("link", { name: /^Усі · 33$/ })).toHaveAttribute("aria-current", "page");
  await expect(filters.getByRole("link", { name: /^Чернетки · 0$/ })).toBeVisible();
  await expect(filters.getByRole("link", { name: /^З помилками · 0$/ })).toBeVisible();

  const jerez = page.locator(".ad-stories tbody tr", { hasText: "jerez-1997" });
  await expect(jerez).toContainText("Фінал у Хересі");
  await expect(jerez).toContainText("Опубліковано");
  await expect(jerez).toContainText("Без помилок");
  await expect(jerez.getByRole("link", { name: /На сайті/ })).toHaveAttribute("href", "/uk/stories/jerez-1997");

  await page.getByRole("searchbox", { name: "Знайти" }).fill("ХЕРЕС");
  await page.getByRole("button", { name: "Шукати" }).click();
  await expect(page).toHaveURL(/q=%D0%A5%D0%95%D0%A0%D0%95%D0%A1/);
  await expect(page.locator(".ad-stories tbody tr")).toHaveCount(1);
});

test("фільтр «Чернетки» порожній — пояснення, а не порожня таблиця; невідомий фільтр = усі", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: /^Чернетки · 0$/ }).click();
  await expect(page.getByText("Чернеток немає: усі історії опубліковані.")).toBeVisible();
  await expect(page.locator(".ad-stories")).toHaveCount(0);
  await page.goto("/admin/stories?f=%3Cscript%3E");
  await expect(page.locator(".ad-stories tbody tr")).toHaveCount(33);
});

test("доступність і телефон: без горизонтального скролу сторінки, підписи колонок у картках", async ({ page }) => {
  await login(page);
  await expectNoA11yViolations(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/stories");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator(".ad-stories thead")).toBeHidden();
  const firstCell = page.locator(".ad-stories tbody tr").first().locator("td").first();
  expect(await firstCell.evaluate((el) => getComputedStyle(el, "::before").content)).toContain("Стан");
});
