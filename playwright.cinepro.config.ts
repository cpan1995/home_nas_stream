import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/cinepro', timeout: 60_000, expect: { timeout: 20_000 },
  workers: 1, fullyParallel: false, reporter: 'list',
  outputDir: '.local/cinepro-test-results',
  use: { baseURL: 'http://127.0.0.1:5174', browserName: 'chromium', serviceWorkers: 'block',
    viewport: { width: 1920, height: 1080 }, screenshot: 'only-on-failure', trace: 'retain-on-failure',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } },
});
