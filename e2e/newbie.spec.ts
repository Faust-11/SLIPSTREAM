import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// «Новачкам» + словник-підказки (фаза 5b). Еталони — content/glossary/terms.json і content/newbie/page.json.
const glossary = JSON.parse(readFileSync(join(process.cwd(), "content", "glossary", "terms.json"), "utf8")) as { terms: { id: string }[] };
const TERMS = glossary.terms.length;

test("/uk/newbie: розділи, цифри сезону з бази, словник, джерела під розділами, без помилок консолі", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/uk/newbie");
  await expect(page.locator("h1")).toContainText("Формула-1");
  for (const id of ["basics", "weekend", "points", "tyres", "flags", "overtake", "glossary"]) await expect(page.locator(`section#${id}`)).toHaveCount(1);
  // Зміст веде на наявні розділи.
  for (const h of await page.locator(".nb-toc a").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).hash))) await expect(page.locator(h)).toHaveCount(1);
  await expect(page.locator(".nb-gl-item")).toHaveCount(TERMS);
  // Рішення 15.11: джерела — рядок під кожним розділом правил.
  await expect(page.locator(".nb-sec .nb-src")).toHaveCount(7);
  // Фактчек 15.11: Q3 — 13 хв (регламент FIA B2.4.2c), а не 12, як у макеті.
  await expect(page.locator(".nb-qrow").nth(2)).toContainText("13 хв");
  // Приклад очок — Сан-Паулу 2026 з бази: десятка, переможець — 25.
  await expect(page.locator(".nb-tbl tbody tr")).toHaveCount(10);
  await expect(page.locator(".nb-tbl tbody tr").first().locator(".nb-c-pts")).toHaveText("25");
  expect(errors).toEqual([]);
});

test("словник: пошук за українською й англійською назвою, лічильник у role=status, порожній стан", async ({ page }) => {
  await page.goto("/uk/newbie#glossary");
  const q = page.getByRole("searchbox", { name: "Пошук у словнику" });
  await q.fill("undercut");
  await expect(page.locator(".nb-gl-item:visible")).toHaveCount(1);
  await expect(page.locator(".nb-gl-item:visible dt")).toContainText("Андеркат");
  await expect(page.locator(".nb-gl-count")).toHaveText(`1 з ${TERMS}`);
  await q.fill("бокс");
  expect(await page.locator(".nb-gl-item:visible").count()).toBeGreaterThanOrEqual(1);
  await q.fill("жжжжж");
  await expect(page.locator(".nb-gl-item:visible")).toHaveCount(0);
  await expect(page.getByText("Нічого не знайдено")).toBeVisible();
});

test("гра «Старт»: натискання до згасання вогнів — фальстарт", async ({ page }) => {
  await page.goto("/uk/newbie");
  const go = page.getByRole("button", { name: "Запустити вогні" });
  await go.click();
  await expect(page.locator(".nb-pod.nb-on").first()).toBeVisible({ timeout: 2500 });
  await page.getByRole("button", { name: /Чекайте/ }).click();
  await expect(page.locator(".nb-out")).toContainText("Фальстарт");
  await expect(page.getByRole("button", { name: "Ще раз" })).toBeVisible();
});

test("без JS: увесь словник, без поля пошуку; гра — підказка замість кнопки", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/uk/newbie");
  await expect(page.locator(".nb-gl-item:visible")).toHaveCount(TERMS);
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await expect(page.locator(".nb-nojs")).toBeVisible();
  await ctx.close();
});

test("підказка в історії: перша поява терміна — кнопка; відкривається, Esc закриває й повертає фокус; посилання на словник", async ({ page }) => {
  await page.goto("/uk/stories/suzuka-1989");
  const btn = page.locator('.st-ch .gt-t[data-term="chicane"]');
  await expect(btn).toHaveCount(1);
  await btn.focus();
  await page.keyboard.press("Enter");
  const tip = page.locator(".gt-tip:popover-open");
  await expect(tip).toHaveCount(1);
  await expect(tip).toContainText("Шикана");
  await expect(tip.getByRole("link", { name: "У словнику →" })).toHaveAttribute("href", "/uk/newbie#g-chicane");
  await page.keyboard.press("Escape");
  await expect(page.locator(".gt-tip:popover-open")).toHaveCount(0);
  await expect(btn).toBeFocused();
  await expectNoA11yViolations(page);
});

test("підказки в протоколі гонки: «Старт» у заголовку, віконце одне на кілька таблиць", async ({ page }) => {
  await page.goto("/uk/seasons/2025/24");
  const heads = page.locator('th .gt-t[data-term="grid"]');
  expect(await heads.count()).toBeGreaterThanOrEqual(1);
  await expect(page.locator("#gt-s-grid")).toHaveCount(1);
  await heads.first().click();
  await expect(page.locator("#gt-s-grid")).toBeVisible();
  await expect(page.locator("#gt-s-grid")).toContainText("Стартова решітка");
});

test("en: /newbie англійською, сортування словника за англійською абеткою", async ({ page }) => {
  await page.goto("/newbie");
  await expect(page.locator("h1")).toContainText("Formula 1");
  const names = await page.locator(".nb-gl dt > span:first-child").allTextContents();
  const clean = names.map((n) => n.replace(/^[«“"]/, ""));
  expect(clean).toEqual([...clean].sort(new Intl.Collator("en", { sensitivity: "base" }).compare));
});
