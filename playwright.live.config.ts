import { defineConfig } from '@playwright/test';

// No mocked API and no test users: exercise the running local UI and backend.
export default defineConfig({
  testDir: './tests/browser', testMatch: 'live.spec.ts', workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', channel: 'chrome', headless: true, screenshot: 'only-on-failure' },
});
