import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', testMatch: '*.spec.js', fullyParallel: false, workers: 1, retries: 0,
  timeout: 180000, expect: { timeout: 10000 }, reporter: 'line',
  outputDir: process.env.LEIA_E2E_OUTPUT || '/tmp/leia-browser-tests-unconfigured',
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1440, height: 1000 }, locale: 'pt-BR', timezoneId: 'Asia/Tokyo',
    reducedMotion: 'reduce', trace: 'off', video: 'off', screenshot: 'off', actionTimeout: 10000, navigationTimeout: 20000 },
});
