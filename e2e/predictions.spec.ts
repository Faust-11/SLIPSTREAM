import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * Прогнози (фаза 9c): список етапів, форма, збереження, дедлайн, чужі прогнози лише після нього. Supabase Auth і PostgREST
 * (play) — фейки з scripts/dev (fake-supabase-auth.mjs): дедлайн етапу керується тестом (POST /__play/deadline), тому
 * тести не залежать від дати запуску. За замовчуванням у фейку етапи ≤ 21 закриті, ≥ 22 відкриті; кожен сценарій, що міняє
 * дедлайн, має СВІЙ етап (18 — чужі прогнози, 19 — дедлайн минає під час правки), інакше паралельні тести заважали б одне одному.
 * Проти прев'ю/проду (BASE_URL) фейків немає — тести пропускаються.
 */
test.skip(!!process.env.BASE_URL, "фейковий Supabase є лише в локальному запуску");

const FAKE = "http://127.0.0.1:54321";
const BASE = "http://localhost:3100";
const YEAR = 2026;

// id з фікстури e2e/fixtures/db/drivers.json (поточна сітка): за чемпіонатом 1-2-3-4.
const ANTONELLI = 863;
const VERSTAPPEN = 831;
const RUSSELL = 847;
const HAMILTON = 795;
const RED_BULL = 191; // f1.teams.id з результатів 2026

const rnd = () => Math.random().toString(36).slice(2, 10);
const mail = () => `q${rnd()}${rnd()}@example.test`;
const nick = () => `Racer${rnd()}`;

test.beforeEach(async ({ context }) => {
  // М'який обмежувач сайту рахує за джерелом: кожному тесту — своя «адреса».
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}` });
});

async function lastCode(page: Page, email: string): Promise<string> {
  const res = await page.request.get(`${FAKE}/__auth/last-code?email=${encodeURIComponent(email)}`);
  expect(res.ok(), "код у фейку").toBe(true);
  return (await res.json()).code;
}

/** Вхід кодом до екрана ніка (профілю ще немає). */
async function loginToNick(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
  await page.getByLabel("Code from the email").fill(await lastCode(page, email));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose a nickname" })).toBeVisible();
}

/** Гравець із ніком (сесія в cookie сторінки). */
async function signUp(page: Page, email = mail(), name = nick()) {
  await loginToNick(page, email);
  await page.getByLabel("Nickname").fill(name);
  await page.getByRole("button", { name: "Save nickname" }).click();
  await expect(page).toHaveURL(`${BASE}/profile`);
  return { email, name };
}

const setDeadline = (page: Page, round: number, inSeconds: number | "null") =>
  page.request.post(`${FAKE}/__play/deadline?year=${YEAR}&round=${round}&in=${inSeconds}`);

const stored = async (page: Page, email: string): Promise<{ kind: string; picks: (number | null)[]; dnfTeam: number | null; allFinish: boolean }[]> =>
  (await page.request.get(`${FAKE}/__play/predictions?email=${encodeURIComponent(email)}`)).json();

const form = (page: Page, name: "Qualifying" | "Race") => page.getByRole("region", { name, exact: true });
const slot = (page: Page, name: "Qualifying" | "Race", n: number) => form(page, name).getByLabel(new RegExp(`^Place ${n}(\\D|$)`));
const topThree = [String(ANTONELLI), String(VERSTAPPEN), String(RUSSELL)];

async function fillTop(page: Page, name: "Qualifying" | "Race", ids = topThree) {
  for (const [i, id] of ids.entries()) await slot(page, name, i + 1).selectOption(id);
}

test.describe("список етапів", () => {
  test("етапи без результатів із дедлайном; статус рахується за часом, правила очок видно", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
    await page.goto("/predictions");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Race predictions");
    const rounds = page.locator("li.pd-round");
    await expect(rounds).toHaveCount(3);
    await expect(rounds.nth(0)).toContainText("Round 21");
    await expect(rounds.nth(2)).toContainText("Round 23");
    // Усі три відкриті станом на 20.11 12:00 UTC; найближчий закривається за добу — «soon».
    await expect(page.locator(".pd-status[data-state='open'], .pd-status[data-state='soon']")).toHaveCount(3);
    await expect(rounds.nth(0).locator(".pd-status")).toContainText("Predictions open · close in 15 h 55 min");
    await expect(rounds.nth(0).locator(".pd-status")).toHaveAttribute("data-state", "soon");
    await expect(rounds.nth(1).locator(".pd-status")).toHaveAttribute("data-state", "open");
    await expect(page.getByRole("link", { name: "Make a prediction" })).toHaveCount(3);
    await expect(page.locator(".pd-rules li")).toHaveCount(6);
    await expectNoA11yViolations(page);
  });

  test("після дедлайну етап «закрито», кнопка веде до перегляду", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-21T04:00:00Z")); // дедлайн етапу 21 — 03:55
    await page.goto("/predictions");
    const first = page.locator("li.pd-round").first();
    await expect(first.locator(".pd-status")).toHaveText("Predictions closed");
    await expect(first.getByRole("link", { name: "See predictions" })).toHaveAttribute("href", "/predictions/21");
    await expect(page.locator("li.pd-round").nth(1).locator(".pd-status")).toContainText("Predictions open");
  });

  test("українською: «Прогнози» в меню, тексти й посилання з префіксом /uk", async ({ page }) => {
    await page.goto("/uk/predictions");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Прогнози на гонки");
    await expect(page.getByRole("navigation", { name: "Розділи" }).getByRole("link", { name: "Прогнози" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator("li.pd-round").first().getByRole("link").first()).toHaveAttribute("href", /^\/uk\/predictions\/\d+$/);
  });

  test("320 px: без горизонтального скролу", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/uk/predictions");
    await expect(page.locator("li.pd-round")).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe("сторінка етапу", () => {
  test("не ввійшов: пропозиція входу з безпечним next; без запитів до Supabase з браузера", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (r) => r.url().startsWith(FAKE) && external.push(r.url()));
    await page.goto("/predictions/22");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Grand Prix");
    await expect(page.getByRole("heading", { name: "Sign in to make a prediction" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=%2Fpredictions%2F22"); // в шапці теж є «Sign in» — шукаємо лише в main
    await expect(page.locator(".pd-left")).toContainText(/left/); // відлік за часом сервера
    expect(external, "браузер говорить лише з нашим origin (CSP connect-src 'self')").toEqual([]);
    await expectNoA11yViolations(page);
  });

  test("невідомий етап — 404", async ({ page }) => {
    const res = await page.goto("/predictions/99");
    expect(res?.status()).toBe(404);
  });

  test("без ніка: вибір ніка прямо на сторінці, потім з'являються форми", async ({ page }) => {
    await loginToNick(page, mail());
    await page.goto("/predictions/22");
    await expect(page.getByRole("heading", { name: "Choose a nickname" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Qualifying", exact: true })).toHaveCount(0);
    await page.getByLabel("Nickname").fill(nick());
    await page.getByRole("button", { name: "Save nickname" }).click();
    await expect(page.getByRole("heading", { name: "Qualifying", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Race", exact: true })).toBeVisible();
  });

  test("повний шлях: заповнення, перевірка, обмін місцями, збереження, перезавантаження", async ({ page }) => {
    const { email, name } = await signUp(page);
    await page.goto("/predictions/22");
    await expect(page.getByText(`You are playing as ${name}.`)).toBeVisible();
    await expect(form(page, "Qualifying").getByRole("button", { name: "Save qualifying" })).toBeVisible();

    // Менше трьох місць — помилка на місці, фокус на першому порожньому, нічого не збережено.
    await slot(page, "Qualifying", 1).selectOption(String(ANTONELLI));
    await form(page, "Qualifying").getByRole("button", { name: "Save qualifying" }).click();
    await expect(form(page, "Qualifying").locator(".au-err")).toHaveText("Choose drivers for places 1–3.");
    await expect(slot(page, "Qualifying", 2)).toBeFocused();
    await expect(slot(page, "Qualifying", 2)).toHaveAttribute("aria-invalid", "true");
    expect(await stored(page, email)).toEqual([]);

    // Обмін місцями: Расселл (місце 3) → на місце 1: Антонеллі переходить на місце 3, дубля немає.
    await slot(page, "Qualifying", 2).selectOption(String(VERSTAPPEN));
    await slot(page, "Qualifying", 3).selectOption(String(RUSSELL));
    await slot(page, "Qualifying", 1).selectOption(String(RUSSELL));
    await expect(slot(page, "Qualifying", 1)).toHaveValue(String(RUSSELL));
    await expect(slot(page, "Qualifying", 3)).toHaveValue(String(ANTONELLI));
    await expect(form(page, "Qualifying").locator(".au-ok")).toHaveText("You have unsaved changes.");
    // Підпис опції підказує, де пілот зараз стоїть.
    await expect(slot(page, "Qualifying", 2).locator(`option[value="${RUSSELL}"]`)).toContainText("now in place 1");

    // «За чемпіонатом» → 1-2-3-4…, збереження.
    await form(page, "Qualifying").getByRole("button", { name: "Fill from the championship" }).click();
    await expect(slot(page, "Qualifying", 1)).toHaveValue(String(ANTONELLI));
    await expect(slot(page, "Qualifying", 2)).toHaveValue(String(VERSTAPPEN));
    await expect(slot(page, "Qualifying", 3)).toHaveValue(String(RUSSELL));
    await expect(slot(page, "Qualifying", 4)).toHaveValue(String(HAMILTON));
    await form(page, "Qualifying").getByRole("button", { name: "Save qualifying" }).click();
    await expect(form(page, "Qualifying").locator(".au-ok")).toHaveText("Saved. You can change it until predictions close.");
    const q = (await stored(page, email)).find((x) => x.kind === "Q")!;
    expect(q.picks.slice(0, 4)).toEqual([ANTONELLI, VERSTAPPEN, RUSSELL, HAMILTON]);
    expect(q.picks).toHaveLength(10);
    expect(q.dnfTeam).toBeNull();

    // Гонка: команда без фінішу.
    await fillTop(page, "Race");
    await form(page, "Race").getByLabel("Team without a finish").selectOption(String(RED_BULL));
    await form(page, "Race").getByRole("button", { name: "Save race" }).click();
    await expect(form(page, "Race").locator(".au-ok")).toHaveText("Saved. You can change it until predictions close.");
    const r = (await stored(page, email)).find((x) => x.kind === "R")!;
    expect(r.picks.slice(0, 3)).toEqual([ANTONELLI, VERSTAPPEN, RUSSELL]);
    expect([r.dnfTeam, r.allFinish]).toEqual([RED_BULL, false]);

    // «Усі фінішують» замінює команду; зміну можна зберегти ще раз.
    await form(page, "Race").getByLabel("Team without a finish").selectOption("all");
    await form(page, "Race").getByRole("button", { name: "Save race" }).click();
    await expect(form(page, "Race").locator(".au-ok")).toHaveText("Saved. You can change it until predictions close.");
    const r2 = (await stored(page, email)).find((x) => x.kind === "R")!;
    expect([r2.dnfTeam, r2.allFinish]).toEqual([null, true]);

    // Перезавантаження: форми показують збережене.
    await page.reload();
    await expect(slot(page, "Qualifying", 4)).toHaveValue(String(HAMILTON));
    await expect(form(page, "Race").getByLabel("Team without a finish")).toHaveValue("all");
    await expect(form(page, "Race").locator(".au-ok")).toHaveText("");
    await expectNoA11yViolations(page);
  });

  test("дедлайн минув під час правки: збереження відхиляє база, сторінка переходить у «лише перегляд», чужі прогнози відкриваються", async ({ page }) => {
    const { email, name } = await signUp(page);
    expect((await setDeadline(page, 19, 300)).ok()).toBe(true);
    await page.goto("/predictions/19");
    await fillTop(page, "Qualifying");
    await form(page, "Qualifying").getByRole("button", { name: "Save qualifying" }).click();
    await expect(form(page, "Qualifying").locator(".au-ok")).toHaveText("Saved. You can change it until predictions close.");

    await setDeadline(page, 19, -1); // дедлайн минув, сторінка про це ще не знає
    await slot(page, "Qualifying", 1).selectOption(String(HAMILTON));
    await form(page, "Qualifying").getByRole("button", { name: "Save qualifying" }).click();
    // Відповідь 409 → сторінка перечитує стан і лишає лише перегляд.
    await expect(page.getByRole("heading", { name: "Players' predictions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your prediction" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Save/ })).toHaveCount(0);
    await expect(page.getByText("Predictions for this round are closed.")).toBeVisible();
    // Правка не збереглася: у базі лишився попередній прогноз.
    expect((await stored(page, email)).find((x) => x.kind === "Q")!.picks[0]).toBe(ANTONELLI);
    // Таблиця чужих прогнозів: мій рядок із позначкою «ви», пілоти — трилітерними кодами.
    const row = page.getByRole("row", { name: new RegExp(name) });
    await expect(row).toContainText("(you)");
    await expect(row).toContainText("ANT");
    await expectNoA11yViolations(page);
  });

  test("320 px: таблиця прогнозів прокручується всередині, сторінка — ні", async ({ page }) => {
    await signUp(page);
    await setDeadline(page, 17, 300);
    await page.goto("/predictions/17");
    await fillTop(page, "Race");
    await form(page, "Race").getByRole("button", { name: "Save race" }).click();
    await expect(form(page, "Race").locator(".au-ok")).toHaveText("Saved. You can change it until predictions close.");
    await setDeadline(page, 17, -1);
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/predictions/17");
    const region = page.getByRole("region", { name: "Race predictions" });
    await expect(region).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth), "таблиця ширша за екран і прокручується сама").toBe(true);
  });
});

test.describe("чужі прогнози й приватність", () => {
  test("до дедлайну чужого прогнозу не видно нікому; після — публічно, без пошти й ідентифікаторів", async ({ page, browser }) => {
    const { email, name } = await signUp(page);
    await setDeadline(page, 18, 300);
    await page.goto("/predictions/18");
    await fillTop(page, "Qualifying");
    await form(page, "Qualifying").getByRole("button", { name: "Save qualifying" }).click();
    await expect(form(page, "Qualifying").locator(".au-ok")).toHaveText("Saved. You can change it until predictions close.");

    const anon = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "10.7.7.7" } });
    const visitor = await anon.newPage();
    const state = async () => (await visitor.request.get(`/api/predictions?year=${YEAR}&round=18`)).json();

    const before = await state();
    expect(before).toMatchObject({ closed: false, revealed: null, user: null, mine: null });
    expect(JSON.stringify(before)).not.toContain(name);

    await setDeadline(page, 18, -1);
    const after = await state();
    expect(after.closed).toBe(true);
    // Фейк живе весь прогін (і ретраї): рядків може бути більше, ніж мій, — перевіряємо мій і форму кожного.
    const mine = after.revealed.filter((x: { player: string }) => x.player === name);
    expect(mine).toEqual([expect.objectContaining({ kind: "Q", picks: expect.arrayContaining([ANTONELLI]) })]);
    expect(JSON.stringify(after)).not.toContain(email);
    for (const row of after.revealed) expect(Object.keys(row).sort()).toEqual(["allFinish", "dnfTeam", "kind", "picks", "player", "points"]);

    await visitor.goto("/predictions/18");
    await expect(visitor.getByRole("row", { name: new RegExp(name) })).toContainText("ANT");
    await expect(visitor.getByRole("button", { name: /Save/ })).toHaveCount(0);
    await expect(visitor.getByRole("heading", { name: "Sign in to make a prediction" })).toHaveCount(0);
    await anon.close();
  });
});

test.describe("API /api/predictions", () => {
  const body = (over: Record<string, unknown> = {}) => ({ year: YEAR, round: 22, kind: "Q", picks: [ANTONELLI, VERSTAPPEN, RUSSELL, null, null, null, null, null, null, null], ...over });
  const origin = { origin: BASE };

  test("захист запису: Origin, сесія, нік, закритий етап, некоректне тіло", async ({ page, browser }) => {
    // Без Origin і з чужим Origin — 403 до будь-якої перевірки.
    const anon = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "10.8.8.8" } });
    const visitor = await anon.newPage();
    expect((await visitor.request.post("/api/predictions", { data: body() })).status()).toBe(403);
    expect((await visitor.request.post("/api/predictions", { data: body(), headers: { origin: "https://evil.test" } })).status()).toBe(403);
    // Не ввійшов — 401.
    expect((await visitor.request.post("/api/predictions", { data: body(), headers: origin })).status()).toBe(401);
    await anon.close();

    // Ввійшов, але ніка немає — база не дає писати (no_profile → 403).
    await loginToNick(page, mail());
    const noNick = await page.request.post("/api/predictions", { data: body(), headers: origin });
    expect(noNick.status()).toBe(403);
    expect(await noNick.json()).toEqual({ error: "no_profile" });
    await page.getByLabel("Nickname").fill(nick());
    await page.getByRole("button", { name: "Save nickname" }).click();
    await expect(page).toHaveURL(`${BASE}/profile`);

    // Етап 21 закритий (у фейку етапи ≤ 21): база відхиляє, 409.
    const closed = await page.request.post("/api/predictions", { data: body({ round: 21 }), headers: origin });
    expect(closed.status()).toBe(409);
    expect(await closed.json()).toEqual({ error: "closed" });

    // Некоректне: повтор пілота, порожнє місце 3, невідомий вид, 11 слотів — 400 ще на сервері сайту.
    for (const bad of [
      body({ picks: [ANTONELLI, ANTONELLI, RUSSELL, null, null, null, null, null, null, null] }),
      body({ picks: [ANTONELLI, VERSTAPPEN, null, null, null, null, null, null, null, null] }),
      body({ kind: "S" }),
      body({ picks: [ANTONELLI, VERSTAPPEN, RUSSELL, null, null, null, null, null, null, null, null] }),
      body({ kind: "Q", dnfTeam: RED_BULL }),
    ]) {
      expect((await page.request.post("/api/predictions", { data: bad, headers: origin })).status(), JSON.stringify(bad)).toBe(400);
    }
    // Пілот чи команда, яких немає в базі: сайт пропускає форму, база відхиляє — 400 «invalid».
    const ghost = await page.request.post("/api/predictions", { data: body({ picks: [ANTONELLI, VERSTAPPEN, 999999, null, null, null, null, null, null, null] }), headers: origin });
    expect([ghost.status(), (await ghost.json()).error]).toEqual([400, "invalid"]);
    const ghostTeam = await page.request.post("/api/predictions", { data: body({ kind: "R", dnfTeam: 999999 }), headers: origin });
    expect([ghostTeam.status(), (await ghostTeam.json()).error]).toEqual([400, "invalid"]);
    // user_id у тілі нічого не міняє: запис іде під власником сесії.
    const ok = await page.request.post("/api/predictions", { data: { ...body(), userId: "00000000-0000-0000-0000-000000000000" }, headers: origin });
    expect(ok.status()).toBe(200);
  });

  test("GET: кривий запит — 400; відповідь без кешу", async ({ page }) => {
    expect((await page.request.get("/api/predictions?year=2026")).status()).toBe(400);
    expect((await page.request.get("/api/predictions?year=2026&round=x")).status()).toBe(400);
    const res = await page.request.get(`/api/predictions?year=${YEAR}&round=22`);
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toBe("no-store");
  });
});
