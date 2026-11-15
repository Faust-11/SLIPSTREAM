import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const DB_PORT = 54321;
const FAKE_DB_ENV = { SUPABASE_URL: `http://127.0.0.1:${DB_PORT}`, SUPABASE_ANON_KEY: "test-anon" };
// Адмінка (фаза 7): фейковий «Google» (scripts/dev/fake-oidc.mjs) і тестові значення — справжні ключі лише у Vercel.
const OIDC_PORT = 4455;
const ADMIN_TEST_EMAIL = "owner@example.test";
const FAKE_ADMIN_ENV = {
  ADMIN_EMAILS: ADMIN_TEST_EMAIL,
  ADMIN_AUTH_SECRET: "e2e-only-admin-secret-0123456789abcdef",
  ADMIN_GOOGLE_CLIENT_ID: "test-client",
  ADMIN_GOOGLE_CLIENT_SECRET: "test-secret",
  ADMIN_OIDC_ISSUER: `http://127.0.0.1:${OIDC_PORT}`,
  ADMIN_LOGIN_KEY: "e2e-login-key-0123456789",
};
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
          command: `node scripts/dev/fake-oidc.mjs --port ${OIDC_PORT}`,
          port: OIDC_PORT,
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
        env: { NEXT_TELEMETRY_DISABLED: "1", SITE_URL: `http://localhost:${PORT}`, ...FAKE_DB_ENV, ...FAKE_ADMIN_ENV },
        },
      ],
});
