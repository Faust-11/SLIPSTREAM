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

async function lastPr(page: Page): Promise<{ title: string; body: string; draft: boolean; paths: string[] }> {
  return (await page.request.get(`${FAKE}/__last-pr`)).json();
}

test("черга пілотів без фото → Commons: ND не обрати, NC — з попередженням; публікація пари — PR з аватаром, банером і JSON", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Фото" }).click();
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
  await expect(page.getByRole("radio", { name: "Обидва місця" })).toBeChecked();
  await page.getByRole("button", { name: "Опублікувати" }).first().click();
  await expect(page.getByRole("status")).toContainText("Опубліковано");

  const pr = await lastPr(page);
  expect(pr.title).toBe(`Фото · ${driver} (картка й банер)`);
  expect(pr.draft).toBe(false);
  expect(pr.body).toContain("Fake Photographer");
  expect(pr.paths.filter((p) => p.endsWith(".webp")).map((p) => p.replace(/.*-/, ""))).toEqual(["96.webp", "420.webp", "640.webp"]);
  expect(pr.paths).toEqual(expect.arrayContaining(["src/data/curated/driver-portraits.json", "src/data/curated/driver-heroes.json"]));
});

test("своє фото: браузер зменшує до 2560 px; без підтвердження прав — не відправляється; PR — лише аватар", async ({ page }) => {
  await login(page);
  await page.goto("/admin/photos/driver/hamilton");
  await page.getByText("Своє фото").click();
  const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 200, g: 50, b: 50 } } }).jpeg().toBuffer();
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
  const pr = await lastPr(page);
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
  const pr = await lastPr(page);
  expect(pr.draft).toBe(true);
  const key = href.split("/").pop()!;
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
