import { test, expect } from '@playwright/test';
import { loadEnterprise } from './helpers.js';

test('touch shell targets meet minimum size and page has no shell overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await loadEnterprise(page);
  for (const name of [
    'Open navigation',
    'Open global search',
    'Migration Target Settings',
    'Close file',
  ]) {
    const box = await page.getByRole('button', { name }).boundingBox();
    expect(box, `${name} must be visible`).not.toBeNull();
    expect(box!.height, `${name} target height`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `${name} target width`).toBeGreaterThanOrEqual(44);
  }
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('dashboard remains usable at 200 percent zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadEnterprise(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await expect(
    page.getByRole('heading', { name: 'Executive Assessment Overview' }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Dashboard views' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('no action depends on hover', async ({ page }) => {
  await loadEnterprise(page);
  const hoverOnlyActions = page.locator(
    'button[class*="group-hover"], a[class*="group-hover"], [role="button"][class*="group-hover"]',
  );
  await expect(hoverOnlyActions).toHaveCount(0);
});
