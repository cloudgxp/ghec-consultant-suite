import { defineConfig } from '@playwright/test';

const snapshotProfile = process.env.PLAYWRIGHT_SNAPSHOT_PROFILE;
if (snapshotProfile && !/^[a-z0-9-]+$/.test(snapshotProfile)) {
  throw new Error('PLAYWRIGHT_SNAPSHOT_PROFILE must be lowercase kebab-case');
}

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  snapshotPathTemplate: snapshotProfile
    ? `{testDir}/__screenshots__/${snapshotProfile}/{arg}{ext}`
    : '{testDir}/__screenshots__/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
