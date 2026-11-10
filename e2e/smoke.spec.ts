import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

for (const path of ["/", "/uk"]) {
  test(`${path} — 200, без помилок JS і консолі, без порушень axe`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`);
    });
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await page.waitForLoadState("networkidle");
    await expectNoA11yViolations(page);
    expect(errors).toEqual([]);
  });
}
