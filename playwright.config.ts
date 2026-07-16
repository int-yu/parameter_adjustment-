import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'node ./node_modules/vite/bin/vite.js --host 127.0.0.1',
    url: 'http://127.0.0.1:5173/parameter_adjustment-/',
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173/parameter_adjustment-/',
    channel: 'chrome',
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
})
