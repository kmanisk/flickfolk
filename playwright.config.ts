import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3101",
    headless: true,
    actionTimeout: 5000,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:3101/healthz",
    env: { PORT: "3101", HOST: "127.0.0.1" },
    reuseExistingServer: false,
  },
});
