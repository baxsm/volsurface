import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  // the api allows 20 auth requests a minute per IP and the whole suite shares
  // one, so a sign-up can legitimately wait out the full window before
  // proceeding rather than failing the run
  timeout: 150_000,
  use: {
    // points at the dev server by default, at the built output when the
    // production bundle is what needs verifying
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "off",
    screenshot: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
