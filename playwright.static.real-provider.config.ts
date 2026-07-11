import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:4174";

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  timeout: 300_000,
  preserveOutput: "never",
  expect: {
    timeout: 10_000,
  },
  reporter: "list",
  use: {
    baseURL,
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  webServer: {
    command: "npm exec -- vite preview --config vite.static.config.ts --host 127.0.0.1 --port 4174 --strictPort",
    reuseExistingServer: false,
    timeout: 120_000,
    url: baseURL,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
