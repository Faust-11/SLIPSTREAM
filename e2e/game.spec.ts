import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// «Гра» — «Гаряче коло» (фаза 6). Фізика й повтор бота перевірені unit-тестами (src/lib/game, engine.test.ts);
// тут — сторінка: картки, #траса, старт → вогні → заїзд, рекорд зі сховища (коло бота як «рекорд»), мова, тема, axe.

const TRACKS = JSON.parse(readFileSync(join(__dirname, "../src/lib/game/tracks.json"), "utf8")) as Record<string, { botInputs: string; botTicks: number }>;

async function seed(page: Page, key: string, value: unknown) {
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [`slipstream-hotlap-v2-${key}`, JSON.stringify(value)] as const);
}
const cards = (page: Page) => page.locator(".gm-tcard");

test("/uk/game: перший екран, 4 траси з довжиною й часом бота, Лиман за замовчуванням; без помилок у консолі", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const res = await page.goto("/uk/game");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Гаряче коло\s+Push, push, push/);
  await expect(cards(page)).toHaveCount(4);
  await expect(cards(page).locator(".gm-tname")).toHaveText(["Лиман", "Порт", "Плато", "Бір"]);
  await expect(cards(page).locator(".gm-tmeta b:not([data-best])")).toHaveText(["1,30 км", "0:29.933", "1,40 км", "0:34.433", "1,98 км", "0:39.325", "0,96 км", "0:23.500"]);
  await expect(cards(page).first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Старт · Пробіл" })).toBeEnabled();
  // Сцена намальована (не порожня канва): перший кадр — у наступному rAF після монтування, тому опитуємо.
  const painted = () =>
    page.locator(".gm-view").evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      for (let i = 0; i < d.length; i += 4 * 97) if (d[i]! + d[i + 1]! + d[i + 2]! > 60) lit++;
      return lit;
    });
  await expect.poll(painted).toBeGreaterThan(50);
  await expect(page.locator(".gm-lights")).toBeHidden();
  expect(errors).toEqual([]);
});

test("#port відкриває Порт; клік по картці міняє трасу й адресу; мова зберігає трасу", async ({ page }) => {
  await page.goto("/uk/game#port");
  await expect(cards(page).nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".gm-sheet h3").first()).toHaveText("Твої кола · Порт");
  await cards(page).nth(3).click();
  await expect(page).toHaveURL(/\/uk\/game#forest$/);
  await expect(cards(page).nth(3)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".gm-game")).toBeFocused();
  await page.getByRole("group", { name: "Мова" }).getByRole("link").click();
  await expect(page).toHaveURL(/\/game(#forest)?$/);
  await expect(page.locator(".gm-sheet h3").first()).toHaveText("Your laps · Pinewood");
});

test("старт: вогні → заїзд з клавіатури (швидкість росте) → R перезапускає", async ({ page }) => {
  // Максимальна пауза перед згасанням (1,5 с) — ширше вікно «горять усі 5» для опитування під навантаженням.
  await page.addInitScript(() => (Math.random = () => 0.99));
  await page.goto("/uk/game");
  await page.getByRole("button", { name: "Старт · Пробіл" }).click();
  await expect(page.locator(".gm-lights")).toBeVisible();
  await expect(page.locator(".gm-overlay")).toHaveCount(0);
  await expect.poll(() => page.locator(".gm-lamp.is-on").count(), { timeout: 10_000, intervals: [50] }).toBe(5);
  // Вогні гаснуть через 0,5–1,5 с після п'ятої лампи, блок ховається ще за 0,6 с.
  await expect(page.locator(".gm-lamp.is-on")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator(".gm-lights")).toBeHidden({ timeout: 3_000 });
  await page.keyboard.down("ArrowUp");
  await expect.poll(async () => Number(await page.locator(".gm-speed strong").textContent()), { timeout: 10_000 }).toBeGreaterThan(40);
  await page.keyboard.up("ArrowUp");
  await expect(page.locator(".gm-clock")).not.toHaveText("0:00.000");
  await page.keyboard.press("r");
  await expect(page.locator(".gm-lights")).toBeVisible();
});

test("рекорд зі сховища перевіряється повтором: справжнє коло показано, підроблене — ні", async ({ page }) => {
  await seed(page, "lyman", { best: { inputs: TRACKS.lyman!.botInputs, total: TRACKS.lyman!.botTicks }, laps: [{ t: 3592, pen: 0, at: 1763200000000 }] });
  await seed(page, "port", { best: { inputs: TRACKS.port!.botInputs, total: 100 }, laps: [] });
  await page.goto("/uk/game");
  await expect(cards(page).locator("[data-best]")).toHaveText(["0:29.933", "—", "—", "—"]);
  const ghost = page.getByRole("group", { name: "Привид" });
  await expect(ghost.getByRole("button", { name: "Мій рекорд" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".gm-laps .is-best")).toContainText("★ 0:29.933");
  await ghost.getByRole("button", { name: "Бот" }).click();
  await expect(ghost.getByRole("button", { name: "Бот" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".gm-note").nth(1)).toHaveText("Бот проходить коло за 0:29.933 без штрафів.");
});

test.describe("телефон", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("390 px: без горизонтальної прокрутки, сенсорні кнопки видно, сцена 4:5", async ({ page }) => {
    await page.goto("/uk/game");
    // Сенсорні кнопки показуються за (pointer: coarse) — явна перевірка, щоб падіння було зрозумілим.
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(page.getByRole("button", { name: "газ" })).toBeVisible();
    const box = (await page.locator(".gm-game").boundingBox())!;
    expect(Math.abs(box.width / box.height - 4 / 5)).toBeLessThan(0.02);
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const path of ["/uk/game", "/game#plateau"]) {
    test(`без порушень axe: ${path} (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      await expect(page.locator(".gm-tcard[aria-pressed=true]")).toHaveCount(1);
      await expectNoA11yViolations(page);
    });
  }
}

test.describe("320 px", () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test("без горизонтальної прокрутки; час у картці з рекордом не виходить за картку; чипи HUD не під мінікартою", async ({ page }) => {
    await seed(page, "lyman", { best: { inputs: TRACKS.lyman!.botInputs, total: TRACKS.lyman!.botTicks }, laps: [] });
    await page.goto("/uk/game");
    await expect(cards(page).first().locator("[data-best]")).toHaveText("0:29.933");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const card = (await cards(page).first().boundingBox())!;
    const best = (await cards(page).first().locator("[data-best]").boundingBox())!;
    expect(best.x + best.width).toBeLessThanOrEqual(card.x + card.width - 2);
    const hud = (await page.locator(".gm-hud").boundingBox())!;
    const mini = (await page.locator(".gm-mini").boundingBox())!;
    expect(hud.x + hud.width).toBeLessThanOrEqual(mini.x);
  });
});
