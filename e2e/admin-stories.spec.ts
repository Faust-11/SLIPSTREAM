import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  await expect(filters.getByRole("link", { name: /^Переклад EN: перевірити · \d+$/ })).toBeVisible();

  const jerez = page.locator(".ad-stories tbody tr", { hasText: "jerez-1997" });
  await expect(jerez).toContainText("Фінал у Хересі");
  await expect(jerez).toContainText("Опубліковано");
  await expect(jerez).toContainText("Без помилок");
  await expect(jerez.locator('td[data-label="Переклад EN"]')).toContainText("Актуальний");
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

// ── Застарілий переклад (7c, задача 4). Фейковий GitHub читає файли з диска, тож «застарілість» створюємо правкою відмітки
// `translated` у story.json (сайт її не читає — публічні сторінки не зачеплені) і повертаємо файл у finally. ──
test("переклад: застарілі фрагменти видно в редакторі; «переклад актуальний» оновлює відмітку в PR", async ({ page }) => {
  const file = join(process.cwd(), "content/stories/f1-team-size/story.json");
  const original = readFileSync(file, "utf8");
  try {
    const j = JSON.parse(original);
    j.translated.title = "000000000000";
    j.translated.sec2 = "000000000000";
    writeFileSync(file, JSON.stringify(j, null, 2) + (original.endsWith("\n") ? "\n" : ""));

    await openStory(page, "f1-team-size");
    await expect(page.getByText("Переклад EN застарів")).toBeVisible();
    await expect(page.locator("#stale-title")).toContainText("Оригінал змінено після звірки");
    await expect(page.locator('input[name="title_en"]')).toHaveAccessibleDescription(/Оригінал змінено після звірки/);
    await expect(page.locator("#stale-dek")).toHaveCount(0);
    await expect(page.locator("#tr-note")).toContainText("Розділ 2");
    const list = await page.goto("/admin/stories?f=translation");
    expect(list?.status()).toBe(200);
    await expect(page.locator(".ad-stories tbody tr", { hasText: "f1-team-size" })).toContainText("Застарів");

    await page.goto("/admin/stories/f1-team-size");
    await page.getByLabel(/Переклад English відповідає українському оригіналу/).check();
    await page.getByRole("button", { name: "Опублікувати зміни" }).click();
    await expect(page.getByRole("status").filter({ hasText: "PR #" })).toContainText("відмітка: переклад актуальний");
    const pr = await lastPr(page, "f1-team-size");
    expect(pr.paths).toEqual(["content/stories/f1-team-size/story.json"]);
    const saved = JSON.parse(pr.files["content/stories/f1-team-size/story.json"]);
    expect(saved.translated.title).toBe(JSON.parse(original).translated.title);
    expect(saved.translated.sec2).toBe(JSON.parse(original).translated.sec2);
  } finally {
    writeFileSync(file, original);
  }
});

// ── Фото історії (7c, задача 5). Фейковий Commons: 1-й файл — суспільне надбання, 2-й — NC, 3-й — ND (не обрати). ──
test("фото: список показує hero й inline, підписи, ліцензію; без помилок доступності й горизонтального скролу", async ({ page }) => {
  await login(page);
  await page.goto("/admin/stories/jerez-1997/photos");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Фото");
  const first = page.locator(".ad-media li").first();
  await expect(first).toContainText("m1");
  await expect(first).toContainText("Головне");
  await expect(first).toContainText("CC BY-SA 2.0");
  await expect(first.getByRole("link", { name: /Замінити/ })).toHaveAttribute("href", "/admin/stories/jerez-1997/photos/m1");
  await expect(page.getByRole("link", { name: "Додати фото в текст" })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("фото: заміна hero з Commons — ND не обрати, NC з попередженням; PR із 3 файлами 1280/800/480 і story.json лише з m1", async ({ page }) => {
  await login(page);
  await page.goto("/admin/stories/how-f1-began/photos/m1");
  const cards = page.locator(".ad-cands li");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(2).getByRole("link", { name: "Обрати" })).toHaveCount(0);
  await cards.nth(1).getByRole("link", { name: "Обрати" }).click();
  await expect(page.getByText("Лише некомерційно: якщо на сайті")).toBeVisible();
  await page.goBack();
  await page.locator(".ad-cands li").first().getByRole("link", { name: "Обрати" }).click();
  // Підписи старого фото підставлено й обов'язкові; фокус-картка є.
  await expect(page.locator('textarea[name="caption_uk"]')).not.toHaveValue("");
  await page.locator('textarea[name="caption_en"]').fill("Fake caption for the new hero photo.");
  await page.getByRole("button", { name: "Опублікувати" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Опубліковано" })).toBeVisible();

  const pr = await lastPr(page, "how-f1-began");
  expect(pr.title).toBe("Історія · how-f1-began: головне фото");
  expect(pr.draft).toBe(false);
  expect(pr.body).toContain("Fake Photographer");
  expect(pr.paths).toEqual([
    "public/img/stories/how-f1-began/m1-1280.webp",
    "public/img/stories/how-f1-began/m1-800.webp",
    "public/img/stories/how-f1-began/m1-480.webp",
    "content/stories/how-f1-began/story.json",
  ]);
  const json = JSON.parse(pr.files["content/stories/how-f1-began/story.json"]);
  const m1 = json.media.find((m: { id: string }) => m.id === "m1");
  expect(m1.role).toBe("hero");
  expect(m1.credit).toMatchObject({ author: "Fake Photographer", license: "Public domain" });
  expect(m1.caption.en).toBe("Fake caption for the new hero photo.");
  expect(m1.srcSet).toBe(
    "/img/stories/how-f1-began/m1-1280.webp 1280w, /img/stories/how-f1-began/m1-800.webp 800w, /img/stories/how-f1-began/m1-480.webp 480w",
  );
});

test("фото: нове inline-фото — наступний id, файли 800/480, роль inline", async ({ page }) => {
  await login(page);
  const before = JSON.parse(readFileSync(join(process.cwd(), "content/stories/pit-stop-evolution/story.json"), "utf8")).media as { id: string }[];
  const nextId = `m${Math.max(...before.map((m) => Number(m.id.slice(1)))) + 1}`;
  await page.goto("/admin/stories/pit-stop-evolution/photos/new");
  await page.locator(".ad-cands li").first().getByRole("link", { name: "Обрати" }).click();
  for (const [name, text] of [["caption_uk", "Підпис"], ["caption_en", "Caption"], ["alt_uk", "Опис"], ["alt_en", "Alt"]] as const) await page.locator(`textarea[name="${name}"]`).fill(text);
  await page.getByRole("button", { name: "Опублікувати" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Опубліковано" })).toBeVisible();
  const pr = await lastPr(page, "pit-stop-evolution");
  expect(pr.title).toBe(`Історія · pit-stop-evolution: нове фото ${nextId}`);
  expect(pr.paths).toEqual([`public/img/stories/pit-stop-evolution/${nextId}-800.webp`, `public/img/stories/pit-stop-evolution/${nextId}-480.webp`, "content/stories/pit-stop-evolution/story.json"]);
  const json = JSON.parse(pr.files["content/stories/pit-stop-evolution/story.json"]);
  expect(json.media.at(-1)).toMatchObject({ id: nextId, role: "inline" });
  expect(json.media).toHaveLength(before.length + 1);
});

test("фото: неіснуюче фото й некоректний id — 404", async ({ page }) => {
  await login(page);
  expect((await page.goto("/admin/stories/jerez-1997/photos/m99"))?.status()).toBe(404);
  expect((await page.goto("/admin/stories/jerez-1997/photos/..%2Fx"))?.status()).toBe(404);
});
