import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  destinations,
  loadComparison,
  loadEnterprise,
  openDestination,
} from './helpers.js';

async function expectNoSeriousViolations(
  page: import('@playwright/test').Page,
) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(
    (violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(
    blocking,
    blocking.map((item) => `${item.id}: ${item.help}`).join('\n'),
  ).toEqual([]);
  expect(
    await page.locator('[id]').evaluateAll((nodes) => {
      const ids = nodes.map((node) => node.id);
      return ids.filter((id, index) => ids.indexOf(id) !== index);
    }),
  ).toEqual([]);
}

test('upload screen has no serious accessibility violations', async ({
  page,
}) => {
  await page.goto('/');
  await expectNoSeriousViolations(page);
});

test('every loaded destination passes the accessibility gate', async ({
  page,
}) => {
  await loadEnterprise(page);
  for (const [label, heading] of destinations) {
    await openDestination(page, label);
    await expect(
      page.getByRole('heading', { name: heading, exact: true }),
    ).toBeVisible();
    await expectNoSeriousViolations(page);
  }
});

test('comparison view passes the accessibility gate', async ({ page }) => {
  await loadComparison(page);
  await expectNoSeriousViolations(page);
});
