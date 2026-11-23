import { defineConfig, devices } from "@playwright/test";

// Порти можна змінити (E2E_PORT, E2E_DB_PORT): другий worktree поруч із уже запущеним сервером на 3100 / 54321.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const DB_PORT = Number(process.env.E2E_DB_PORT ?? 54321);
const FAKE_DB_ENV = { SUPABASE_URL: `http://127.0.0.1:${DB_PORT}`, SUPABASE_ANON_KEY: "test-anon" };
// Адмінка (фаза 7): фейкові GitHub OAuth, Resend, Commons і GitHub API (scripts/dev/fake-services.mjs) і тестові значення — справжні ключі лише у Vercel.
const AUTH_PORT = 4455;
const FAKE_ADMIN_ENV = {
  ADMIN_AUTH_SECRET: "e2e-only-admin-secret-0123456789abcdef",
  ADMIN_LOGIN_KEY: "e2e-login-key-0123456789",
  ADMIN_GITHUB_CLIENT_ID: "test-gh-client",
  ADMIN_GITHUB_CLIENT_SECRET: "test-gh-secret",
  ADMIN_GITHUB_IDS: "195572242",
  ADMIN_GITHUB_OAUTH_BASE: `http://127.0.0.1:${AUTH_PORT}`,
  ADMIN_EMAILS: "owner@example.test",
  ADMIN_RESEND_KEY: "test-resend-key",
  ADMIN_RESEND_API: `http://127.0.0.1:${AUTH_PORT}`,
  ADMIN_COMMONS_API: `http://127.0.0.1:${AUTH_PORT}`,
  ADMIN_GITHUB_TOKEN: "test-gh-token",
  ADMIN_GITHUB_API: `http://127.0.0.1:${AUTH_PORT}`,
  ADMIN_YOUTUBE_API: `http://127.0.0.1:${AUTH_PORT}`,
  // Здоров'я джерел (7c): сайти джерел і Web Archive — фейк (справжніх зовнішніх запитів e2e не робить).
  ADMIN_LINKS_FAKE: `http://127.0.0.1:${AUTH_PORT}`,
  ADMIN_ARCHIVE_FAKE: `http://127.0.0.1:${AUTH_PORT}`,
};
// Погода вікенду (OpenF1 / MET Norway): у e2e назовні не ходимо — адреси ведуть на фейк-сервіс (404 → сторінка гонки без
// блока погоди); сам блок перевіряється підміною /api/weather у браузері (e2e/race.spec.ts).
const FAKE_WEATHER_ENV = { OPENF1_API: `http://127.0.0.1:${AUTH_PORT}/openf1`, MET_API: `http://127.0.0.1:${AUTH_PORT}/met` };
const externalBaseURL = process.env.BASE_URL;
const baseURL = externalBaseURL ?? `http://localhost:${PORT}`;
// Прев'ю Vercel за Deployment Protection: global-setup обмінює секрет на cookie домену прев'ю
// (не extraHTTPHeaders — ті йдуть з кожним запитом, зокрема на сторонні хости, і потрапляють у trace).
const bypass = !!externalBaseURL && !!process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // CI: 3 воркери замість типових 2 (22.11: набір e2e ≈ 600 тестів, job `check` впирається в timeout 15 хв — відміни на 596-му тесті).
  workers: process.env.CI ? 3 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  globalSetup: bypass ? "./e2e/vercel-bypass.setup.ts" : undefined,
  use: {
    baseURL,
    // Проти прев'ю trace не пишемо: у ньому були б cookie обходу захисту.
    trace: externalBaseURL ? "off" : "retain-on-failure",
    storageState: bypass ? "e2e/.auth/vercel.json" : undefined,
  },
  projects: [
    {
      name: "chromium",
      // PLAYWRIGHT_CHANNEL=chrome — системний Chrome (macOS 12: Chromium Playwright не підтримується).
      use: { ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
    },
  ],
  // BASE_URL задано (прев'ю Vercel) — локальний сервер не потрібен.
  // У CI збірку робить окремий крок, тут лише запуск. Дані — фейковий PostgREST з фікстурою бази
  // (e2e/fixtures/db; у CI його вже запустив окремий крок — перевикористовуємо).
  webServer: externalBaseURL
    ? undefined
    : [
        {
          command: `node scripts/dev/fake-postgrest.mjs --port ${DB_PORT}`,
          port: DB_PORT,
          reuseExistingServer: true,
        },
        {
          command: `node scripts/dev/fake-services.mjs --port ${AUTH_PORT}`,
          port: AUTH_PORT,
          reuseExistingServer: true,
        },
        {
        command: process.env.CI
          ? `npx next start -p ${PORT}`
          : `npm run build && npx next start -p ${PORT}`,
        // Готовність — відкритий порт, а не статус «/»: зламана сторінка має впасти в тесті, а не в тайм-ауті.
        port: PORT,
        // Чужий або старий сервер на порту дав би хибно-зелений прогін; перевикористання — лише явно.
        reuseExistingServer: process.env.PW_REUSE === "1",
        timeout: process.env.CI ? 60_000 : 180_000,
        // Абсолютні canonical/hreflang/sitemap мають вказувати на цей сервер (e2e порівнює рядки повністю).
        env: { NEXT_TELEMETRY_DISABLED: "1", SITE_URL: `http://localhost:${PORT}`, ...FAKE_DB_ENV, ...FAKE_ADMIN_ENV, ...FAKE_WEATHER_ENV },
        },
      ],
});
