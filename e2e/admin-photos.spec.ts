import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { expectNoA11yViolations } from "./axe";

// Фото (7b). Фейки — scripts/dev/fake-services.mjs: Commons (3 файли: PD, NC, ND) і GitHub API (записує PR).
const FAKE = "http://127.0.0.1:4455";
const BASE = "http://localhost:3100";
const LOGIN = "/admin/auth/login?key=e2e-login-key-0123456789";

test.skip(!!process.env.BASE_URL, "фейкові сервіси — лише локально і в CI");

async function login(page: Page) {
  await page.context().addCookies([{ name: "fake_gh", value: "195572242:Faust-11", url: FAKE }]);
  await page.goto(LOGIN);
  await Promise.all([page.waitForURL((u) => u.origin === BASE && !u.pathname.startsWith("/admin/auth")), page.getByRole("link", { name: "Увійти через GitHub" }).click()]);
}

/** Останній PR, у назві якого є has (тести йдуть паралельно на одному фейку). */
async function lastPr(page: Page, has: string): Promise<{ title: string; body: string; draft: boolean; paths: string[] }> {
  return (await page.request.get(`${FAKE}/__last-pr?has=${encodeURIComponent(has)}`)).json();
}

test("черга пілотів без фото → Commons: ND не обрати, NC — з попередженням; публікація пари — PR з аватаром, банером і JSON", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Фото", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Фото");
  const first = page.locator("#ad-queue ~ .ad-items a").first();
  const driver = (await first.locator("b").innerText()).trim();
  await first.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(driver);

  const cards = page.locator(".ad-cands li");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(2)).toContainText("не можна");
  await expect(cards.nth(2).getByRole("link", { name: "Обрати" })).toHaveCount(0);

  await cards.nth(1).getByRole("link", { name: "Обрати" }).click();
  await expect(page.getByText("Лише некомерційно: якщо на сайті")).toBeVisible();

  await page.goBack();
  await page.locator(".ad-cands li").first().getByRole("link", { name: "Обрати" }).click();
  // Пілот без аватара: лише «обидва» — вибору немає (банер без аватара сайт не показує; code-review 7b).
  await expect(page.getByRole("radio", { name: "Обидва місця" })).toHaveCount(0);
  await page.getByRole("button", { name: "Опублікувати" }).first().click();
  await expect(page.getByRole("status")).toContainText("Опубліковано");

  const pr = await lastPr(page, driver);
  expect(pr.title).toBe(`Фото · ${driver} (картка й банер)`);
  expect(pr.draft).toBe(false);
  expect(pr.body).toContain("Fake Photographer");
  expect(pr.paths.filter((p) => p.endsWith(".webp")).map((p) => p.replace(/.*-/, ""))).toEqual(["96.webp", "420.webp", "640.webp"]);
  expect(pr.paths).toEqual(expect.arrayContaining(["src/data/curated/driver-portraits.json", "src/data/curated/driver-heroes.json"]));
});

test("своє фото: браузер зменшує до 2560 px і < 3,8 МБ (шум — як фото з деталями); без підтвердження прав — не відправляється; PR — лише аватар", async ({ page }) => {
  await login(page);
  await page.goto("/admin/photos/driver/hamilton");
  await page.getByText("Своє фото").click();
  // Шум стискається гірше за справжнє фото: якщо пройде він — пройде й телефонний знімок (code-review 7b: суцільний колір
  // давав кілька КБ і не помічав ліміту тіла server action 1 МБ).
  const noise = Buffer.alloc(4000 * 3000 * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 256) | 0;
  const big = await sharp(noise, { raw: { width: 4000, height: 3000, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
  expect(big.length).toBeGreaterThan(5_000_000);
  await page.getByLabel("Файл").setInputFiles({ name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: big });
  await expect(page.getByRole("status").filter({ hasText: "2560×1920 px" })).toBeVisible();
  const form = page.locator("details form");
  await form.getByLabel("Автор", { exact: true }).fill("Faust");
  await form.getByLabel(/Посилання/).fill("https://example.com/me");
  await form.getByRole("radio", { name: "Лише аватар" }).check();
  await form.getByRole("button", { name: "Опублікувати" }).click();
  // Браузерна перевірка required: без галочки форма не йде.
  await expect(page.getByRole("status").filter({ hasText: "Опубліковано" })).toHaveCount(0);
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Опублікувати" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Опубліковано" })).toBeVisible();
  const pr = await lastPr(page, "Гамілтон");
  expect(pr.title).toContain("(лише картка)");
  expect(pr.paths.filter((p) => p.endsWith(".webp"))).toEqual(["public/img/drivers/hamilton-96.webp"]);
  expect(pr.body).toContain("Автор: Faust · ліцензія: CC BY 4.0");
});

test("банер конкретної гонки: race-photos.json і файли 1280/800/480; чернетка — draft PR", async ({ page }) => {
  await login(page);
  await page.goto("/admin/photos?k=race");
  const race = page.locator("#ad-queue ~ .ad-items a").first();
  const href = (await race.getAttribute("href"))!;
  await page.goto(`${href}?file=${encodeURIComponent("Fake Driver Portrait 1958.jpg")}`);
  await expect(page.getByRole("radio", { name: "Обидва місця" })).toHaveCount(0);
  await page.getByRole("button", { name: "Зберегти чернетку" }).first().click();
  await expect(page.getByRole("status")).toContainText("Чернетку збережено");
  const key = href.split("/").pop()!;
  // textContent, а не innerText: заголовок у CSS uppercase, а назва PR — як у даних.
  const raceName = ((await page.getByRole("heading", { level: 1 }).textContent()) ?? "").trim();
  const pr = await lastPr(page, raceName);
  expect(pr.draft).toBe(true);
  expect(pr.paths).toEqual([`public/img/races/${key}-hero-1280.webp`, `public/img/races/${key}-hero-800.webp`, `public/img/races/${key}-hero-480.webp`, "src/data/curated/race-photos.json"]);
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [390, 1280]) {
    test(`Фото без порушень axe і горизонтальної прокрутки: ${colorScheme}, ${width} px`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width, height: 900 });
      await login(page);
      for (const path of ["/admin/photos", "/admin/photos/team/ferrari", `/admin/photos/team/ferrari?file=${encodeURIComponent("Fake Driver Portrait 1958.jpg")}`]) {
        await page.goto(path);
        await expectNoA11yViolations(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
      }
    });
  }
}

test("зняти за запитом автора: без підтвердження — ні; команда — картка й банер, teams.json; NC-фото — список", async ({ page }) => {
  await login(page);
  await page.goto("/admin/photos");
  await expect(page.locator("#ad-nc")).toContainText("Лише некомерційно (NC) · 0");
  await page.goto("/admin/photos/team/ferrari");
  await page.getByText("Зняти за запитом автора").click();
  const form = page.locator("details form").filter({ hasText: "Зняти фото" });
  await expect(form).toContainText("Знімаються обидва фото");
  await form.getByRole("button", { name: "Зняти фото" }).click();
  await expect(page.getByRole("status").filter({ hasText: "знімається" })).toHaveCount(0); // required-галочка
  await form.getByRole("checkbox").check();
  await form.getByLabel(/Причина/).fill("лист автора 17.11");
  await form.getByRole("button", { name: "Зняти фото" }).click();
  await expect(page.getByRole("status")).toContainText("Фото знімається з сайту");
  const pr = await lastPr(page, "Знято");
  expect(pr.title).toBe("Знято за запитом автора · Ferrari");
  expect(pr.body).toContain("лист автора 17.11");
  expect(pr.paths).toEqual([
    "public/img/cars/ferrari-480.webp",
    "public/img/cars/ferrari-256.webp",
    "public/img/cars/ferrari-hero-1280.webp",
    "public/img/cars/ferrari-hero-800.webp",
    "public/img/cars/ferrari-hero-480.webp",
    "src/data/curated/teams.json",
  ]);
});
