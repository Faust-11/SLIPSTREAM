import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Адмінка (фаза 7). Тестові значення — playwright.config.ts (FAKE_ADMIN_ENV); GitHub і Resend — scripts/dev/fake-auth.mjs.
const OWNER_ID = 195572242;
const OWNER_LOGIN = "Faust-11";
const OWNER_EMAIL = "owner@example.test";
const FAKE = "http://127.0.0.1:4455";
const BASE = "http://localhost:3100";
const LOGIN_KEY = "e2e-login-key-0123456789";
const LOGIN = `/admin/auth/login?key=${LOGIN_KEY}`;

// Проти прев'ю/проду (BASE_URL) — лише перевірки стороннього: фейкових сервісів там немає.
const local = !process.env.BASE_URL;

async function asGitHubUser(context: BrowserContext, id: number, login: string) {
  await context.addCookies([{ name: "fake_gh", value: `${id}:${login}`, url: FAKE }]);
}

/** Вхід через GitHub; повертає відповідь останньої сторінки. */
async function loginGitHub(page: Page, id = OWNER_ID, login = OWNER_LOGIN) {
  await asGitHubUser(page.context(), id, login);
  await page.goto(LOGIN);
  // Кінець ланцюжка редиректів (наш сайт, не крок входу й не фейковий GitHub).
  await Promise.all([
    page.waitForURL((u) => u.origin === BASE && !u.pathname.startsWith("/admin/auth")),
    page.getByRole("link", { name: "Увійти через GitHub" }).click(),
  ]);
}

/** Код з останнього листа фейкового Resend. */
async function mailedCode(page: Page, to: string): Promise<string | null> {
  const res = await page.request.get(`${FAKE}/__mail?to=${encodeURIComponent(to)}`);
  if (!res.ok()) return null;
  return /([A-Z0-9]{4}-[A-Z0-9]{4})/.exec((await res.json()).subject)?.[1] ?? null;
}

async function requestCode(page: Page, email: string) {
  await page.goto(LOGIN);
  await page.getByLabel("E-mail").fill(email);
  await page.getByRole("button", { name: "Надіслати код" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Код з листа");
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
    for (const path of ["/admin", "/admin/system", "/admin/auth/logout", "/admin/auth/login", "/admin/auth/github", "/admin/auth/code", "/admin/auth/callback?code=a&state=b"]) {
      expect(await shape(path), path).toEqual(reference);
    }
    // Хибний ключ доходить до proxy (src/proxy.ts), і його rewrite додає x-middleware-rewrite — відмінність бачить лише
    // той, хто вже знає параметр key (тобто про адмінку). Решта — та сама пряма 404 без редиректу.
    const wrong = await shape("/admin/auth/login?key=wrong-key-0123456789");
    expect(wrong).toEqual({ status: 404, headers: [...reference.headers, "x-middleware-rewrite"].sort() });
  });

  test("POST на сторінки адмінки і вихід без сесії — 404", async ({ request }) => {
    for (const path of ["/admin", "/admin/system", "/admin/auth/logout", "/admin/auth/email", "/admin/auth/verify"]) {
      const res = await request.post(path, { headers: { origin: process.env.BASE_URL ?? BASE }, form: { x: "1" } });
      expect(res.status(), path).toBe(404);
    }
  });

  test("повернення з GitHub без стану входу — 404, сесії немає", async ({ page }) => {
    const res = await page.goto("/admin/auth/callback?code=abc&state=xyz");
    expect(res?.status()).toBe(404);
    expect((await page.context().cookies()).some((c) => c.name === "ss_admin")).toBe(false);
  });

  test("підроблена сесія — 404", async ({ page, context }) => {
    const forged = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(`{"sub":"github:${OWNER_ID}"}`).toString("base64url")}.AAAA`;
    await context.addCookies([{ name: "ss_admin", value: forged, url: `${process.env.BASE_URL ?? BASE}/admin` }]);
    expect((await page.goto("/admin"))?.status()).toBe(404);
  });
});

test.describe("вхід через GitHub", () => {
  test.skip(!local, "фейкові сервіси — лише локально і в CI");

  test("свій акаунт: вхід → Огляд; cookie httpOnly, Secure, лише /admin; Система; вихід", async ({ page, context }) => {
    await loginGitHub(page);
    await expect(page).toHaveURL(`${BASE}/admin`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Огляд");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    const session = (await context.cookies()).find((c) => c.name === "ss_admin");
    expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/admin" });
    // Стан входу одноразовий — після повернення його немає.
    expect((await context.cookies()).some((c) => c.name === "ss_admin_flow" && c.value)).toBe(false);

    await page.getByRole("link", { name: "Система" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Система");
    await expect(page.getByText("вхід через GitHub")).toBeVisible();
    await expect(page.getByText(OWNER_LOGIN).first()).toBeVisible();

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

  test("чужий акаунт — навіть з тим самим логіном — 404, сесії немає", async ({ page, context }) => {
    await loginGitHub(page, 42, OWNER_LOGIN);
    expect((await page.goto("/admin"))?.status()).toBe(404);
    expect((await context.cookies()).some((c) => c.name === "ss_admin" && c.value)).toBe(false);
  });

  test("вхід скасовано на GitHub — 404", async ({ page }) => {
    await page.goto(LOGIN);
    await page.getByRole("link", { name: "Увійти через GitHub" }).click();
    await page.waitForURL(`${BASE}/admin`);
    expect((await page.goto("/admin"))?.status()).toBe(404);
  });

  test("вихід з чужого сайту (інший Origin) не спрацьовує", async ({ page }) => {
    await loginGitHub(page);
    const res = await page.request.post("/admin/auth/logout", { headers: { origin: "https://evil.example" } });
    expect(res.status()).toBe(404);
    expect((await page.goto("/admin"))?.status()).toBe(200);
  });
});

test.describe("вхід кодом на пошту", () => {
  test.skip(!local, "фейкові сервіси — лише локально і в CI");

  test("адреса зі списку: код у листі (XXXX-XXXX) → Огляд; той самий код вдруге — ні", async ({ page, context }) => {
    await requestCode(page, OWNER_EMAIL);
    const code = await mailedCode(page, OWNER_EMAIL);
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    await page.getByRole("textbox", { name: "Код", exact: true }).fill(code!.toLowerCase()); // регістр не важливий
    await page.getByRole("button", { name: "Увійти" }).click();
    await expect(page).toHaveURL(`${BASE}/admin`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Огляд");
    await page.getByRole("link", { name: "Система" }).click();
    await expect(page.getByText("вхід кодом на пошту")).toBeVisible();

    // Одноразовий: стан входу видалено — повтор того самого коду в новій сесії не пускає.
    await context.clearCookies({ name: "ss_admin" });
    const res = await page.request.post(`/admin/auth/verify?key=${LOGIN_KEY}`, { headers: { origin: BASE }, form: { code: code! }, maxRedirects: 0 });
    expect(res.headers().location).not.toBe(`${BASE}/admin`);
  });

  test("адреса не зі списку: та сама сторінка «Код з листа», лист не надіслано", async ({ page }) => {
    await requestCode(page, "stranger@example.test");
    expect(await mailedCode(page, "stranger@example.test")).toBeNull();
  });

  test("хибний код — повідомлення і без сесії; код з іншого браузера — не діє", async ({ page, browser }) => {
    await requestCode(page, OWNER_EMAIL);
    await page.getByRole("textbox", { name: "Код", exact: true }).fill("AAAA-AAAA");
    await page.getByRole("button", { name: "Увійти" }).click();
    await expect(page.locator("p.ad-result[role=alert]")).toHaveText("Код не підійшов або вже не діє.");
    expect((await page.goto("/admin"))?.status()).toBe(404);

    // Код, запитаний в одному браузері, в іншому (без cookie стану) не спрацює.
    const code = await mailedCode(page, OWNER_EMAIL);
    const other = await browser.newContext();
    const p2 = await other.newPage();
    await p2.goto(`${BASE}/admin/auth/code?key=${LOGIN_KEY}`);
    await p2.getByRole("textbox", { name: "Код", exact: true }).fill(code!);
    await p2.getByRole("button", { name: "Увійти" }).click();
    expect((await p2.goto(`${BASE}/admin`))?.status()).toBe(404);
    await other.close();
  });

  test("запит коду з чужого сайту (інший Origin) — лист не надіслано", async ({ page }) => {
    const res = await page.request.post(`/admin/auth/email?key=${LOGIN_KEY}`, { headers: { origin: "https://evil.example" }, form: { email: "second@example.test" }, maxRedirects: 0 });
    expect(res.status()).toBe(303);
    expect(await mailedCode(page, "second@example.test")).toBeNull();
  });
});

test.describe("доступність", () => {
  test.skip(!local, "фейкові сервіси — лише локально і в CI");

  for (const colorScheme of ["light", "dark"] as const) {
    for (const width of [390, 1280]) {
      test(`без порушень axe і без горизонтальної прокрутки: ${colorScheme}, ${width} px`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 900 });
        // Сторінки входу (до сесії)
        for (const path of [LOGIN, `/admin/auth/code?key=${LOGIN_KEY}`]) {
          await page.goto(path);
          await expectNoA11yViolations(page);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
        }
        await loginGitHub(page);
        for (const path of ["/admin", "/admin/system"]) {
          await page.goto(path);
          await expectNoA11yViolations(page);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
        }
      });
    }
  }
});
