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
  // Гідратація — за React-вузлом на полі, а не networkidle: `next start` віддає ISR-сторінці «Новин» (посилання в меню
  // передзавантажується) stale-while-revalidate, Chrome перевіряє такі відповіді у фоні, і Playwright не бачить їх
  // завершення — networkidle не настає (замір 14.11: 0 з 3; без цієї директиви — 3 з 3). Vercel браузеру віддає
  // max-age=0 (замір прод) — це лише тестове середовище.
  await page.goto(path);
  const box = page.getByRole("searchbox", { name: label });
  await expect
    .poll(() => box.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactProps$"))))
    .toBe(true);
  for (let i = 0; i < 3; i++) {
    await box.fill("");
    await box.pressSequentially(typed, { delay: 0 });
    await expect(page).toHaveURL(q(typed));
    await expect(box).toHaveValue(typed);
  }
}
