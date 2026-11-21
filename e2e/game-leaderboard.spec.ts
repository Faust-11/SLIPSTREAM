import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * Таблиця лідерів гри (фаза 9d) і вхід. Supabase Auth і PostgREST (play, у т. ч. lap_board / save_lap) — фейки зі scripts/dev
 * (fake-supabase-auth.mjs); секрет запису задано сайту змінною GAME_LAP_SECRET у playwright.config.ts. Паралельні тести не заважають одне
 * одному: кожен працює зі своєю трасою (або своїм гравцем) і чужі кола додає через POST /__play/seed-laps.
 * Проти прев'ю/проду (BASE_URL) фейків немає — тести пропускаються.
 */
test.skip(!!process.env.BASE_URL, "фейковий Supabase є лише в локальному запуску");

const FAKE = `http://127.0.0.1:${process.env.E2E_DB_PORT ?? 54321}`;
const BASE = `http://localhost:${process.env.E2E_PORT ?? 3100}`;
const TRACKS = JSON.parse(readFileSync(join(__dirname, "../src/lib/game/tracks.json"), "utf8")) as Record<string, { botInputs: string; botTicks: number }>;
const rnd = () => Math.random().toString(36).slice(2, 10);

test.beforeEach(async ({ context }) => {
  // М'який обмежувач сайту рахує за джерелом: кожному тесту — своя «адреса».
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}` });
});

/** Чужі кола на трасах (стара сівба цих трас прибирається: retry чи повторний запуск не множить рядки). */
const seedLaps = (page: Page, laps: { nick: string; track: string; ticks: number; jump?: boolean }[], reset = true) =>
  page.request.post(`${FAKE}/__play/seed-laps`, { data: { resetTracks: reset ? [...new Set(laps.map((l) => l.track))] : [], laps } });

async function signUp(page: Page) {
  const email = `lb${rnd()}${rnd()}@example.test`;
  const name = `Racer${rnd()}`;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
  const code = (await (await page.request.get(`${FAKE}/__auth/last-code?email=${encodeURIComponent(email)}`)).json()).code;
  await page.getByLabel("Code from the email").fill(code);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose a nickname" })).toBeVisible();
  await page.getByLabel("Nickname").fill(name);
  await page.getByRole("button", { name: "Save nickname" }).click();
  await expect(page).toHaveURL(`${BASE}/profile`);
  return { email, name };
}

const board = (page: Page) => page.locator("#gm-lb");
const post = (page: Page, body: unknown, origin = BASE) => page.request.post("/api/game/laps", { data: body, headers: { origin } });

test("анонім: таблиця траси з місцями, вкладки, порожня траса, підказки про вхід (до старту й під таблицею)", async ({ page }) => {
  await seedLaps(page, [
    { nick: "Ліза", track: "plateau", ticks: 4700 },
    { nick: "Макс", track: "plateau", ticks: 4600, jump: true },
    { nick: "Олег", track: "plateau", ticks: 4700 },
  ]);
  await page.goto("/uk/game#plateau");
  await expect(board(page).getByRole("heading", { name: "Таблиця лідерів" })).toBeVisible();
  const table = board(page).getByRole("table", { name: "Найкращі кола на трасі «Плато»" });
  await expect(table.getByRole("row")).toHaveCount(4); // шапка + 3
  const first = table.getByRole("row").nth(1);
  await expect(first).toContainText("Макс");
  await expect(first).toContainText("0:38.333");
  await expect(first.getByLabel("фальстарт +1 с")).toBeVisible();
  // Однаковий час — однакове місце (1, 2, 2), порядок за часом, потім за датою.
  await expect(table.getByRole("row").nth(2).getByRole("cell").first()).toHaveText("2");
  await expect(table.getByRole("row").nth(3).getByRole("cell").first()).toHaveText("2");
  await expect(board(page).getByText(/Гравців на трасі: \d+/)).toBeVisible();
  // Вкладка іншої траси не міняє трасу гри.
  await board(page).getByRole("button", { name: "Бір" }).click();
  await expect(board(page).getByRole("button", { name: "Бір" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".gm-tcard[aria-pressed='true']")).toContainText("Плато");
  // Підказки про вхід: до старту (на сцені) і під таблицею; обидві ведуть на вхід із поверненням у гру.
  const hint = page.locator(".gm-overlay .gm-lb-hint");
  await expect(hint).toContainText("увійдіть на сайті");
  await expect(hint.getByRole("link", { name: "Увійти" })).toHaveAttribute("href", "/uk/login?next=%2Fuk%2Fgame");
  await expect(board(page).getByRole("link", { name: "Увійти" })).toHaveAttribute("href", "/uk/login?next=%2Fuk%2Fgame");
  await expect(page.locator(".gm-note").first()).toContainText("увійдіть на сайті");
});

test("API без входу й з чужого Origin: 401 / 403; публічна таблиця не віддає службових полів", async ({ page }) => {
  expect((await post(page, { track: "port", inputs: TRACKS.port!.botInputs })).status()).toBe(401);
  expect((await post(page, { track: "port", inputs: TRACKS.port!.botInputs }, "https://evil.example")).status()).toBe(403);
  const res = await page.request.get("/api/game/leaderboard?track=port");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("s-maxage=30");
  expect(await res.text()).not.toMatch(/user_id|inputs|email/);
  expect((await page.request.get("/api/game/leaderboard?track=monza")).status()).toBe(400);
});

test("ввійшов: свій рекорд із браузера → у таблицю (час рахує сервер, а не клієнт), підсвічено, гірше коло не перезаписує", async ({ page }) => {
  const forest = TRACKS.forest!;
  const me = await signUp(page);
  // Чужі кола на цій трасі: один швидший за бота, один повільніший.
  await seedLaps(page, [{ nick: `Fast${rnd()}`, track: "forest", ticks: forest.botTicks - 100 }, { nick: `Slow${rnd()}`, track: "forest", ticks: forest.botTicks + 500 }]);
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), ["slipstream-hotlap-v2-forest", JSON.stringify({ best: { inputs: forest.botInputs, total: forest.botTicks }, laps: [], sectors: null })] as const);
  await page.goto("/game#forest");
  await expect(board(page).getByText(/Your place|You have no lap/)).toBeVisible();
  await expect(board(page).getByText("You have no lap on this circuit in the leaderboard yet.")).toBeVisible();
  // Підказки для анонімів зникли.
  await expect(page.locator(".gm-overlay .gm-lb-hint")).toHaveCount(0);
  await expect(board(page).getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await board(page).getByRole("button", { name: /^Send my record \(0:23\.500\)/ }).click();
  await expect(board(page).getByText("Saved to the leaderboard · place 2")).toBeVisible();
  const row = board(page).locator("tr.is-you");
  await expect(row).toContainText(me.name);
  await expect(row).toContainText("0:23.500");
  await expect(board(page).getByText("Your place: 2 · 0:23.500")).toBeVisible();
  const stored = await (await page.request.get(`${FAKE}/__play/laps?email=${encodeURIComponent(me.email)}`)).json();
  expect(stored).toEqual([expect.objectContaining({ track: "forest", ticks: forest.botTicks, jump: false })]);
  // Підроблений час не приймається: сервер рахує сам (тіло з ticks:1 — ігнорується), обірваний ввід — відхилено.
  const forged = await post(page, { track: "forest", inputs: forest.botInputs, jump: false, ticks: 1, time: 1 });
  expect(forged.status()).toBe(200);
  expect(await forged.json()).toMatchObject({ saved: false, ticks: forest.botTicks });
  const cut = await post(page, { track: "forest", inputs: forest.botInputs.split(",").slice(0, 10).join(",") });
  expect(cut.status()).toBe(400);
  expect((await post(page, { track: "forest", inputs: "zz" })).status()).toBe(400);
  expect(await (await page.request.get(`${FAKE}/__play/laps?email=${encodeURIComponent(me.email)}`)).json()).toHaveLength(1);
});

test("ввійшов без ніка: коло не зберігається, відповідь 403 (no_profile)", async ({ page }) => {
  const email = `nonick${rnd()}@example.test`;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  const code = (await (await page.request.get(`${FAKE}/__auth/last-code?email=${encodeURIComponent(email)}`)).json()).code;
  await page.getByLabel("Code from the email").fill(code);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose a nickname" })).toBeVisible();
  const res = await post(page, { track: "port", inputs: TRACKS.port!.botInputs });
  expect(res.status()).toBe(403);
  expect((await res.json()).error).toBe("no_profile");
});

for (const [w, h] of [
  [390, 844],
  [360, 640],
] as const) {
  test.describe(`телефон ${w}×${h}: вікно гри`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    test("майже на весь екран, під ним відступ — палець на кнопках не зачіпає текст нижче", async ({ page }) => {
      await page.goto("/uk/game");
      const stage = (await page.locator(".gm-game").boundingBox())!;
      expect(stage.height).toBeGreaterThanOrEqual(h * 0.8);
      expect(Math.abs(stage.height - Math.max(460, h - 88))).toBeLessThanOrEqual(2);
      // Відступ між вікном і наступним вмістом (панель «Твої кола»): ≥ 56 px = 40 px буфер + проміжок сітки.
      const below = (await page.locator(".gm-aside").boundingBox())!;
      expect(below.y - (stage.y + stage.height)).toBeGreaterThanOrEqual(56);
      // Кнопки керування — не впритул до нижнього краю вікна (≥ 20 px від краю: великий палець не з'їжджає за межу).
      await page.getByRole("button", { name: "Старт", exact: true }).tap();
      await expect(page.locator(".gm-game")).toHaveClass(/is-running/);
      const stage2 = (await page.locator(".gm-game").boundingBox())!;
      for (const el of await page.locator(".gm-touch button").all()) {
        const b = (await el.boundingBox())!;
        expect(stage2.y + stage2.height - (b.y + b.height)).toBeGreaterThanOrEqual(20);
      }
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".gm-game")!).touchAction)).toBe("none");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w);
    });
  });
}

for (const theme of ["light", "dark"] as const)
  for (const w of [320, 390, 1280])
    test(`таблиця лідерів без порушень axe і прокрутки вбік: ${theme}, ${w} px`, async ({ page }) => {
      // Без скидання: шість паралельних варіантів засівають одну трасу, скидання одного прибрало б рядки в іншого.
      await seedLaps(
        page,
        [
          { nick: "Ліза", track: "lyman", ticks: 3700 },
          { nick: "Макс", track: "lyman", ticks: 3600, jump: true },
        ],
        false,
      );
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto("/uk/game");
      await expect(board(page).getByRole("table")).toBeVisible();
      await expect(board(page).getByRole("link", { name: "Увійти" })).toBeVisible();
      await expectNoA11yViolations(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
