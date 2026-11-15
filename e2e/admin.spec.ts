import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Адмінка (фаза 7a). Тестові значення — playwright.config.ts (FAKE_ADMIN_ENV), «Google» — scripts/dev/fake-oidc.mjs.
const ADMIN = "owner@example.test";
const IDP = "http://127.0.0.1:4455";
const BASE = "http://localhost:3100";
const LOGIN_KEY = "e2e-login-key-0123456789";

// Проти прев'ю/проду (BASE_URL) — лише перевірки стороннього: фейкового провайдера там немає.
const local = !process.env.BASE_URL;

async function asUser(context: BrowserContext, user: string) {
  await context.addCookies([{ name: "fake_user", value: user, url: IDP }]);
}

async function login(page: Page, user = ADMIN) {
  await asUser(page.context(), user);
  return page.goto(`/admin/auth/login?key=${LOGIN_KEY}`);
}

/** Текст 404 сайту — той самий, що для будь-якої неіснуючої адреси. */
async function notFoundSnapshot(page: Page, path: string) {
  const res = await page.goto(path);
  return { status: res?.status(), title: await page.title(), h1: await page.locator("h1").first().innerText() };
}

test.describe("сторонній адмінки не бачить", () => {
  test("кожна адреса /admin — той самий 404, що й неіснуюча сторінка", async ({ page }) => {
    const reference = await notFoundSnapshot(page, "/zzz-not-a-page");
    expect(reference.status).toBe(404);
    for (const path of ["/admin", "/admin/", "/admin/system", "/admin/photos", "/admin/auth/logout"]) {
      expect(await notFoundSnapshot(page, path), path).toEqual(reference);
    }
  });

  test("без переходів за редиректами: /admin, вхід без ключа чи з чужим, повернення без стану — прямо 404, заголовки як у неіснуючої сторінки", async ({ request }) => {
    // Заголовки, що різняться між будь-якими двома відповідями (час, розмір, кеш), не порівнюємо.
    const VOLATILE = new Set(["date", "etag", "content-length", "x-vercel-id", "age", "x-vercel-cache", "server-timing"]);
    const shape = async (path: string) => {
      const res = await request.get(path, { maxRedirects: 0 });
      return { status: res.status(), headers: Object.keys(res.headers()).filter((h) => !VOLATILE.has(h)).sort() };
    };
    const reference = await shape("/zzz-not-a-page");
    expect(reference.status).toBe(404);
    for (const path of ["/admin", "/admin/system", "/admin/auth/login", "/admin/auth/login?key=wrong-key-0123456789", "/admin/auth/callback?code=a&state=b"]) {
      expect(await shape(path), path).toEqual(reference);
    }
  });

  test("POST на сторінки адмінки і вихід без сесії — 404", async ({ request }) => {
    for (const path of ["/admin", "/admin/system", "/admin/auth/logout"]) {
      const res = await request.post(path, { headers: { origin: process.env.BASE_URL ?? BASE }, form: { x: "1" } });
      expect(res.status(), path).toBe(404);
    }
  });

  test("повернення з «Google» без стану входу — 404, сесії немає", async ({ page }) => {
    const res = await page.goto("/admin/auth/callback?code=abc&state=xyz");
    expect(res?.status()).toBe(404);
    expect((await page.context().cookies()).some((c) => c.name === "ss_admin")).toBe(false);
  });

  test("підроблена сесія — 404", async ({ page, context }) => {
    const forged = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(`{"email":"${ADMIN}"}`).toString("base64url")}.AAAA`;
    await context.addCookies([{ name: "ss_admin", value: forged, url: `${process.env.BASE_URL ?? BASE}/admin` }]);
    expect((await page.goto("/admin"))?.status()).toBe(404);
  });
});

test.describe("вхід через Google", () => {
  test.skip(!local, "фейковий провайдер — лише локально і в CI");

  test("адмін: вхід → Огляд; cookie httpOnly, Secure, лише /admin; Система показує e-mail; вихід", async ({ page, context }) => {
    await login(page);
    await expect(page).toHaveURL(`${BASE}/admin`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Огляд");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    const session = (await context.cookies()).find((c) => c.name === "ss_admin");
    expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/admin" });
    // Стан входу одноразовий — після повернення його немає.
    expect((await context.cookies()).some((c) => c.name === "ss_admin_flow" && c.value)).toBe(false);

    await page.getByRole("link", { name: "Система" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Система");
    await expect(page.getByText(ADMIN).first()).toBeVisible();

    // Сторінки сайту сесію не отримують (cookie лише для /admin).
    const sent: string[] = [];
    page.on("request", (r) => {
      if (!new URL(r.url()).pathname.startsWith("/admin")) sent.push(r.headers().cookie ?? "");
    });
    await page.goto("/uk");
    expect(sent.join(" ")).not.toContain("ss_admin");

    await page.goto("/admin");
    await page.getByRole("button", { name: "Вийти" }).click();
    await expect(page).toHaveURL(`${BASE}/`);
    expect((await page.goto("/admin"))?.status()).toBe(404);
  });

  test("e-mail не зі списку — 404, сесії немає", async ({ page, context }) => {
    const res = await login(page, "stranger@example.test");
    expect(res?.status()).toBe(404);
    expect((await context.cookies()).some((c) => c.name === "ss_admin" && c.value)).toBe(false);
    expect((await page.goto("/admin"))?.status()).toBe(404);
  });

  test("e-mail зі списку, але не підтверджений — 404", async ({ page }) => {
    expect((await login(page, `${ADMIN}|unverified`))?.status()).toBe(404);
  });

  test("вхід скасовано на боці Google — 404", async ({ page }) => {
    expect((await page.goto(`/admin/auth/login?key=${LOGIN_KEY}`))?.status()).toBe(404);
  });

  test("вихід з чужого сайту (інший Origin) не спрацьовує", async ({ page }) => {
    await login(page);
    const res = await page.request.post("/admin/auth/logout", { headers: { origin: "https://evil.example" } });
    expect(res.status()).toBe(404);
    expect((await page.goto("/admin"))?.status()).toBe(200);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    for (const width of [390, 1280]) {
      test(`без порушень axe і без горизонтальної прокрутки: ${colorScheme}, ${width} px`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 900 });
        await login(page);
        for (const path of ["/admin", "/admin/system"]) {
          await page.goto(path);
          await expectNoA11yViolations(page);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
        }
      });
    }
  }
});
