import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running app + local Supabase:
 *   npx supabase start && npm run build && npm start
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "ar-EG",
    timezoneId: "Africa/Cairo",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
