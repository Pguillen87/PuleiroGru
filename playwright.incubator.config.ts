import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "incubation-journal.spec.ts",
  timeout: 45_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3118",
    extraHTTPHeaders: { Origin: "http://127.0.0.1:3118" },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- -p 3118",
    url: "http://127.0.0.1:3118",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_DIST_DIR: ".next-incubator-playwright",
      PULEIRO_ALLOWED_ORIGINS: "http://127.0.0.1:3118",
      NEXT_PUBLIC_ALLOW_DEV_TEST_IDENTITY: "true",
      MASCOT_GENERATION_PROVIDER: "mock",
      ALLOW_DEV_TEST_IDENTITY: "true",
      REGISTRATION_ENABLED: "true",
      MASTER_GENERATION_ENABLED: "false",
      POSE_GENERATION_ENABLED: "false",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
