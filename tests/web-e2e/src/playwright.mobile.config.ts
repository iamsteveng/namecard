import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './mobile',
  timeout: 60_000,
  expect: {
    timeout: 5_000,
  },
  projects: [
    {
      name: 'webkit-mobile',
      use: {
        ...devices['iPhone 14'],
        browserName: 'webkit',
      },
    },
  ],
  webServer: {
    command: 'PORT=3000 pnpm --filter @namecard/web dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:3000/scan',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  reporter: [['list']],
});
