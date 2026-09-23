import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:4175";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
      },
    },
  ],
  webServer: {
    command:
      "VITE_PICKTONIGHT_ANALYTICS_ENVIRONMENT=test VITE_PICKTONIGHT_E2E_API=1 npm run dev -- --host 127.0.0.1 --port 4175 --strictPort",
    url: baseURL,
    // The critical flow requires the explicit deterministic E2E mode.
    // Never reuse an unrelated local Vite server because that could run the
    // live recommendation path instead of the checked-in fixture seam.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
