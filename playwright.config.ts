import { defineConfig, devices } from "@playwright/test";

/**
 * Browser acceptance tests. Run against a seeded database:
 *   npm run db:reset && npm run build && npm run test:e2e
 * PLAYWRIGHT_BASE_URL points at an already running server; otherwise one is started on :3100.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, locale: "ar-EG", timezoneId: "Africa/Cairo", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {} } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : { command: "npx next start -p 3100", url: `${baseURL}/api/health`, reuseExistingServer: true, timeout: 120_000 },
});
