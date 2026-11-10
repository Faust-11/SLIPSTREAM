import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const externalBaseURL = process.env.BASE_URL;
const baseURL = externalBaseURL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // PLAYWRIGHT_CHANNEL=chrome — системний Chrome (macOS 12: Chromium Playwright не підтримується).
      use: { ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
    },
  ],
  // BASE_URL задано (прев'ю Vercel) — локальний сервер не потрібен.
  // У CI збірку робить окремий крок, тут лише запуск.
  webServer: externalBaseURL
    ? undefined
    : {
        command: process.env.CI
          ? `npx next start -p ${PORT}`
          : `npx next build && npx next start -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: { NEXT_TELEMETRY_DISABLED: "1" },
      },
});
