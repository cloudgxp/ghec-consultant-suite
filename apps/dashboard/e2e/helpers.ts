import { expect, type Page } from '@playwright/test';

export const destinations = [
  ['Overview', 'Executive Assessment Overview'],
  ['Migration Readiness', 'Migration Readiness & Advisory Analysis'],
  ['Repositories', 'Repository Inventory'],
  ['Actions', 'Actions'],
  ['Security & Governance', 'Security, Governance & Integrations'],
  ['Teams & Access', 'Teams, Access & Pseudonymized Identities'],
  ['Collector Health', 'Collector Health & Evidence Audit'],
  ['Export Center', 'Report Export Center'],
] as const;

export async function loadEnterprise(page: Page) {
  await page.goto('/');
  await page
    .getByRole('button', { name: /Multi-Org Enterprise Sample/ })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Executive Assessment Overview' }),
  ).toBeVisible();
}

export async function openDestination(page: Page, label: string) {
  if (page.viewportSize()!.width < 1024)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Dashboard views' })
    .getByRole('button', { name: new RegExp(`^${label}`) })
    .click();
}

export async function setTheme(page: Page, theme: 'Light' | 'Dark') {
  await page.locator('select[aria-label="Color theme"]').evaluate(
    (node, value) => {
      const select = node as HTMLSelectElement;
      select.value = value as string;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    },
    theme === 'Light' ? 'ghec-light' : 'ghec-dark',
  );
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    theme === 'Light' ? 'ghec-light' : 'ghec-dark',
  );
}

export async function loadComparison(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Compare Two Scans' }).click();
  const inputs = page.locator('input[type=file]');
  const fixture = '../../fixtures/synthetic/enterprise-v1.json';
  await inputs.nth(0).setInputFiles(fixture);
  await inputs.nth(1).setInputFiles(fixture);
  await page.getByRole('button', { name: 'Load and Compare Scans' }).click();
  await expect(
    page.getByRole('heading', { name: 'Remediation Progress Tracker' }),
  ).toBeVisible();
}
