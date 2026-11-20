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
  // Форма обраного фото — лише всередині секції «Обране фото» (у «Своє фото» такі самі поля, і React лишає їх у DOM під час переходу).
  const chosen = page.locator('section[aria-labelledby="ad-pick"]');
  await expect(chosen).toBeVisible();
  // Підписи старого фото підставлено й обов'язкові.
  await expect(chosen.locator('textarea[name="caption_uk"]')).not.toHaveValue("");
  await chosen.locator('textarea[name="caption_en"]').fill("Fake caption for the new hero photo.");
  await chosen.getByRole("button", { name: "Опублікувати" }).click();
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
  const chosen = page.locator('section[aria-labelledby="ad-pick"]');
  await expect(chosen).toBeVisible();
  for (const [name, text] of [["caption_uk", "Підпис"], ["caption_en", "Caption"], ["alt_uk", "Опис"], ["alt_en", "Alt"]] as const) await chosen.locator(`textarea[name="${name}"]`).fill(text);
  await chosen.getByRole("button", { name: "Опублікувати" }).click();
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

test("версії: злита правка з'являється в журналі, diff показує зміну, відкат створює PR і блокує нові правки", async ({ page }) => {
  await openStory(page, "hunt-lauda-1976");
  const title = page.locator('input[name="title_en"]');
  const before = await title.inputValue();
  await title.fill(`${before} (версія)`);
  await page.getByRole("button", { name: "Опублікувати зміни" }).click();
  await expect(page.getByRole("status").filter({ hasText: "PR #" })).toContainText("створено");

  // Поки PR не злитий — у журналі його немає, а в «Чекають злиття» він є.
  await page.getByRole("link", { name: "Версії", exact: true }).click();
  await expect(page).toHaveURL(`${BASE}/admin/stories/hunt-lauda-1976/versions`);
  await expect(page.getByText("Правок цієї історії з адмінки ще не було.")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Чекають злиття" })).toBeVisible();

  // Злили — журнал показує правку; відкриваємо diff.
  expect((await page.request.post(`${FAKE}/__merge?has=${encodeURIComponent("Історія · hunt-lauda-1976")}`)).ok()).toBe(true);
  await page.reload();
  const row = page.locator(".ad-ver li").first();
  await expect(row).toContainText("Історія · hunt-lauda-1976: заголовок");
  await expect(row.getByRole("button", { name: /Відкотити/ })).toBeEnabled();
  await expectNoA11yViolations(page);
  await row.getByRole("link", { name: /Історія · hunt-lauda-1976/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("hunt-lauda-1976: заголовок");
  const diff = page.locator(".ad-diff").first();
  await expect(diff.locator(".ad-dl.is-add").filter({ hasText: `(версія)` })).toHaveCount(1);
  await expect(diff.locator(".ad-dl.is-del").filter({ hasText: before })).toHaveCount(1);
  await expectNoA11yViolations(page);

  // Відкат: новий PR «Відкат: …» зі шляхом story.json; далі нові правки історії заблоковані, поки він не злитий.
  await page.getByRole("link", { name: "Версії", exact: true }).click();
  await page.locator(".ad-ver li").first().getByRole("button", { name: /Відкотити/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Відкат створено" })).toBeVisible();
  const rev = await lastPr(page, "Відкат: Історія · hunt-lauda-1976");
  expect(rev.head.ref).toMatch(/^admin\/revert-\d{8}-\d{6}$/);
  expect(rev.paths).toEqual(["content/stories/hunt-lauda-1976/story.json"]);
  await expect(page.getByRole("status").filter({ hasText: "Чекають злиття" })).toBeVisible();
  await expect(page.locator(".ad-ver li").first().getByRole("button", { name: /Відкотити/ })).toBeDisabled();
  await page.goto("/admin/stories/hunt-lauda-1976");
  await expect(page.getByRole("status").filter({ hasText: "чекають злиття" })).toBeVisible();
});

test("версії: чужий номер PR, неіснуюча історія й некоректна адреса — 404; вузький екран без горизонтального скролу", async ({ page }) => {
  await login(page);
  expect((await page.goto("/admin/stories/jerez-1997/versions/999999"))?.status()).toBe(404);
  expect((await page.goto("/admin/stories/jerez-1997/versions/abc"))?.status()).toBe(404);
  expect((await page.goto("/admin/stories/no-such-story/versions"))?.status()).toBe(404);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/stories/jerez-1997/versions");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Версії історії");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("джерела: перевірка посилань (працює/мертве/не вдалося, редирект у приватну мережу відхилено), пошук і збереження копій, запис у PR", async ({ page }) => {
  await openStory(page, "abu-dhabi-2021");
  await page.getByRole("link", { name: "Здоров'я джерел" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Здоров'я джерел");
  const rows = page.locator(".ad-stories tbody tr");
  await expect(rows).toHaveCount(22);
  await expect(page.getByText("не перевірялось").first()).toBeVisible();
  await expectNoA11yViolations(page);

  // Перевірка посилань: пачками, з прогресом; рядки — за хостом фейкового сайту.
  await page.getByRole("button", { name: "Перевірити посилання" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Перевірено 22 з 22" })).toBeVisible();
  const row = (publisher: string, n: number) => rows.filter({ hasText: new RegExp(`^${n}\\. ${publisher}`) }).first();
  await expect(row("FIA", 3).locator('td[data-label="Посилання"]')).toContainText("Працює");
  await expect(row("Motorsport.com", 8).locator('td[data-label="Посилання"]')).toContainText("Мертве");
  await expect(row("Sky Sports", 7).locator('td[data-label="Посилання"]')).toContainText("Не вдалося перевірити");
  await expect(row("Sky Sports", 7).locator('td[data-label="Посилання"]')).toContainText("429");
  // SSRF: фейковий сайт відповів перенаправленням на 169.254.169.254 — адмінка за ним не пішла.
  const yahoo = rows.filter({ hasText: "Yahoo" }).first().locator('td[data-label="Посилання"]');
  await expect(yahoo).toContainText("Не вдалося перевірити");
  await expect(yahoo).toContainText("перенаправлення відхилено: приватна адреса");
  await expect(page.getByRole("status").filter({ hasText: "мертвих: 2" })).toBeVisible(); // motorsport ×2 (s8, s15)

  // Копії: Availability API знаходить знімки лише для fia та aljazeera.
  await page.getByRole("button", { name: /Знайти копії в Web Archive/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /Опрацьовано 22 з 22/ })).toBeVisible();
  await expect(row("FIA", 3).locator('td[data-label="Копія в Web Archive"]').getByRole("link", { name: /Є копія/ })).toHaveAttribute("href", /^https:\/\/web\.archive\.org\/web\/20260421173102\/https:\/\/www\.fia\.com\//);
  await expect(row("Motorsport.com", 8).locator('td[data-label="Копія в Web Archive"]')).toContainText("копії немає");

  // Save Page Now для Sky Sports (302 на знімок) і помилка для GPFans (520).
  await row("Sky Sports", 7).getByRole("button", { name: /Зберегти в Web Archive/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Збережено" })).toBeVisible();
  await expect(row("Sky Sports", 7).getByRole("link", { name: /Є копія/ })).toHaveAttribute("href", /web\.archive\.org\/web\/20261120140746\//);
  await row("GPFans", 12).getByRole("button", { name: /Зберегти в Web Archive/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Web Archive: 520" })).toBeVisible();

  // Записати знайдені копії: PR лише зі story.json; копії лише в джерелах, де вони є; чужі джерела не чіпаємо.
  await page.getByRole("button", { name: /Записати знайдені копії в історію/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Копії записано" })).toBeVisible();
  const pr = await lastPr(page, "abu-dhabi-2021");
  expect(pr.title).toMatch(/^Історія · abu-dhabi-2021: копії джерел у Web Archive \(\d+\)$/);
  expect(pr.paths).toEqual(["content/stories/abu-dhabi-2021/story.json"]);
  const json = JSON.parse(pr.files["content/stories/abu-dhabi-2021/story.json"]) as { sources: { id: string; archive?: string }[] };
  const withArchive = json.sources.filter((s) => s.archive).map((s) => s.id);
  expect(withArchive).toEqual(expect.arrayContaining(["s1", "s3", "s7", "s10"]));
  expect(withArchive).not.toContain("s8"); // motorsport — копії немає
  expect(withArchive).not.toContain("s12"); // gpfans — збереження не вдалось
  for (const s of json.sources) if (s.archive) expect(s.archive).toMatch(/^https:\/\/web\.archive\.org\/web\/\d{14}\/https:\/\//);
});

test("джерела: 404 для неіснуючої історії; вузький екран без горизонтального скролу", async ({ page }) => {
  await login(page);
  expect((await page.goto("/admin/stories/no-such-story/sources"))?.status()).toBe(404);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/stories/jerez-1997/sources");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Здоров'я джерел");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("адреса: попередній перегляд, зміна адреси → один PR (теки, фото за sha, посилання в іншій історії, редирект); повторна зміна заблокована", async ({ page }) => {
  await openStory(page, "brawn-gp-2009");
  await page.getByRole("link", { name: "Адреса", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Адреса історії");
  await page.getByLabel("Нова адреса").fill("brawn-champions");
  await page.getByRole("button", { name: "Показати, що зміниться" }).click();
  await expect(page).toHaveURL(/to=brawn-champions/);
  const plan = page.locator('section[aria-labelledby="ad-plan"]');
  await expect(plan).toContainText("/uk/stories/brawn-champions");
  await expect(plan).toContainText("button-canada-2011"); // на цю історію посилається інша
  await expect(plan).toContainText("автотести адмінки"); // brawn-gp-2009 — фікстура e2e: попередження, не блок
  await expectNoA11yViolations(page);

  await plan.getByRole("button", { name: "Змінити адресу на «brawn-champions»" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Зміну адреси створено" })).toBeVisible();
  const pr = await lastPr(page, "brawn-champions: адреса");
  expect(pr.title).toBe("Історія · brawn-champions: адреса змінена з brawn-gp-2009");
  expect(pr.head.ref).toMatch(/^admin\/stories-brawn-champions-\d{8}-\d{6}$/); // гілка за НОВОЮ адресою — потрапляє в журнал версій нової історії
  expect(pr.draft).toBe(false);
  const has = (p: string) => expect(pr.paths, p).toContain(p);
  for (const f of ["story.json", "uk.md", "en.md"]) {
    has(`content/stories/brawn-gp-2009/${f}`); // видалення старих
    has(`content/stories/brawn-champions/${f}`); // нові
  }
  has("content/stories/button-canada-2011/story.json");
  has("src/data/curated/story-redirects.json");
  expect(pr.paths.filter((p: string) => p.startsWith("public/img/stories/brawn-gp-2009/")).length).toBeGreaterThan(0);
  expect(pr.paths.filter((p: string) => p.startsWith("public/img/stories/brawn-champions/")).length).toBe(pr.paths.filter((p: string) => p.startsWith("public/img/stories/brawn-gp-2009/")).length);
  const story = JSON.parse(pr.files["content/stories/brawn-champions/story.json"]);
  expect(story.slug).toBe("brawn-champions");
  expect(JSON.stringify(story.media)).not.toContain("brawn-gp-2009");
  expect(JSON.stringify(story.media)).toContain("/img/stories/brawn-champions/");
  expect(JSON.parse(pr.files["content/stories/button-canada-2011/story.json"]).links.stories).toContain("brawn-champions");
  expect(JSON.parse(pr.files["src/data/curated/story-redirects.json"])).toEqual({ "brawn-gp-2009": "brawn-champions" });

  // Пока PR відкритий, ту саму історію не перейменувати вдруге й не редагувати.
  await page.goto("/admin/stories/brawn-gp-2009/address?to=brawn-other");
  await expect(page.getByRole("status").filter({ hasText: "Чекають злиття" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Змінити адресу на/ })).toHaveCount(0);
  // Історія, чий story.json правит цей PR (посилається на стару адресу), теж заблокована — інакше другий PR зіткнувся б при злитті.
  await page.goto("/admin/stories/button-canada-2011");
  await expect(page.getByRole("status").filter({ hasText: "чекають злиття" })).toBeVisible();
  // Інша зміна адреси, що чіпала б спільний файл редиректів, — теж чекає.
  await page.goto("/admin/stories/women-in-f1/address?to=women-racing");
  await expect(page.getByRole("status").filter({ hasText: "Чекають злиття" })).toBeVisible();
});

test("адреса: відмови — адреса в коді, зайнята, некоректна; неіснуюча історія — 404", async ({ page }) => {
  await login(page);
  await page.goto("/admin/stories/jerez-1997/address?to=jerez-final");
  await expect(page.locator(".ad-result.is-bad")).toContainText("прописана в коді");
  await expect(page.getByRole("button", { name: /Змінити адресу на/ })).toHaveCount(0);
  await page.goto("/admin/stories/women-in-f1/address?to=spa-2021");
  await expect(page.locator(".ad-result.is-bad")).toContainText("уже є в іншої історії");
  await page.goto("/admin/stories/women-in-f1/address?to=Bad_Slug");
  await expect(page.locator(".ad-result.is-bad")).toContainText("лише малі латинські літери");
  await expect(page.getByRole("button", { name: /Змінити адресу на/ })).toHaveCount(0);
  expect((await page.goto("/admin/stories/no-such-story/address"))?.status()).toBe(404);
  expect((await page.goto("/admin/stories/no-such-story/address?to=abc"))?.status()).toBe(404);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/stories/women-in-f1/address");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Адреса історії");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("перегляд: сторінка історії в адмінці — розмітка сайту без структурованих даних і «Читайте також»; мова перемикається", async ({ page }) => {
  await openStory(page, "women-in-f1");
  await page.getByRole("link", { name: "Перегляд", exact: true }).click();
  await expect(page).toHaveURL(`${BASE}/admin/stories/women-in-f1/preview`);
  const view = page.locator(".ad-preview");
  await expect(view.getByRole("heading", { level: 1 })).not.toBeEmpty();
  await expect(view.locator("#sources")).toBeVisible();
  await expect(view.locator('script[type="application/ld+json"]')).toHaveCount(0);
  await expect(view.locator(".st-more")).toHaveCount(0);
  await expect(page.locator(".ad-pv-bar").getByText("Опубліковано")).toBeVisible();
  const ukTitle = await view.getByRole("heading", { level: 1 }).textContent();
  await page.getByRole("navigation", { name: "Мова перегляду" }).getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/lang=en/);
  await expect(view).toHaveAttribute("lang", "en");
  expect(await view.getByRole("heading", { level: 1 }).textContent()).not.toBe(ukTitle);
});

test("перегляд: чернетка «в main» видна в адмінці (список → Перегляд); зламаний текст — повідомлення, а не 500", async ({ page }) => {
  const slug = "schumacher-debut-1991";
  const jsonPath = `content/stories/${slug}/story.json`;
  const mdPath = `content/stories/${slug}/uk.md`;
  const story = JSON.parse(readFileSync(join(process.cwd(), jsonPath), "utf8"));
  const override = (path: string, content: string) => page.request.post(`${FAKE}/__override`, { data: { path, content } });
  try {
    await override(jsonPath, JSON.stringify({ ...story, status: "draft" }, null, 2) + "\n");
    await login(page);
    await page.goto(`/admin/stories/${slug}/preview`);
    await expect(page.locator(".ad-pv-bar")).toContainText("Чернетка: на сайті цієї сторінки немає");
    await expect(page.locator(".ad-preview").getByRole("heading", { level: 1 })).toContainText(story.title.uk.split(": ")[0]);
    await expectNoA11yViolations(page);

    // Зіпсований текст: невідомий термін словника → пояснення на сторінці перегляду.
    await override(mdPath, `${readFileSync(join(process.cwd(), mdPath), "utf8")}\n[[t:no-such-term|слово]]\n`);
    await page.reload();
    await expect(page.locator(".ad-result.is-bad")).toContainText("Сторінку не вдалося зібрати");
  } finally {
    await page.request.delete(`${FAKE}/__override?path=${encodeURIComponent(jsonPath)}`);
    await page.request.delete(`${FAKE}/__override?path=${encodeURIComponent(mdPath)}`);
  }
});

test("перегляд: неіснуюча історія — 404; невідома мова в адресі — українська", async ({ page }) => {
  await login(page);
  expect((await page.goto("/admin/stories/no-such-story/preview"))?.status()).toBe(404);
  await page.goto("/admin/stories/women-in-f1/preview?lang=xx");
  await expect(page.locator(".ad-preview")).toHaveAttribute("lang", "uk");
});

test("джерела: адреси з приватної мережі й не-http — пропускаються (SSRF), ні перевірка, ні пошук копій, ні збереження до них не ходять", async ({ page }) => {
  const slug = "imola-1994";
  const jsonPath = `content/stories/${slug}/story.json`;
  const story = JSON.parse(readFileSync(join(process.cwd(), jsonPath), "utf8")) as { sources: { url: string }[] };
  const bad = ["http://169.254.169.254/latest/meta-data/", "http://localhost/admin", "file:///etc/passwd", "http://[::1]/", "https://user:pw@example.com/", "http://2130706433/"];
  story.sources = story.sources.slice(0, bad.length).map((s, i) => ({ ...s, url: bad[i]! }));
  try {
    await page.request.post(`${FAKE}/__override`, { data: { path: jsonPath, content: JSON.stringify(story, null, 2) + "\n" } });
    await login(page);
    await page.goto(`/admin/stories/${slug}/sources`);
    const rows = page.locator(".ad-stories tbody tr");
    await expect(rows).toHaveCount(bad.length);
    await page.getByRole("button", { name: "Перевірити посилання" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Перевірено \d+ з \d+/ })).toBeVisible();
    for (let i = 0; i < bad.length; i++) {
      const cell = rows.nth(i).locator('td[data-label="Посилання"]');
      await expect(cell).toContainText("Не вдалося перевірити");
      await expect(cell).toContainText("пропущено");
    }
    await page.getByRole("button", { name: /Знайти копії в Web Archive/ }).click();
    await expect(page.getByRole("status").filter({ hasText: /Опрацьовано \d+ з \d+/ })).toBeVisible();
    for (let i = 0; i < bad.length; i++) await expect(rows.nth(i).locator('td[data-label="Копія в Web Archive"]')).toContainText("пропущено");
    await rows.first().getByRole("button", { name: /Зберегти в Web Archive/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Не архівуємо: приватна адреса" })).toBeVisible();
  } finally {
    await page.request.delete(`${FAKE}/__override?path=${encodeURIComponent(jsonPath)}`);
  }
});

test("редактор: закодовану на головній/в автотестах історію не зробити чернеткою — відмова без PR", async ({ page }) => {
  await openStory(page, "singapore-2008");
  await page.locator('select[name="status"]').selectOption("draft");
  await page.getByRole("button", { name: "Опублікувати зміни" }).click();
  await expect(summary(page).getByRole("alert")).toContainText("не можна зробити чернеткою");
  await expect((await page.request.get(`${FAKE}/__last-pr?has=${encodeURIComponent("singapore-2008")}`)).status()).toBe(404);
});

test("редактор: історія змінилась у main, поки форма відкрита, — відмова зі збереженими полями (захист від затирання чужої правки)", async ({ page }) => {
  const slug = "f1-points-history";
  const jsonPath = `content/stories/${slug}/story.json`;
  const story = JSON.parse(readFileSync(join(process.cwd(), jsonPath), "utf8"));
  try {
    await openStory(page, slug);
    const title = page.locator('input[name="title_en"]');
    await title.fill("Моя правка, яку не можна втратити");
    // «Хтось інший» змінив історію в main після відкриття форми.
    await page.request.post(`${FAKE}/__override`, { data: { path: jsonPath, content: JSON.stringify({ ...story, checked: "2026-11-20" }, null, 2) + "\n" } });
    await page.getByRole("button", { name: "Опублікувати зміни" }).click();
    await expect(summary(page).getByRole("alert")).toContainText("Історія змінилась у репозиторії");
    await expect(title).toHaveValue("Моя правка, яку не можна втратити"); // значення форми лишились
    expect((await page.request.get(`${FAKE}/__last-pr?has=${encodeURIComponent(slug)}`)).status()).toBe(404);
  } finally {
    await page.request.delete(`${FAKE}/__override?path=${encodeURIComponent(jsonPath)}`);
  }
});
