import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  reporter: "list",
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-file",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
