import { expect, test, type Page } from "@playwright/test";
import { expectSearchSurvivesRace } from "./search-race";
import { expectNoA11yViolations } from "./axe";

async function hydrated(page: Page) {
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}
const rows = (page: Page) => page.locator(".drv-browser tbody tr");

test("/uk/drivers: підсумки, сезон, таблиця (25 рядків, перемоги ↓)", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const res = await page.goto("/uk/drivers");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Пілоти");
  await expect(page.locator(".facts li")).toHaveText(["790 пілотів", "36 чемпіонів світу", "116 переможців гонок"]);
  await expect(page.locator(".drv-now .drv-card").first()).toContainText("P1");
  await hydrated(page);
  await expect(rows(page)).toHaveCount(25);
  await expect(rows(page).first()).toContainText("Льюїс Гамілтон");
  await expect(page.locator(".drv-browser .count")).toHaveText("1–25 з 790");
  expect(errors).toEqual([]);
});

test("пошук, фільтр чемпіонів, літера, сортування й сторінки — стан в адресі", async ({ page }) => {
  await page.goto("/uk/drivers");
  await hydrated(page);
  await page.getByRole("searchbox").fill("сенна");
  await expect(rows(page)).toHaveCount(2); // Айртон і Бруно Сенна
  await expect(page).toHaveURL(/q=%D1%81%D0%B5%D0%BD%D0%BD%D0%B0/);
  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: "Чемпіони" }).click();
  await expect(page.locator(".drv-browser .count")).toHaveText("1–25 з 36");
  await page.getByRole("button", { name: "Сторінка 2" }).click();
  await expect(rows(page)).toHaveCount(11);
  await expect(page).toHaveURL(/f=ch.*p=2|p=2.*f=ch/);
  await page.getByRole("button", { name: "Старти" }).click();
  await expect(page.locator('th[aria-sort="descending"]')).toContainText("Старти");
  await expect(page.locator(".drv-browser .count")).toHaveText("1–25 з 36");
});

test("посилання зі станом: лише переможці на S, за прізвищем ↑; сміття в адресі — типові значення", async ({ page }) => {
  await page.goto("/drivers?f=win&l=S&sort=n");
  await hydrated(page);
  await expect(page.getByRole("button", { name: "Race winners" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('th[aria-sort="ascending"]')).toContainText("Driver");
  const names = await rows(page).locator(".nm > span:first-child").allTextContents();
  const surnames = names.map((n) => n.replace(/×\d+$/, "").trim().split(" ").at(-1)!);
  expect(surnames.length).toBeGreaterThan(3);
  expect(surnames.every((sn) => /^S/.test(sn.normalize("NFD")))).toBe(true);
  expect(surnames).toEqual([...surnames].sort((a, b) => a.localeCompare(b, "en")));
  await page.goto("/drivers?f=evil&sort=<x>&d=1985");
  await hydrated(page);
  await expect(page.locator(".drv-browser .count")).toHaveText("1–25 of 790");
  await expect(page.locator('th[aria-sort="descending"]')).toContainText("Wins");
  // Сторінка поза межами — остання, і адреса виправлена.
  await page.goto("/uk/drivers?p=999");
  await hydrated(page);
  await expect(page.locator(".drv-browser .count")).toHaveText("776–790 з 790");
  await expect(page).toHaveURL(/p=32$/);
});

test("пошук із пробілом і без діакритики набирається з клавіатури (code-review 12.11)", async ({ page }) => {
  await page.goto("/drivers");
  await hydrated(page);
  await page.getByRole("searchbox").pressSequentially("ayrton senna", { delay: 30 });
  await expect(page.getByRole("searchbox")).toHaveValue("ayrton senna");
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("searchbox").fill("");
  await page.getByRole("searchbox").pressSequentially("hakkinen", { delay: 30 });
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Häkkinen");
});

test("зміна сторінки — фокус на лічильнику; нуль результатів — оголошення в live-регіоні", async ({ page }) => {
  await page.goto("/uk/drivers");
  await hydrated(page);
  await page.getByRole("button", { name: "Сторінка 2" }).click();
  await expect(page.locator(".drv-browser .count")).toBeFocused();
  await page.getByRole("searchbox").fill("zzzz");
  await expect(page.locator(".drv-browser .count")).toHaveText("Нічого не знайдено.");
});

test("автори портретів — окрема сторінка, посилання з «Пілоти»", async ({ page }) => {
  await page.goto("/uk/drivers");
  await page.getByRole("link", { name: /Портрети пілотів: автори й ліцензії/ }).click();
  await expect(page).toHaveURL(/\/uk\/drivers\/credits$/);
  const items = page.locator(".page-credits li");
  expect(await items.count()).toBeGreaterThan(400);
  await expect(items.first().locator("a")).toHaveAttribute("href", /^https:\/\/commons\.wikimedia\.org\//);
});

test.describe("без JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("таблиця з інструментами прихована; посилання на повний перелік — 790 пунктів", async ({ page }) => {
    await page.goto("/uk/drivers");
    await expect(page.locator(".drv-browser")).toBeHidden();
    await page.getByRole("link", { name: /Усі пілоти списком/ }).click();
    await expect(page).toHaveURL(/\/uk\/drivers\/all$/);
    await expect(page.locator(".drv-noscript li")).toHaveCount(790);
  });
});

for (const theme of ["light", "dark"] as const)
  for (const width of [390, 1280])
    test(`без порушень axe: ${theme}, ${width} px`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/uk/drivers");
      await hydrated(page);
      await expectNoA11yViolations(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });

// Пошук: ранній ввід (до гідратації) і швидкий набір не губляться (замір 13.11 на main; PR #18).
test("пошук: ввід одразу після відкриття й швидкий набір не губляться", async ({ page }) => {
  await expectSearchSurvivesRace(page, "/uk/drivers", "Пошук пілота", "senna", "ayrton senna");
});
