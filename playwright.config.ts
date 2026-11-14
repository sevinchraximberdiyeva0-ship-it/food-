import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1,
  use: { channel: 'chrome', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'backend-ui', testMatch: ['backend.spec.ts', 'admin.spec.ts'], use: { baseURL: 'http://127.0.0.1:5178' } },
    { name: 'local-demo', testMatch: 'demo.spec.ts', use: { baseURL: 'http://127.0.0.1:5179' } },
  ],
  webServer: [
    { command: 'npm run dev -- --port 5178 --strictPort', url: 'http://127.0.0.1:5178', reuseExistingServer: false, env: { VITE_DEMO_MODE: 'false' } },
    { command: 'npm run dev -- --port 5179 --strictPort', url: 'http://127.0.0.1:5179', reuseExistingServer: false, env: { VITE_DEMO_MODE: 'true' } },
  ],
});
