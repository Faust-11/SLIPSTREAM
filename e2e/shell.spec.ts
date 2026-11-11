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
      // Бургер з'являється після гідратації — чекаємо її, інакше гонка.
      await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
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
  // «Гра» — заливна жовта плашка (рішення користувача 11.11).
  const play = nav.getByRole("link", { name: "Play" });
  await expect(play).toHaveCSS("background-color", "rgb(255, 196, 0)");
  await expect(play).toHaveCSS("color", "rgb(22, 24, 29)");
});

test("1280 px: жовтий — лише плашка «Гра» й підкреслення поточного розділу, не наведення", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/uk/teams");
  const nav = page.getByRole("navigation", { name: "Головне меню" });
  const current = nav.getByRole("link", { name: "Команди" });
  await expect(current).toHaveAttribute("aria-current", "page");
  await expect(current).toHaveCSS("color", "rgb(243, 244, 241)");
  await expect(current).toHaveCSS("box-shadow", /rgb\(255, 196, 0\)/);
  const other = nav.getByRole("link", { name: "Сезони" });
  await other.hover();
  await expect(other).toHaveCSS("color", "rgb(243, 244, 241)");
  await expect(other).toHaveCSS("box-shadow", /rgb\(243, 244, 241\)/);
  // Поточна «Гра»: плашка лишається, позначка поточного — жовта риска під плашкою, з відступом.
  await page.goto("/uk/game");
  const play = nav.getByRole("link", { name: "Гра" });
  await expect(play).toHaveAttribute("aria-current", "page");
  await expect(play).toHaveCSS("background-color", "rgb(255, 196, 0)");
  const mark = await play.evaluate((el) => {
    const a = getComputedStyle(el, "::after");
    return { bg: a.backgroundColor, h: a.height, bottom: a.bottom };
  });
  expect(mark).toEqual({ bg: "rgb(255, 196, 0)", h: "2px", bottom: "-6px" });
});

test.describe("мобільне меню", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  async function openMenu(page: import("@playwright/test").Page) {
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
    const button = page.getByRole("button", { name: "Menu" });
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    return button;
  }

  async function expectClosed(page: import("@playwright/test").Page) {
    await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".mnav")).toBeHidden();
    await expect(page.locator("main")).not.toHaveAttribute("inert");
    await expect(page.locator("body")).not.toHaveClass(/mnav-open/);
  }

  test("панель: «Гра» — жовта плашка, поточний розділ — жовта позначка без жовтого тексту", async ({ page }) => {
    await page.goto("/uk/teams");
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
    await page.getByRole("button", { name: "Меню" }).click();
    const panel = page.locator(".mnav");
    const current = panel.getByRole("link", { name: "Команди" });
    await expect(current).toHaveAttribute("aria-current", "page");
    await expect(current).toHaveCSS("color", "rgb(243, 244, 241)");
    expect(await current.evaluate((el) => getComputedStyle(el, "::after").color)).toBe("rgb(255, 196, 0)");
    const plate = panel.getByRole("link", { name: "Гра" }).locator(".mnav-plate");
    await expect(plate).toHaveCSS("background-color", "rgb(255, 196, 0)");
    await expect(plate).toHaveCSS("color", "rgb(22, 24, 29)");
    // Рядок «Гра» тієї ж висоти, що й інші; плашка — по лінії тексту, не ближче до краю.
    const rows = await panel.getByRole("link").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(new Set(rows).size).toBe(1);
    const left = await panel.getByRole("link", { name: "Сезони" }).evaluate((e) => e.getBoundingClientRect().left);
    expect(Math.round((await plate.boundingBox())!.x)).toBe(Math.round(left));
    const other = panel.getByRole("link", { name: "Сезони" });
    await other.hover();
    await expect(other).toHaveCSS("color", "rgb(243, 244, 241)");
    await expectNoA11yViolations(page);
  });

  test("відкривається; Escape з фокусом у панелі закриває й повертає фокус", async ({ page }) => {
    await page.goto("/");
    await openMenu(page);
    const panel = page.locator(".mnav");
    await expect(panel.getByRole("link")).toHaveCount(9);
    await expect(page.locator("main")).toHaveAttribute("inert", "");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeHidden();
    await expectNoA11yViolations(page);
    await page.keyboard.press("Tab");
    await expect(panel.getByRole("link").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expectClosed(page);
    await expect(page.getByRole("button", { name: "Menu" })).toBeFocused();
  });

  test("закривається при переході поза панеллю: логотип, Back", async ({ page }) => {
    await page.goto("/teams");
    await openMenu(page);
    await page.getByRole("link", { name: "Slipstream — home" }).first().click();
    await expect(page).toHaveURL(/\/$/);
    await expectClosed(page);

    await openMenu(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/teams$/);
    await expectClosed(page);
  });

  test("закривається, коли вікно стає десктопним", async ({ page }) => {
    await page.goto("/");
    await openMenu(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator("main")).not.toHaveAttribute("inert");
    await expect(page.locator("body")).not.toHaveClass(/mnav-open/);
  });

  test("після переходу з клавіатури фокус на початку змісту", async ({ page }) => {
    await page.goto("/");
    await openMenu(page);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/seasons$/);
    await expect(page.locator("main#main")).toBeFocused();
  });

  test("до гідратації (бандл не завантажився) — замість бургера посилання на розділи", async ({ page }) => {
    // ** — і з query (на Vercel до чанків додається ?dpl=…).
    await page.route(/\/_next\/static\/chunks\/.+\.js(\?.*)?$/, (route) => route.abort());
    await page.goto("/uk");
    await expect(page.locator(".mnav-btn")).toBeHidden();
    const fallback = page.getByRole("link", { name: "Меню", exact: true });
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveAttribute("href", "#sections");
  });
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

  test("404 на 320 px: один логотип, без горизонтального скролу", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/uk/nope");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await expect(page.locator(".site-head .brand:visible")).toHaveCount(1);
  });

  test("розділи досяжні через футер, бургер прихований, у шапці — посилання на розділи", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/uk");
    await expect(page.locator(".mnav-btn")).toBeHidden();
    const fallback = page.getByRole("link", { name: "Меню", exact: true });
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveAttribute("href", "#sections");
    const links = page.locator(".foot-nav a");
    await expect(links).toHaveCount(9);
    for (const link of await links.all()) await expect(link).toBeVisible();
  });
});

test("перемикач мови зберігає сторінку й параметри: /teams?q=lotus ↔ /uk/teams?q=lotus", async ({ page }) => {
  await page.goto("/teams?q=lotus");
  const toUk = page.getByRole("group", { name: "Language" }).getByRole("link", { name: "Українська" });
  await expect(toUk).toHaveAttribute("href", "/uk/teams?q=lotus");
  await toUk.click();
  await expect(page).toHaveURL(/\/uk\/teams\?q=lotus$/);
  await expect(page.getByRole("group", { name: "Мова" }).getByRole("link", { name: "English" })).toHaveAttribute(
    "href",
    "/teams?q=lotus",
  );
});

test("активний розділ на десктопі: aria-current і після клієнтського переходу", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/teams");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Teams" })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Drivers" }).click();
  await expect(page).toHaveURL(/\/drivers$/);
  await expect(nav.getByRole("link", { name: "Drivers" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Teams" })).not.toHaveAttribute("aria-current");
});

test("зміна мови з клавіатури — фокус на змісті, не на <body>", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/teams");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  const toUk = page.getByRole("link", { name: /Українська/ });
  await toUk.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/uk\/teams$/);
  await expect(page.locator("main#main")).toBeFocused();
});

test("skip-link переносить фокус на зміст", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
});

test("перемикач мови на головній зберігає параметри", async ({ page }) => {
  await page.goto("/?q=lotus");
  const toUk = page.getByRole("group", { name: "Language" }).getByRole("link", { name: "Українська" });
  await expect(toUk).toHaveAttribute("href", "/uk?q=lotus");
  await toUk.click();
  await expect(page).toHaveURL(/\/uk\?q=lotus$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  const toEn = page.getByRole("group", { name: "Мова" }).getByRole("link", { name: "English" });
  await expect(toEn).toHaveAttribute("href", "/?q=lotus");
  await expect(page.getByRole("group", { name: "Мова" }).locator('[aria-current="true"]')).toHaveText("UA");
  // Порядок як у макеті.
  await expect(page.locator(".lang .lang-item").first()).toContainText("UA");
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
  for (const width of [390, 1280]) {
    for (const path of ["/", "/uk"]) {
      test(`без порушень axe: ${colorScheme}, ${width} px, ${path}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path);
        await expectNoA11yViolations(page);
      });
    }
  }
}

test("клієнтський перехід на головну — без перезавантаження сторінки (RSC кореня)", async ({ page }) => {
  await page.goto("/teams");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 1));
  const bad: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("_rsc") && (r.status() >= 400 || !(r.headers()["content-type"] ?? "").includes("text/x-component"))) {
      bad.push(`${r.status()} ${r.headers()["content-type"]} ${new URL(r.url()).pathname}`);
    }
  });
  await page.getByRole("link", { name: "Slipstream — home" }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Slipstream");
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1);
  expect(bad).toEqual([]);
});
