import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

const LIGHT_PAPER = "rgb(243, 244, 241)";
const DARK_PAPER = "rgb(17, 18, 22)";

/** Стан на DOMContentLoaded — до гідратації React: так видно, чи був кадр у «чужій» темі. */
async function stateAtDomReady(page: Page, stored: string | null) {
  await page.addInitScript((value) => {
    if (value !== null) localStorage.setItem("ss-theme", value);
    document.addEventListener("DOMContentLoaded", () => {
      (window as unknown as { __ready: unknown }).__ready = {
        theme: document.documentElement.getAttribute("data-theme"),
        bg: getComputedStyle(document.body).backgroundColor,
      };
    });
  }, stored);
  await page.goto("/");
  return page.evaluate(() => (window as unknown as { __ready: { theme: string | null; bg: string } }).__ready);
}

test.describe("тема", () => {
  test.use({ colorScheme: "dark" });

  test("системна темна + збережена світла → світла ще до гідратації", async ({ page }) => {
    expect(await stateAtDomReady(page, "light")).toEqual({ theme: "light", bg: LIGHT_PAPER });
  });

  test("без збереженого вибору діє системна тема", async ({ page }) => {
    expect(await stateAtDomReady(page, null)).toEqual({ theme: null, bg: DARK_PAPER });
  });

  test("сміття у сховищі ігнорується", async ({ page }) => {
    expect(await stateAtDomReady(page, "purple")).toEqual({ theme: null, bg: DARK_PAPER });
  });

  test("перемикач змінює data-theme і сховище, вибір переживає перезавантаження", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Switch to light theme" });
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => localStorage.getItem("ss-theme"))).toBe("light");
    await expect(page.getByRole("button", { name: "Switch to dark theme" })).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("body")).toHaveCSS("background-color", LIGHT_PAPER);

    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => localStorage.getItem("ss-theme"))).toBe("dark");
  });

  test("підпис перемикача українською", async ({ page }) => {
    await page.goto("/uk");
    await expect(page.getByRole("button", { name: "Увімкнути світлу тему" })).toBeVisible();
  });

  test("без порушень axe у темній темі", async ({ page }) => {
    await page.goto("/");
    await expectNoA11yViolations(page);
  });
});

test("шрифти: заголовок — Rubik Mono One, текст — IBM Plex Sans, кирилиця завантажена", async ({ page }) => {
  await page.goto("/uk");
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => ({
    h1: getComputedStyle(document.querySelector("h1")!).fontFamily,
    body: getComputedStyle(document.body).fontFamily,
    cyrDisplay: document.fonts.check('16px "Rubik Mono One"', "Ґє"),
    loaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family),
  }));
  expect(fonts.h1).toMatch(/Rubik Mono One/);
  expect(fonts.body).toMatch(/IBM Plex Sans/);
  expect(fonts.loaded.some((f) => /Rubik Mono One/.test(f))).toBe(true);
});
