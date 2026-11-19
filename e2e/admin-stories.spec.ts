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

// ── Редактор (7c, задача 3). Кожен тест — своя історія: відкритий PR історії блокує нову публікацію (фейк не зливає PR). ──
// Сводка результату редактора. Не page.getByRole("alert") — такий role має й службовий route announcer Next.js.
const summary = (page: Page) => page.locator(".ad-ed-summary");
const lastPr = async (page: Page, has: string) => (await page.request.get(`${FAKE}/__last-pr?has=${encodeURIComponent(has)}`)).json();

async function openStory(page: Page, slug: string) {
  await login(page);
  await page.locator(".ad-stories tbody tr", { hasText: slug }).locator("th a").first().click(); // перше посилання рядка — назва → редактор
  await expect(page).toHaveURL(`${BASE}/admin/stories/${slug}`);
}

test("редактор: правка заголовка → PR зі зміненим лише story.json, diff на один рядок", async ({ page }) => {
  await openStory(page, "women-in-f1");
  await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty();
  const title = page.locator('input[name="title_en"]');
  const before = await title.inputValue();
  await title.fill(`${before} (ред.)`);
  await page.getByRole("button", { name: "Опублікувати зміни" }).click();
  await expect(page.getByRole("status").filter({ hasText: "PR #" })).toContainText("створено");
  const pr = await lastPr(page, "women-in-f1");
  expect(pr.title).toBe("Історія · women-in-f1: заголовок");
  expect(pr.draft).toBe(false);
  expect(pr.paths).toEqual(["content/stories/women-in-f1/story.json"]);
  const json = JSON.parse(pr.files["content/stories/women-in-f1/story.json"]);
  expect(json.title.en).toBe(`${before} (ред.)`);
  expect(json.slug).toBe("women-in-f1");
});

test("редактор: статус «чернетка» і правка тексту → PR з двома файлами; повторна публікація, поки PR відкритий, заблокована", async ({ page }) => {
  await openStory(page, "austria-2002");
  await page.locator('select[name="status"]').selectOption("draft");
  const md = page.locator('textarea[name="md_uk"]');
  await md.fill((await md.inputValue()) + "\n");
  await page.getByRole("button", { name: "Опублікувати зміни" }).click();
  await expect(page.getByRole("status").filter({ hasText: "PR #" })).toBeVisible();
  const pr = await lastPr(page, "austria-2002");
  expect(pr.title).toContain("статус: чернетка");
  expect(JSON.parse(pr.files["content/stories/austria-2002/story.json"]).status).toBe("draft");
  // Друга публікація тієї самої історії, поки перший PR не злитий, — відмова (лише PR, не затираємо).
  await page.goto("/admin/stories/austria-2002");
  await expect(page.getByRole("status").filter({ hasText: "чекають злиття" })).toBeVisible();
  await page.locator('input[name="title_uk"]').fill("Інший заголовок");
  await page.getByRole("button", { name: "Опублікувати зміни" }).click();
  await expect(summary(page).getByRole("alert")).toContainText("вже чекають злиття");
});

test("редактор: помилка валідації — PR не створюється, значення форми лишаються, фокус на підсумку", async ({ page }) => {
  await openStory(page, "suzuka-1989");
  await page.locator('input[name="s.0.del"]').check(); // джерело s1 використовують твердження
  await page.locator('input[name="title_en"]').fill("Тимчасовий заголовок для перевірки");
  await page.getByRole("button", { name: "Опублікувати зміни" }).click();
  await expect(summary(page).getByRole("alert")).toContainText("відсутні в sources");
  await expect(summary(page)).toBeFocused();
  await expect(page.locator('input[name="s.0.del"]')).toBeChecked();
  await expect(page.locator('input[name="title_en"]')).toHaveValue("Тимчасовий заголовок для перевірки");
  expect((await page.request.get(`${FAKE}/__last-pr?has=suzuka-1989`)).status()).toBe(404);
});

test("редактор: збереження без правок — «Немає змін»; доступність і телефон", async ({ page }) => {
  await openStory(page, "spa-2021");
  await page.getByRole("button", { name: "Опублікувати зміни" }).click();
  await expect(summary(page).getByRole("alert")).toContainText("Немає змін");
  await expectNoA11yViolations(page);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("редактор: неіснуюча історія — 404", async ({ page }) => {
  await login(page);
  const res = await page.goto("/admin/stories/no-such-story");
  expect(res?.status()).toBe(404);
});
