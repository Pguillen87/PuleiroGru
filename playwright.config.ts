import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  timeout: 45_000,
  workers: 2,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3107",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- -p 3107",
    url: "http://127.0.0.1:3107",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      MASCOT_GENERATION_PROVIDER: "mock",
      MOCK_GENERATION_DELAY_MS: "250",
      JOB_POLL_INTERVAL_MS: "100",
      JOB_TIMEOUT_MS: "1200",
      ALLOW_DEV_TEST_IDENTITY: "true",
      REGISTRATION_ENABLED: "true",
      MASTER_GENERATION_ENABLED: "false",
      POSE_GENERATION_ENABLED: "false",
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "edge", use: { ...devices["Desktop Edge"], channel: "msedge" } },
  ],
});
