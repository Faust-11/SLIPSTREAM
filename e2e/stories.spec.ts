import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Розділ «Історії» (фаза 5). Еталони — файли content/stories (те саме, з чого збирається сайт).
const ROOT = join(process.cwd(), "content", "stories");
const stories = readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => JSON.parse(readFileSync(join(ROOT, d.name, "story.json"), "utf8")) as { slug: string; category: string; featured?: boolean; race?: string; claims: { status: string }[] });
const count = (cat: string) => stories.filter((s) => s.category === cat).length;

test("/uk/stories: усі історії, вибрана — Сузука-1989, лінійка років, без помилок консолі", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/uk/stories");
  await expect(page.locator("h1")).toContainText("Моменти, про які");
  await expect(page.locator(".st-card")).toHaveCount(stories.length);
  await expect(page.locator(".st-feat h2")).toContainText("Двоє з однієї команди");
  // Кожна точка лінійки веде до наявної картки.
  const hrefs = await page.locator(".st-ruler a").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).hash));
  expect(hrefs.length).toBeGreaterThan(15);
  for (const h of hrefs) await expect(page.locator(h)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("фільтр рубрик: стан в адресі (?c=), лічильник у role=status, з адреси — одразу відфільтровано", async ({ page }) => {
  await page.goto("/uk/stories");
  await page.getByRole("button", { name: /^Скандали/ }).click();
  await expect(page).toHaveURL(/\?c=scandal$/);
  await expect(page.locator(".st-card:visible")).toHaveCount(count("scandal"));
  await expect(page.getByRole("status")).toContainText(String(count("scandal")));
  await page.goto("/uk/stories?c=history");
  await expect(page.locator(".st-card:visible")).toHaveCount(count("history"));
  await expect(page.getByRole("button", { name: /^Історія/ })).toHaveAttribute("aria-pressed", "true");
});

test("без JS — усі картки видно, чипів фільтра немає", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/uk/stories?c=tech");
  await expect(page.locator(".st-card:visible")).toHaveCount(stories.length);
  await expect(page.locator(".st-chips")).toBeHidden();
  await ctx.close();
});

test("історія: шкала = твердження story.json, зміст веде на глави, виноска — на свій пункт джерел", async ({ page }) => {
  const s = stories.find((x) => x.slug === "spygate-2007")!;
  await page.goto("/uk/stories/spygate-2007");
  await expect(page.locator(".st-side .st-mhead b")).toHaveText(String(s.claims.length));
  for (const st of ["ok", "one", "dis"]) {
    const n = s.claims.filter((c) => c.status === st).length;
    await expect(page.locator(".st-side .st-mkeys li").nth(["ok", "one", "dis"].indexOf(st)).locator("b")).toHaveText(String(n));
  }
  const toc = await page.locator(".st-toc a").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).hash));
  // Ідентифікатори глав — кирилицею, у hash вони закодовані.
  for (const h of toc) await expect(page.locator(`[id="${decodeURIComponent(h.slice(1))}"]`)).toHaveCount(1);
  const fn = page.locator(".st-fn a").first();
  const target = (await fn.getAttribute("href"))!;
  await fn.click();
  await expect(page).toHaveURL(new RegExp(`${target}$`));
  await expect(page.locator(`${target}:target`)).toHaveCount(1);
  // Spygate — не про одну гонку: фактів гонки в банері немає (поле race не задано).
  await expect(page.locator(".st-facts dt", { hasText: "Гонка" })).toHaveCount(0);
});

test("історія про одну гонку: факти банера з бази й посилання на гонку; спірне — окремим розділом", async ({ page }) => {
  await page.goto("/uk/stories/suzuka-1989");
  await expect(page.locator(".st-facts")).toContainText("етап 15 з 16");
  await expect(page.locator('.st-facts a[href="/uk/seasons/1989/15"]')).toHaveCount(1);
  await expect(page.locator("#disputed .st-dz").first()).toBeVisible();
  await expect(page.locator(".st-toc a", { hasText: "Спірне" })).toHaveAttribute("href", "#disputed");
});

test("EN: та сама історія англійською; невідома історія — 404", async ({ page }) => {
  await page.goto("/stories/spygate-2007");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#sources-h")).toHaveText("Sources");
  const res = await page.goto("/uk/stories/no-such-story");
  expect(res?.status()).toBe(404);
});

for (const path of ["/uk/stories", "/uk/stories/singapore-2008"])
  for (const theme of ["light", "dark"] as const)
    for (const width of [320, 768, 1280])
      test(`без порушень axe; ніщо не виходить за екран: ${path}, ${theme}, ${width} px`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expectNoA11yViolations(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      });
