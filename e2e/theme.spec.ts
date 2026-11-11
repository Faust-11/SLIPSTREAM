import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

const PAPER = { light: "rgb(243, 244, 241)", dark: "rgb(17, 18, 22)" } as const;

type Probe = { theme: string | null; bodyExisted: boolean | null; bg: string };

/**
 * Записує, коли з'явився data-theme (чи існував уже <body> — тобто чи міг бути кадр у «чужій» темі),
 * і колір фону на DOMContentLoaded, ще до гідратації React.
 */
async function probe(page: Page, path: string, stored: string | null): Promise<Probe> {
  await page.addInitScript((value) => {
    if (value !== null) localStorage.setItem("ss-theme", value);
    const w = window as unknown as { __probe: Probe };
    w.__probe = { theme: null, bodyExisted: null, bg: "" };
    new MutationObserver(() => {
      if (w.__probe.bodyExisted === null && document.documentElement.hasAttribute("data-theme")) {
        w.__probe.bodyExisted = document.body !== null;
      }
      // documentElement на цьому етапі ще може не існувати — стежимо за всім документом.
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-theme"] });
    document.addEventListener("DOMContentLoaded", () => {
      w.__probe.theme = document.documentElement.getAttribute("data-theme");
      w.__probe.bg = getComputedStyle(document.body).backgroundColor;
    });
  }, stored);
  await page.goto(path);
  return page.evaluate(() => (window as unknown as { __probe: Probe }).__probe);
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`);
  });
  return errors;
}

for (const system of ["light", "dark"] as const) {
  for (const stored of ["light", "dark", null, "purple"] as const) {
    const expected = stored === "light" || stored === "dark" ? stored : system;
    test(`система ${system} + сховище ${stored ?? "порожнє"} → ${expected} до першого кадру`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: system });
      const errors = collectErrors(page);
      const p = await probe(page, "/", stored);
      expect(p.bg).toBe(PAPER[expected]);
      if (stored === "light" || stored === "dark") {
        expect(p.theme).toBe(stored);
        expect(p.bodyExisted, "data-theme має з'явитися ще до <body>").toBe(false);
      } else {
        expect(p.theme).toBeNull();
      }
      const toggle = page.getByRole("button", { name: expected === "dark" ? "Switch to light theme" : "Switch to dark theme" });
      await expect(toggle).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}

test.describe("тема", () => {
  test.use({ colorScheme: "dark" });

  test("перемикач змінює тему й сховище, вибір переживає перезавантаження", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Switch to light theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("body")).toHaveCSS("background-color", PAPER.light);
    expect(await page.evaluate(() => localStorage.getItem("ss-theme"))).toBe("light");

    await page.reload();
    await expect(page.locator("body")).toHaveCSS("background-color", PAPER.light);

    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("body")).toHaveCSS("background-color", PAPER.dark);
    expect(await page.evaluate(() => localStorage.getItem("ss-theme"))).toBe("dark");
    expect(errors).toEqual([]);
  });

  test("колір панелі браузера (theme-color) іде за явним вибором теми", async ({ page }) => {
    await page.goto("/");
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
    await page.getByRole("button", { name: "Switch to light theme" }).click();
    const colors = await page.locator('meta[name="theme-color"]').evaluateAll((ms) =>
      ms.map((m) => [(m as HTMLMetaElement).content, (m as HTMLMetaElement).media]),
    );
    expect(colors.length).toBeGreaterThan(0);
    for (const [content, media] of colors) {
      expect(content).toBe("#16181d");
      expect(media).toBe("");
    }
  });

  test("без вибору тема стежить за системою на льоту", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toHaveCSS("background-color", PAPER.dark);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("body")).toHaveCSS("background-color", PAPER.light);
    await expect(page.getByRole("button", { name: "Switch to dark theme" })).toBeVisible();
  });

  test("вибір в іншій вкладці застосовується", async ({ page, context }) => {
    await page.goto("/");
    const other = await context.newPage();
    await other.goto("/");
    await other.getByRole("button", { name: "Switch to light theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("підпис перемикача українською", async ({ page }) => {
    await page.goto("/uk");
    await expect(page.getByRole("button", { name: "Увімкнути світлу тему" })).toBeVisible();
  });

  test("кнопка — ціль ≥ 24 px (WCAG 2.5.8)", async ({ page }) => {
    await page.goto("/");
    const box = await page.getByRole("button", { name: "Switch to light theme" }).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(24);
    expect(box!.height).toBeGreaterThanOrEqual(24);
  });

  test("без порушень axe у темній темі", async ({ page }) => {
    await page.goto("/");
    await expectNoA11yViolations(page);
  });

  test("404 теж бере збережену тему й шрифти сайту", async ({ page }) => {
    const p = await probe(page, "/uk/nope", "light");
    expect(p.bg).toBe(PAPER.light);
    const fonts = await page.evaluate(() => ({
      body: getComputedStyle(document.body).fontFamily,
      h1: getComputedStyle(document.querySelector("h1")!).fontFamily,
    }));
    expect(fonts.body).toMatch(/IBM Plex Sans/);
    expect(fonts.h1).toMatch(/Rubik Mono One/);
  });
});

test.describe("без JavaScript", () => {
  test.use({ javaScriptEnabled: false, colorScheme: "dark" });

  test("перемикач прихований (без JS він нічого не робить), діє системна тема", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".theme-btn")).toBeHidden();
    await expect(page.locator("body")).toHaveCSS("background-color", PAPER.dark);
  });
});

test("шрифти: Rubik Mono One і Plex мають кириличні накреслення, моно — без стиснення інтервалу", async ({ page }) => {
  await page.goto("/uk");
  const r = await page.evaluate(async () => {
    const box = document.createElement("div");
    box.className = "display";
    box.innerHTML = 'Ґанок єдиний <span class="font-mono">її Їжак</span>';
    document.body.append(box);
    const span = box.querySelector("span")!;
    const [display, body] = await Promise.all([
      document.fonts.load('16px "Rubik Mono One"', "ҐєіЇ"),
      document.fonts.load('16px "IBM Plex Sans"', "ҐєіЇ"),
    ]);
    return {
      display: display.length,
      body: body.length,
      displayWs: getComputedStyle(box).wordSpacing,
      monoWs: getComputedStyle(span).wordSpacing,
      monoFamily: getComputedStyle(span).fontFamily,
    };
  });
  expect(r.display, "кириличний файл Rubik Mono One").toBeGreaterThan(0);
  expect(r.body, "кириличний файл IBM Plex Sans").toBeGreaterThan(0);
  expect(r.displayWs).not.toBe("0px");
  expect(r.monoWs).toBe("0px");
  expect(r.monoFamily).toMatch(/IBM Plex Mono/);
});
