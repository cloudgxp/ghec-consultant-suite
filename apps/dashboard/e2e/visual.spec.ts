import { test, expect } from '@playwright/test';
import {
  loadComparison,
  loadEnterprise,
  openDestination,
  setTheme,
} from './helpers.js';

const viewports = [
  { name: 'phone-320x568', width: 320, height: 568 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'compact-1024x768', width: 1024, height: 768 },
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'wide-1920x1080', width: 1920, height: 1080 },
] as const;

for (const viewport of viewports) {
  for (const theme of ['Light', 'Dark'] as const) {
    test(`overview ${viewport.name} ${theme.toLowerCase()}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await loadEnterprise(page);
      await setTheme(page, theme);
      await expect(page).toHaveScreenshot(
        `overview-${viewport.name}-${theme.toLowerCase()}.png`,
        { animations: 'disabled' },
      );
    });
  }
}

test('upload empty and error states', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/');
  await expect(page).toHaveScreenshot('upload-empty.png', {
    animations: 'disabled',
  });
  await page.locator('input[type=file]').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ invalid'),
  });
  await expect(
    page.getByRole('heading', { name: 'Import failed' }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot('upload-error.png', {
    animations: 'disabled',
  });
});

test('drawer and settings transient layers', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await loadEnterprise(page);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page).toHaveScreenshot('mobile-drawer-dark.png', {
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Migration Target Settings' }).click();
  await expect(page).toHaveScreenshot('settings-modal.png', {
    animations: 'disabled',
  });
});

test('filtered inventory and remediation states', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadEnterprise(page);
  await openDestination(page, 'Repositories');
  await page.getByRole('searchbox', { name: 'Search' }).fill('no-match');
  await expect(page).toHaveScreenshot('repositories-filtered.png', {
    animations: 'disabled',
  });
  await loadComparison(page);
  await setTheme(page, 'Dark');
  await expect(page).toHaveScreenshot('remediation-dark.png', {
    animations: 'disabled',
  });
});
