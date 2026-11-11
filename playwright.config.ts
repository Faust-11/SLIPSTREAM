import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const DB_PORT = 54321;
const FAKE_DB_ENV = { SUPABASE_URL: `http://127.0.0.1:${DB_PORT}`, SUPABASE_ANON_KEY: "test-anon" };
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
        command: process.env.CI
          ? `npx next start -p ${PORT}`
          : `npx next build && npx next start -p ${PORT}`,
        // Готовність — відкритий порт, а не статус «/»: зламана сторінка має впасти в тесті, а не в тайм-ауті.
        port: PORT,
        // Чужий або старий сервер на порту дав би хибно-зелений прогін; перевикористання — лише явно.
        reuseExistingServer: process.env.PW_REUSE === "1",
        timeout: process.env.CI ? 60_000 : 180_000,
        // Абсолютні canonical/hreflang/sitemap мають вказувати на цей сервер (e2e порівнює рядки повністю).
        env: { NEXT_TELEMETRY_DISABLED: "1", SITE_URL: `http://localhost:${PORT}`, ...FAKE_DB_ENV },
        },
      ],
});
