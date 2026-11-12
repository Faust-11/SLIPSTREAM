import { expect, test, type Page } from "@playwright/test";
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
  await expect(page.locator(".facts li")).toHaveText(["793 пілоти", "36 чемпіонів світу", "116 переможців гонок"]);
  await expect(page.locator(".drv-now .drv-card").first()).toContainText("P1");
  await hydrated(page);
  await expect(rows(page)).toHaveCount(25);
  await expect(rows(page).first()).toContainText("Льюїс Гамілтон");
  await expect(page.locator(".drv-browser .count")).toHaveText("1–25 з 793");
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

test("посилання зі станом відкриває той самий результат; сміття в адресі — типові значення", async ({ page }) => {
  await page.goto("/drivers?f=win&l=S&sort=n");
  await hydrated(page);
  await expect(page.getByRole("button", { name: "Race winners" })).toHaveAttribute("aria-pressed", "true");
  const names = await rows(page).locator(".nm > span:first-child").allTextContents();
  expect(names.length).toBeGreaterThan(3);
  await page.goto("/drivers?f=evil&sort=<x>&p=-1&d=1985");
  await hydrated(page);
  await expect(page.locator(".drv-browser .count")).toHaveText("1–25 of 793");
});

test.describe("без JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("таблиця з інструментами прихована, повний перелік — 793 пункти", async ({ page }) => {
    await page.goto("/uk/drivers");
    await expect(page.locator(".drv-browser")).toBeHidden();
    await expect(page.locator(".drv-noscript li")).toHaveCount(793);
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
