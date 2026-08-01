import path from "node:path";
import dotenv from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// Same rule as scripts/e2e-reset-db.ts: load .env.test only, never the dev
// .env, so a local `pnpm test:e2e` run can never point at the port-5434 dev
// database.
dotenv.config({ path: path.resolve(__dirname, ".env.test"), override: true });

const PORT = process.env.E2E_PORT ?? "3100";
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  // next dev compiles each route on its first hit, which can comfortably
  // exceed Playwright's 5s default on a route nobody has warmed up yet —
  // give assertions and navigations more room rather than racing that.
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    storageState: path.resolve(__dirname, "e2e/.auth/admin.json"),
  },
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      JWT_SECRET: process.env.JWT_SECRET ?? "",
      COOKIE_NAME: process.env.COOKIE_NAME ?? "",
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        // Taller than the device default so long modals (e.g. the fitment
        // item form) fit without their footer buttons landing below the
        // viewport, which Playwright's click-scroll doesn't always resolve
        // for content inside a nested `scroll="inside"` dialog.
        viewport: { width: 1280, height: 1400 },
      },
    },
  ],
});
