import { test, expect } from '@playwright/test';
import {
  destinations,
  loadComparison,
  loadEnterprise,
  openDestination,
} from './helpers.js';

test('offline workflow and every navigation destination work', async ({
  page,
}) => {
  await loadEnterprise(page);
  for (const [label, heading] of destinations) {
    await openDestination(page, label);
    await expect(
      page.getByRole('heading', { name: heading, exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Dashboard views' })
        .getByRole('button', { name: new RegExp(`^${label}`) }),
    ).toHaveAttribute('aria-current', 'page');
  }
});

test('scope, search, settings, filters, and close flow preserve focus', async ({
  page,
}) => {
  await loadEnterprise(page);
  await page.getByLabel('Filter scope by organizations').click();
  await page.getByText('Fictional North', { exact: false }).last().click();
  await page.getByRole('button', { name: 'Open global search' }).click();
  await expect(page.getByRole('searchbox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Open global search' }),
  ).toBeFocused();

  await page.getByRole('button', { name: 'Migration Target Settings' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Migration Target Settings' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Migration Target Settings' }),
  ).toBeFocused();

  await openDestination(page, 'Repositories');
  await expect(page.locator('#page-heading')).toBeFocused();
  await page.getByRole('searchbox', { name: 'Search' }).fill('no-match');
  await expect(
    page.getByRole('button', { name: /Remove Search: no-match filter/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(
    page.getByRole('table', { name: 'Repository inventory table' }),
  ).toBeVisible();
  const virtualRows = page.locator('[role="row"][tabindex="0"]');
  await virtualRows.first().focus();
  await virtualRows.first().press('ArrowDown');
  if ((await virtualRows.count()) > 1)
    await expect(virtualRows.nth(1)).toBeFocused();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Repositories (CSV)' }).click();
  await download;
  await expect(page.getByRole('status')).toContainText('Download ready');

  await openDestination(page, 'Actions');
  await openDestination(page, 'Secrets & Variables');
  await expect(
    page.getByRole('table', { name: 'Secrets and variables inventory table' }),
  ).toBeVisible();
  await openDestination(page, 'Security & Governance');
  await page.getByRole('button', { name: /Policies & Rulesets/ }).click();
  await expect(
    page.getByRole('table', { name: 'Policies and rulesets table' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Integrations & Keys/ }).click();
  await expect(
    page.getByRole('table', { name: 'Integrations table' }),
  ).toBeVisible();
  await openDestination(page, 'Teams & Access');
  await page.getByRole('button', { name: /Pseudonymized Identities/ }).click();
  await expect(
    page.getByRole('table', { name: 'Identities and access table' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Close file' }).click();
  await expect(
    page.getByRole('alertdialog', { name: 'Close this scan?' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Close file' })).toBeFocused();
});

test('mobile drawer is keyboard operable and closes after navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await loadEnterprise(page);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(
    page.getByRole('navigation', { name: 'Dashboard views' }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Dashboard views' })
    .getByRole('button', { name: /^Repositories/ })
    .press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Repository Inventory', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#page-heading')).toBeFocused();
  await expect(
    page.getByRole('navigation', { name: 'Dashboard views' }),
  ).toBeHidden();
});

test('comparison exposes remediation navigation', async ({ page }) => {
  await loadComparison(page);
  await expect(
    page
      .getByRole('navigation', { name: 'Dashboard views' })
      .getByRole('button', { name: /^Remediation Tracker/ }),
  ).toHaveAttribute('aria-current', 'page');
});

test('focus is visible and reduced motion is honored', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  expect(
    await skip.evaluate((node) => getComputedStyle(node).outlineStyle),
  ).not.toBe('none');
  expect(
    await page.evaluate(
      () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
  ).toBe(true);
});
