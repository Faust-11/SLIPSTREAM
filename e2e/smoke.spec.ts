import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

test("головна відповідає 200 і без порушень axe", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expectNoA11yViolations(page);
});
