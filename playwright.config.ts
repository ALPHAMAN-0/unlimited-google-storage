import { defineConfig, devices } from "@playwright/test";

/**
 * The dev server keeps `'unsafe-inline'` and `'unsafe-eval'` in `script-src`
 * (React Fast Refresh needs `eval`), so the dev server can never exercise the
 * strict production CSP. Set `PLAYWRIGHT_PRODUCTION=1` to run the suite
 * against a real production build instead — this is what CI does, so a broken
 * production CSP fails the pipeline instead of silently shipping a blank page.
 */
const useProduction = process.env.PLAYWRIGHT_PRODUCTION === "1";

/**
 * The suite needs the app to boot, which means `src/lib/env.ts` has to
 * validate successfully. These are throwaway values: the suite never signs
 * in and never talks to Google, it only checks that routes render and that
 * guards reject unauthenticated requests.
 *
 * `DATABASE_URL` still points at a real Postgres — Prisma connects at request
 * time, so an unreachable database turns every API route into a 500 and the
 * guard assertions become meaningless. CI provides one via a service
 * container; locally, point this at your own database.
 */
const e2eEnv = {
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgresql://ugs:ugs@localhost:5432/ugs",
  NEXTAUTH_SECRET:
    process.env.NEXTAUTH_SECRET ?? "e2e-playwright-secret-value-32-bytes",
  NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "e2e-client-id",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "e2e-client-secret",
  TOKEN_ENCRYPTION_KEY:
    process.env.TOKEN_ENCRYPTION_KEY ??
    "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  CRON_SECRET: process.env.CRON_SECRET ?? "e2e-cron-secret",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: useProduction ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: e2eEnv,
  },
});
