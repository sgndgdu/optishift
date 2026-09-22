import { defineConfig, devices } from "@playwright/test";

/**
 * Mega stres testi canlı (prod Vercel) ortamına karşı çalışır — yerel dev
 * server başlatılmaz (webServer tanımlı değil, bilinçli).
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "https://web-nine-drab-19.vercel.app",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
