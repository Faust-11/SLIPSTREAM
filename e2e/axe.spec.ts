import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

test("хелпер axe ловить порушення (контрольний негатив)", async ({ page }) => {
  await page.setContent(
    '<!doctype html><html lang="en"><head><title>t</title></head><body><main><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></main></body></html>',
  );
  await expect(expectNoA11yViolations(page)).rejects.toThrow(/image-alt/);
});
