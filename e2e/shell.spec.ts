import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

const SECTIONS = ["/seasons", "/calendar", "/news", "/drivers", "/teams", "/circuits", "/stories", "/newbie", "/game"];

for (const width of [320, 360, 390]) {
  test(`${width} px: шапка влазить, бургер є, десктопного меню немає`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/uk");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("button", { name: "Меню" })).toBeVisible();
    await expect(page.locator(".site-head .nav")).toBeHidden();
    // Усі елементи шапки в межах екрана.
    for (const sel of [".site-head .brand", ".site-head .lang", ".mnav-btn"]) {
      const box = await page.locator(sel).boundingBox();
      expect(box!.x + box!.width, sel).toBeLessThanOrEqual(width);
    }
  });
}

for (const width of [861, 1024, 1100, 1140, 1141, 1280, 1440]) {
  test(`${width} px: без горизонтального скролу й переносу пунктів меню (EN і UK)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ["/", "/uk"]) {
      await page.goto(path);
      const r = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        head: document.querySelector(".site-head")!.getBoundingClientRect().height,
        burger: getComputedStyle(document.querySelector(".mnav-btn")!).display !== "none",
      }));
      expect(r.overflow, `${path} @${width}`).toBeLessThanOrEqual(0);
      expect(r.head, `${path} @${width}`).toBe(64);
      expect(r.burger, `${path} @${width}`).toBe(width <= 1140);
    }
  });
}

test("1280 px: десктопне меню з 9 розділами, бургера немає", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link")).toHaveCount(9);
  await expect(page.locator(".mnav-btn")).toBeHidden();
  await expect(nav.getByRole("link", { name: "Play" })).toHaveCSS("color", "rgb(255, 196, 0)");
});

test("мобільне меню: відкривається, Escape закриває, фокус повертається", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");
  const button = page.getByRole("button", { name: "Menu" });
  await button.click();
  const panel = page.locator(".mnav");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link")).toHaveCount(9);
  await expect(page.locator("main")).toHaveAttribute("inert", "");
  await expectNoA11yViolations(page);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page.getByRole("button", { name: "Menu" })).toBeFocused();
});

test("футер містить усі 9 розділів обома мовами", async ({ page }) => {
  for (const [path, prefix] of [["/", ""], ["/uk", "/uk"]] as const) {
    await page.goto(path);
    const hrefs = await page.locator(".foot-nav a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs).toEqual(SECTIONS.map((s) => prefix + s));
  }
});

test.describe("без JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("розділи досяжні через футер, бургер прихований, у шапці — посилання на розділи", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/uk");
    await expect(page.locator(".mnav-btn")).toBeHidden();
    const fallback = page.getByRole("link", { name: "Меню ↓" });
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveAttribute("href", "#sections");
    const links = page.locator(".foot-nav a");
    await expect(links).toHaveCount(9);
    for (const link of await links.all()) await expect(link).toBeVisible();
  });
});

test("перемикач мови зберігає сторінку й параметри", async ({ page }) => {
  await page.goto("/?q=lotus");
  const toUk = page.getByRole("group", { name: "Language" }).getByRole("link", { name: "Українська" });
  await expect(toUk).toHaveAttribute("href", "/uk?q=lotus");
  await toUk.click();
  await expect(page).toHaveURL(/\/uk\?q=lotus$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  const toEn = page.getByRole("group", { name: "Мова" }).getByRole("link", { name: "English" });
  await expect(toEn).toHaveAttribute("href", "/?q=lotus");
  await expect(page.getByRole("group", { name: "Мова" }).locator('[aria-current="true"]')).toHaveText("UK");
  // Порядок як у макеті.
  await expect(page.locator(".lang .lang-item").first()).toContainText("UK");
});

test("футер: притиснутий до низу, посилання Jolpica підкреслене", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/teams");
  const bottom = await page.locator(".site-foot").evaluate((el) => el.getBoundingClientRect().bottom);
  expect(Math.round(bottom)).toBeGreaterThanOrEqual(1000);
  await expect(page.getByRole("link", { name: "Jolpica F1" })).toHaveCSS("text-decoration-line", "underline");
});

test("фокус у шапці видимий (жовте кільце на темному тлі)", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab"); // skip-link
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Tab");
  const brand = page.getByRole("link", { name: "Slipstream — home" }).first();
  await expect(brand).toBeFocused();
  await expect(brand).toHaveCSS("outline-color", "rgb(255, 196, 0)");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`без порушень axe: ${colorScheme}, обидві мови, мобільний і десктоп`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ["/", "/uk"]) {
        await page.goto(path);
        await expectNoA11yViolations(page);
      }
    }
  });
}
