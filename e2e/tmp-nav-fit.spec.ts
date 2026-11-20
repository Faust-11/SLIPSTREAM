import { expect, test } from "@playwright/test";

/**
 * ВРЕМЕННА ДІАГНОСТИКА (фаза 9c, видалити після виміру): яка ширина екрана потрібна шапці з 10 розділами меню (додано «Прогнози»).
 * Бургер вмикається при ≤ 1140 px (site.css), тож шапка мусить поміститись у 1141 px. Вимір — на 1600 px, де нічого не стискається:
 * сума природних ширин дітей .site-head .wrap + проміжки + відступи. Падіння покаже числа в повідомленні.
 */
test("замір: ширина, потрібна шапці з 10 розділами", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const out: Record<string, { needed: number; parts: { cls: string; w: number; ml: number }[]; gap: number; pad: number }> = {};
  for (const path of ["/", "/uk"]) {
    await page.goto(path);
    out[path] = await page.evaluate(() => {
      const wrap = document.querySelector(".site-head .wrap") as HTMLElement;
      const cs = getComputedStyle(wrap);
      const kids = [...wrap.children].filter((el) => getComputedStyle(el).display !== "none") as HTMLElement[];
      const parts = kids.map((el) => {
        const target = el.matches("nav") ? (el.querySelector("ul") as HTMLElement) : el;
        const ml = el.matches("nav") ? 0 : parseFloat(getComputedStyle(el).marginLeft) || 0;
        return { cls: String(el.className || el.tagName), w: Math.round(target.getBoundingClientRect().width * 10) / 10, ml };
      });
      const gap = parseFloat(cs.columnGap) || 0;
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const sum = parts.reduce((a, p) => a + p.w + p.ml, 0) + gap * (parts.length - 1);
      return { needed: Math.ceil(sum + pad), parts, gap, pad };
    });
  }
  console.log("NAVFIT", JSON.stringify(out));
  const needed = Math.max(...Object.values(out).map((o) => o.needed));
  expect(needed, `потрібна ширина шапки: ${JSON.stringify(out)}`).toBeLessThanOrEqual(1141);
});
