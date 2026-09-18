import { defineConfig } from "@playwright/test";

const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: isCi ? 1 : 0,
  reporter: isCi
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-report" }], ["list"]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.VITE_SIGA_URL ?? "http://localhost:3006",
    trace: isCi ? "retain-on-failure" : "on-first-retry",
    screenshot: "only-on-failure",
    video: isCi ? "retain-on-failure" : "off",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
