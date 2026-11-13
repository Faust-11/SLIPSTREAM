import { expect, type Page } from "@playwright/test";

/**
 * Пошук у списку (code-review PR #18): (1) ввід одразу після відкриття (до гідратації) не губиться й потрапляє в
 * стан — адреса отримує ?q= (лише значення поля не досить: поле могло показувати текст при порожньому стані, як
 * «японія» → 24 картки в «Трасах»); (2) швидкий набір без затримки не губить символів.
 */
export async function expectSearchSurvivesRace(page: Page, path: string, label: string, early: string, typed: string) {
  const q = (s: string) => new RegExp(`[?&]q=${encodeURIComponent(s).replace(/%20/g, "\\+")}(&|$)`);
  for (let i = 0; i < 3; i++) {
    await page.goto(path);
    const box = page.getByRole("searchbox", { name: label });
    await box.fill(early);
    await expect(page).toHaveURL(q(early));
    await expect(box).toHaveValue(early);
  }
  await page.goto(path, { waitUntil: "networkidle" });
  const box = page.getByRole("searchbox", { name: label });
  for (let i = 0; i < 3; i++) {
    await box.fill("");
    await box.pressSequentially(typed, { delay: 0 });
    await expect(page).toHaveURL(q(typed));
    await expect(box).toHaveValue(typed);
  }
}
