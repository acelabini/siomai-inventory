import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: { actionTimeout: 15_000, screenshot: 'only-on-failure' },
  outputDir: 'out/e2e-results',
  projects: [
    { name: 'electron', testMatch: 'app.spec.ts' },
    { name: 'mobile-web', testMatch: 'mobile-web.spec.ts' },
  ],
});
