import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export async function expectNoA11yViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    targets: v.nodes.map((n) => n.target.join(" ")),
  }));
  expect(summary, "axe: порушення WCAG 2.2 AA").toEqual([]);
}
