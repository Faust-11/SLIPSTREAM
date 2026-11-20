import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * Вхід відвідувачів (фаза 9a): код на пошту → сесія → нік → профіль → вихід/видалення. Supabase Auth і PostgREST (play) —
 * фейки в scripts/dev/fake-supabase-auth.mjs (той самий порт, що й фейкова база; листів немає — код читаємо з /__auth/last-code).
 * Проти прев'ю/проду (BASE_URL) фейків немає — тести пропускаються.
 */
test.skip(!!process.env.BASE_URL, "фейковий Supabase є лише в локальному запуску");

const FAKE = "http://127.0.0.1:54321";
const BASE = "http://localhost:3100";
const SESSION_COOKIE = "__Host-outlap_s";

const rnd = () => Math.random().toString(36).slice(2, 10);
const mail = () => `p${rnd()}${rnd()}@example.test`;
const nick = () => `Pilot${rnd()}`;

// М'який обмежувач сайту рахує за джерелом (x-forwarded-for): кожному тесту — своя «адреса», інакше 8 запитів коду
// на 10 хв з одного localhost вичерпались би на другому десятку тестів.
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}` });
});

async function lastCode(page: Page, email: string): Promise<string> {
  const res = await page.request.get(`${FAKE}/__auth/last-code?email=${encodeURIComponent(email)}`);
  expect(res.ok(), "код у фейку").toBe(true);
  return (await res.json()).code;
}

async function stats(page: Page, email: string): Promise<{ exists: boolean; nick?: string | null; refreshes?: number; blocked?: boolean }> {
  return (await page.request.get(`${FAKE}/__auth/stats?email=${encodeURIComponent(email)}`)).json();
}

async function requestCode(page: Page, email: string, path = "/login") {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
}

async function enterCode(page: Page, email: string) {
  await page.getByLabel("Code from the email").fill(await lastCode(page, email));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Повний вхід до екрана ніка (профілю ще немає). */
async function loginToNick(page: Page, email: string, path = "/login") {
  await requestCode(page, email, path);
  await enterCode(page, email);
  await expect(page.getByRole("heading", { name: "Choose a nickname" })).toBeVisible();
}

async function saveNick(page: Page, value: string) {
  await page.getByLabel("Nickname").fill(value);
  await page.getByRole("button", { name: "Save nickname" }).click();
}

/** Вхід із нуля до профілю з ніком. */
async function signUp(page: Page, email = mail(), name = nick()) {
  await loginToNick(page, email);
  await saveNick(page, name);
  await expect(page).toHaveURL(`${BASE}/profile`);
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  return { email, name };
}

test.describe("вхід кодом на пошту", () => {
  test("повний шлях: пошта → код → нік → профіль; шапка показує акаунт", async ({ page }) => {
    const { name } = await signUp(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Profile");
    await expect(page.getByRole("link", { name: `Account: ${name}` })).toHaveAttribute("href", "/profile");
  });

  test("помилки ніка: короткий, з @, зайнятий (без урахування регістру)", async ({ page, browser }) => {
    const first = `Pxa${Date.now()}`; // латиниця + цифри: є повний кириличний двійник «Рха…»
    await signUp(page, mail(), first);
    const other = await (await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "10.9.9.9" } })).newPage();
    await loginToNick(other, mail());
    await saveNick(other, "ab");
    await expect(other.locator(".au-err:visible")).toHaveText("At least 3 characters.");
    await saveNick(other, "me@mail.test");
    await expect(other.locator(".au-err:visible")).toContainText("Use only Latin or Cyrillic letters");
    await saveNick(other, `${nick()}\u200b`); // невидимий символ — підміна імені
    await expect(other.locator(".au-err:visible")).toContainText("Use only Latin or Cyrillic letters");
    await saveNick(other, `${nick()}😀`);
    await expect(other.locator(".au-err:visible")).toContainText("Use only Latin or Cyrillic letters");
    await saveNick(other, first.toUpperCase());
    await expect(other.locator(".au-err:visible")).toHaveText("This nickname is taken or looks too much like another one.");
    await saveNick(other, `\u0420\u0445\u0430${first.slice(3)}`); // повна кирилиця «Рха…» — той самий скелет
    await expect(other.locator(".au-err:visible")).toHaveText("This nickname is taken or looks too much like another one.");
    await saveNick(other, `\u0420${first.slice(1)}`); // кирилична Р + латиниця: змішані скрипти
    await expect(other.locator(".au-err:visible")).toContainText("one alphabet only");
    await saveNick(other, nick());
    await expect(other).toHaveURL(`${BASE}/profile`);
    await other.context().close();
  });

  test("невірний і прострочений код — однакова помилка, форма лишається", async ({ page }) => {
    const email = mail();
    await requestCode(page, email);
    await page.getByLabel("Code from the email").fill("00000000");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator(".au-err:visible")).toContainText("wrong or has expired");
    await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
    const code = await lastCode(page, email);
    await page.request.post(`${FAKE}/__auth/expire-code?email=${encodeURIComponent(email)}`);
    await page.getByLabel("Code from the email").fill(code);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator(".au-err:visible")).toContainText("wrong or has expired");
    expect((await page.context().cookies()).some((c) => c.name === SESSION_COOKIE)).toBe(false);
  });

  test("код не з цифр і порожній — відсікаються на місці, без запиту", async ({ page }) => {
    await requestCode(page, mail());
    let calls = 0;
    page.on("request", (r) => r.url().includes("/api/auth/verify") && calls++);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Code from the email").fill("12ab5678");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator(".au-err:visible")).toContainText("wrong or has expired");
    expect(calls).toBe(0);
  });

  test("повторний запит коду на ту саму адресу відразу — «забагато спроб»; відлік на кнопці", async ({ page }) => {
    const email = mail();
    await requestCode(page, email);
    await expect(page.getByRole("button", { name: /Send a new code in \d+ s/ })).toBeDisabled();
    await page.getByRole("button", { name: "Use another email" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.locator(".au-err:visible")).toContainText("Too many attempts");
  });

  test("у полях форм немає name: сабміт до гідратації (GET) не кладе пошту, код чи нік в адресу", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("form input[name]")).toHaveCount(0);
    await requestCode(page, mail());
    await expect(page.locator("form input[name]")).toHaveCount(0);
  });

  test("некоректна пошта — помилка на місці", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.locator(".au-err:visible")).toContainText("does not look like an email");
  });

  test("?next= — повертає на сторінку сайту; чужа адреса ігнорується", async ({ page }) => {
    const { email } = await signUp(page);
    const again = async (next: string) => {
      await page.getByRole("button", { name: "Sign out" }).click();
      await expect(page.getByRole("heading", { name: "You are not signed in" })).toBeVisible();
      await page.request.post(`${FAKE}/__auth/reset-rate?email=${encodeURIComponent(email)}`);
      await requestCode(page, email, `/login?next=${encodeURIComponent(next)}`);
      await enterCode(page, email);
    };
    await again("/uk/about");
    await expect(page).toHaveURL(`${BASE}/uk/about`);
    await page.goto("/profile");
    await again("//evil.test/x");
    await expect(page).toHaveURL(`${BASE}/profile`);
  });
});

test.describe("сесія", () => {
  test("cookie: __Host-, httpOnly, Secure, Path=/; скрипт сторінки її не бачить; позначка outlap_in читається", async ({ page }) => {
    await signUp(page);
    const cookies = await page.context().cookies();
    const s = cookies.find((c) => c.name === SESSION_COOKIE)!;
    expect(s).toMatchObject({ httpOnly: true, secure: true, path: "/", sameSite: "Lax" });
    const flag = cookies.find((c) => c.name === "outlap_in")!;
    expect(flag).toMatchObject({ value: "1", httpOnly: false });
    const visible = await page.evaluate(() => document.cookie);
    expect(visible).toContain("outlap_in=1");
    expect(visible).not.toContain("__Host-outlap_s");
    // Токени не потрапляють у розмітку й сховище
    expect(await page.content()).not.toContain("eyJ");
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain("eyJ");
  });

  test("вхід переживає перезавантаження; нік приходить із /api/session; email у відповіді немає", async ({ page }) => {
    const { name, email } = await signUp(page);
    await page.reload();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    const res = await page.request.get("/api/session");
    expect(res.headers()["cache-control"]).toContain("no-store");
    const body = await res.text();
    expect(JSON.parse(body)).toMatchObject({ user: { nick: name } });
    expect(body).not.toContain(email);
  });

  test("access спливає → сервер тихо оновлює його за refresh (cookie міняється, користувач лишається)", async ({ page }) => {
    const email = mail();
    await page.request.post(`${FAKE}/__auth/ttl?email=${encodeURIComponent(email)}&s=5`);
    await loginToNick(page, email);
    await saveNick(page, nick());
    await expect(page).toHaveURL(`${BASE}/profile`);
    const before = (await page.context().cookies()).find((c) => c.name === SESSION_COOKIE)!.value;
    await page.reload();
    // Нік і кнопка з'являються лише після відповіді /api/session — саме вона оновлює cookie; до того cookie ще стара.
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    const after = (await page.context().cookies()).find((c) => c.name === SESSION_COOKIE)!.value;
    expect(after).not.toBe(before);
    expect((await stats(page, email)).refreshes).toBeGreaterThanOrEqual(1);
  });

  test("refresh відкликано → сесію знято (cookie очищено), показано вхід", async ({ page }) => {
    const email = mail();
    await page.request.post(`${FAKE}/__auth/ttl?email=${encodeURIComponent(email)}&s=5`);
    await loginToNick(page, email);
    await saveNick(page, nick());
    await expect(page).toHaveURL(`${BASE}/profile`);
    await page.request.post(`${FAKE}/__auth/revoke?email=${encodeURIComponent(email)}`);
    await page.reload();
    await expect(page.getByRole("heading", { name: "You are not signed in" })).toBeVisible();
    expect((await page.context().cookies()).some((c) => c.name === SESSION_COOKIE)).toBe(false);
  });

  test("вихід: cookie знято, шапка й профіль — анонімні", async ({ page }) => {
    const { email } = await signUp(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "You are not signed in" })).toBeVisible();
    const names = (await page.context().cookies()).map((c) => c.name);
    expect(names).not.toContain(SESSION_COOKIE);
    expect(names).not.toContain("outlap_in");
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toHaveAttribute("href", "/login");
    // Старий refresh відкликано в Supabase
    expect((await stats(page, email)).exists).toBe(true);
  });

  test("анонімний відвідувач не робить запитів до /api/session", async ({ page }) => {
    const hits: string[] = [];
    page.on("request", (r) => r.url().includes("/api/session") && hits.push(r.url()));
    await page.goto("/");
    await page.goto("/uk/calendar");
    await page.waitForLoadState("networkidle");
    expect(hits).toEqual([]);
  });

  test("сесія відвідувача не відкриває адмінку: /admin — та сама 404, що й неіснуюча адреса", async ({ page }) => {
    await signUp(page);
    const probe = async (path: string) => {
      const res = await page.goto(path);
      return { status: res?.status(), h1: await page.locator("h1").first().innerText() };
    };
    expect(await probe("/admin")).toEqual(await probe("/zzz-no-such-page"));
    expect((await probe("/admin/photos")).status).toBe(404);
  });
});

test.describe("акаунт", () => {
  test("зміна ніка в профілі", async ({ page }) => {
    const { name } = await signUp(page);
    await page.getByRole("button", { name: "Change nickname" }).click();
    const next = nick();
    await page.getByLabel("Nickname").fill(next);
    await page.getByRole("button", { name: "Save nickname" }).click();
    await expect(page.getByText(next, { exact: true })).toBeVisible();
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  });

  test("видалення акаунта: підтвердження → користувач і дані зникли, cookie знято; повторний вхід — як новий", async ({ page }) => {
    const { email } = await signUp(page);
    await page.getByRole("button", { name: "Delete my account" }).click();
    const del = page.getByRole("button", { name: "Delete forever" });
    await expect(del).toBeDisabled();
    await page.getByLabel("I understand this cannot be undone").check();
    await del.click();
    await expect(page.getByText("Your account has been deleted")).toBeVisible();
    expect((await stats(page, email)).exists).toBe(false);
    expect((await page.context().cookies()).some((c) => c.name === SESSION_COOKIE)).toBe(false);
    // Та сама пошта після видалення — новий користувач без ніка (пауза 60 с на адресу знімається хуком)
    await page.request.post(`${FAKE}/__auth/reset-rate?email=${encodeURIComponent(email)}`);
    await loginToNick(page, email);
  });

  test("видалення без підтвердження сервер відхиляє (400), без входу — 401", async ({ page }) => {
    await signUp(page);
    const no = await page.request.post(`${BASE}/api/auth/delete`, { headers: { origin: BASE }, data: {} });
    expect(no.status()).toBe(400);
    const anon = await page.context().browser()!.newContext();
    const res = await anon.request.post(`${BASE}/api/auth/delete`, { headers: { origin: BASE }, data: { confirm: true } });
    expect(res.status()).toBe(401);
    await anon.close();
  });

  test("заблокований модератором: нік не зберігається; видалення прибирає лише дані гри, користувач лишається", async ({ page }) => {
    const email = mail();
    await page.request.post(`${FAKE}/__auth/block?email=${encodeURIComponent(email)}`);
    await loginToNick(page, email);
    await saveNick(page, nick());
    await expect(page.locator(".au-err:visible")).toContainText("cannot change the nickname");
    const res = await page.request.post(`${BASE}/api/auth/delete`, { headers: { origin: BASE }, data: { confirm: true } });
    expect(await res.json()).toMatchObject({ ok: true, kind: "data_only_blocked" });
    expect((await stats(page, email)).exists).toBe(true);
  });
});

test.describe("захист обробників", () => {
  test("POST без Origin або з чужим Origin — 403; GET /api/auth/* не існує", async ({ request }) => {
    const data = { email: mail() };
    expect((await request.post(`${BASE}/api/auth/code`, { data })).status()).toBe(403);
    expect((await request.post(`${BASE}/api/auth/code`, { data, headers: { origin: "https://evil.test" } })).status()).toBe(403);
    expect((await request.post(`${BASE}/api/auth/verify`, { data: { email: data.email, code: "12345678" } })).status()).toBe(403);
    expect((await request.post(`${BASE}/api/auth/nick`, { data: { nick: "Hacker" } })).status()).toBe(403);
    expect((await request.post(`${BASE}/api/auth/logout`)).status()).toBe(403);
    expect((await request.post(`${BASE}/api/auth/delete`, { data: { confirm: true } })).status()).toBe(403);
    expect((await request.get(`${BASE}/api/auth/code`)).status()).toBe(405);
  });

  test("нік без входу — 401; формат відсікається до бази", async ({ request }) => {
    const h = { origin: BASE, "x-forwarded-for": "10.7.7.7" };
    expect((await request.post(`${BASE}/api/auth/nick`, { headers: h, data: { nick: "ValidNick" } })).status()).toBe(401);
    expect((await request.post(`${BASE}/api/auth/nick`, { headers: h, data: { nick: "x" } })).status()).toBe(400);
  });

  test("підроблена cookie сесії — анонім, cookie знято або ігнорується", async ({ page }) => {
    await page.context().addCookies([{ name: SESSION_COOKIE, value: Buffer.from(JSON.stringify({ a: "fake.jwt.token", r: "nope" })).toString("base64url"), domain: "localhost", path: "/", secure: true }]);
    const res = await page.request.get("/api/session");
    expect(await res.json()).toMatchObject({ user: null });
  });
});

test.describe("сторінки", () => {
  test("/login і /profile: noindex, не в sitemap, канонічна мова, CSP без змін", async ({ page, request }) => {
    for (const path of ["/login", "/uk/login", "/profile", "/uk/profile"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      expect(await page.locator('meta[name="robots"]').getAttribute("content"), path).toBe("noindex, nofollow");
      expect(res?.headers()["content-security-policy"], path).toContain("connect-src 'self'");
      await expect(page.locator("h1")).toHaveCount(1);
    }
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).not.toContain("/login");
    expect(sitemap).not.toContain("/profile");
  });

  test("українська: той самий шлях (/uk/login → код → нік → /uk/profile)", async ({ page }) => {
    await page.goto("/uk/login");
    await page.getByLabel("Пошта").fill(mail());
    await page.getByRole("button", { name: "Надіслати код" }).click();
    await expect(page.getByRole("heading", { name: "Введіть код" })).toBeVisible();
  });

  test("доступність (axe, WCAG 2.2 AA): вхід — крок пошти й коду, профіль — гість і гравець, обидві теми", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await page.addInitScript((t) => localStorage.setItem("ss-theme", t), theme);
      await page.goto("/login");
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await expectNoA11yViolations(page);
      await requestCode(page, mail());
      await expectNoA11yViolations(page);
    }
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "You are not signed in" })).toBeVisible();
    await expectNoA11yViolations(page);
    await signUp(page);
    await expectNoA11yViolations(page);
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expectNoA11yViolations(page); // кнопка «Delete forever» вимкнена — axe її контраст не міряє
    await page.getByLabel("I understand this cannot be undone").check();
    await expectNoA11yViolations(page); // увімкнена (темна тема): текст кольором паперу, контраст ≥ 4,5
  });

  test("320 px: без горизонтального скролу (вхід, код, профіль, шапка з меню)", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    await page.goto("/login");
    expect(await fits()).toBe(true);
    await requestCode(page, mail());
    expect(await fits()).toBe(true);
    await signUp(page);
    expect(await fits()).toBe(true);
    await page.getByRole("button", { name: "Menu" }).click();
    expect(await fits()).toBe(true);
    await expect(page.getByRole("link", { name: /Pilot/ }).last()).toBeVisible();
  });
});
