import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * UX-скриншоти нових екранів 7c (задача 11): 1280 і 320 px × світла й темна теми. Лише за `ADMIN_SCREENS=1` (CI: workflow_dispatch
 * з screens=true) — у звичайному прогоні пропускається. Файли — `screens/<екран>--<ширина>-<тема>.png`, CI кладе їх в артефакт.
 * Окремо від перевірок поведінки: тут лише знімок і одна перевірка — сторінка не має горизонтального скролу.
 */
const FAKE = "http://127.0.0.1:4455";
const BASE = "http://localhost:3100";
const SIZES = [
  { w: 1280, h: 900 },
  { w: 320, h: 700 },
] as const;
const SCHEMES = ["light", "dark"] as const;

test.skip(!process.env.ADMIN_SCREENS || !!process.env.BASE_URL, "знімки — лише за ADMIN_SCREENS=1 і локальним сервером");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

async function login(page: Page) {
  await page.context().addCookies([{ name: "fake_gh", value: "195572242:Faust-11", url: FAKE }]);
  await page.goto("/admin/auth/login?key=e2e-login-key-0123456789");
  await Promise.all([page.waitForURL((u) => u.origin === BASE && !u.pathname.startsWith("/admin/auth")), page.getByRole("link", { name: "Увійти через GitHub" }).click()]);
}

/** Усі комбінації розмір × тема: `prepare` приводить сторінку до потрібного стану, далі — знімок. */
async function shoot(page: Page, name: string, prepare: () => Promise<void>) {
  mkdirSync("screens", { recursive: true });
  for (const s of SIZES) {
    for (const scheme of SCHEMES) {
      await page.setViewportSize({ width: s.w, height: s.h });
      await page.emulateMedia({ colorScheme: scheme });
      await prepare();
      await page.waitForTimeout(300); // шрифти й анімації
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect.soft(overflow, `${name} ${s.w}/${scheme}: горизонтальний скрол`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `screens/${name}--${s.w}-${scheme}.png`, fullPage: true });
    }
  }
}

test("список, редактор, фото, адреса, перегляд", async ({ page }) => {
  await login(page);
  await shoot(page, "01-list", async () => void (await page.goto("/admin/stories")));
  await shoot(page, "02-editor", async () => void (await page.goto("/admin/stories/women-in-f1")));
  await shoot(page, "03-photos", async () => void (await page.goto("/admin/stories/jerez-1997/photos")));
  await shoot(page, "04-photo-pick", async () => {
    await page.goto("/admin/stories/pit-stop-evolution/photos/new");
    await page.locator(".ad-cands li").first().getByRole("link", { name: "Обрати" }).click();
    await expect(page.locator('section[aria-labelledby="ad-pick"]')).toBeVisible();
  });
  await shoot(page, "05-address-plan", async () => void (await page.goto("/admin/stories/vettel-monza-2008/address?to=vettel-monza")));
  await shoot(page, "06-address-blocked", async () => void (await page.goto("/admin/stories/jerez-1997/address?to=jerez-final")));
  await shoot(page, "07-preview-uk", async () => void (await page.goto("/admin/stories/women-in-f1/preview")));
  await shoot(page, "08-preview-en", async () => void (await page.goto("/admin/stories/women-in-f1/preview?lang=en")));
});

test("версії і diff", async ({ page }) => {
  await login(page);
  const slug = "hamilton-brazil-2008";
  await page.goto(`/admin/stories/${slug}`);
  const title = page.locator('input[name="title_en"]');
  await title.fill(`${await title.inputValue()} (знімок)`);
  await page.getByRole("button", { name: "Опублікувати зміни" }).click();
  await expect(page.getByRole("status").filter({ hasText: "PR #" })).toBeVisible();
  await page.request.post(`${FAKE}/__merge?has=${encodeURIComponent(`Історія · ${slug}`)}`);
  await shoot(page, "09-versions", async () => void (await page.goto(`/admin/stories/${slug}/versions`)));
  await page.goto(`/admin/stories/${slug}/versions`);
  const href = await page.locator(".ad-ver li a").first().getAttribute("href");
  await shoot(page, "10-diff", async () => void (await page.goto(href!)));
});

test("джерела: до і після перевірки", async ({ page }) => {
  await login(page);
  const url = "/admin/stories/abu-dhabi-2021/sources";
  await shoot(page, "11-sources-idle", async () => void (await page.goto(url)));
  await shoot(page, "12-sources-checked", async () => {
    await page.goto(url);
    await page.getByRole("button", { name: "Перевірити посилання" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Перевірено 22 з 22/ })).toBeVisible();
    await page.getByRole("button", { name: /Знайти копії в Web Archive/ }).click();
    await expect(page.getByRole("status").filter({ hasText: /Опрацьовано 22 з 22/ })).toBeVisible();
  });
});
