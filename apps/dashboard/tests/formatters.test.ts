import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DiscoveryBundle } from '@ghec/contracts';

import {
  formatBytesMetric,
  formatCountMetric,
  formatMinutesMetric,
  formatBytes,
  formatTimestamp,
  formatDuration,
  getSeverityBadgeClass,
  getDimensionStatusBadgeClass,
  getCollectorStatusBadgeClass,
  resolveOrgName,
} from '../src/lib/formatters.js';

test('formatBytesMetric respects availability and formats observed values', () => {
  assert.equal(formatBytesMetric(null), 'Unknown');
  assert.equal(formatBytesMetric(undefined), 'Unknown');

  assert.equal(
    formatBytesMetric({
      value: 1024,
      unit: 'bytes',
      availability: 'observed',
      reason: null,
    }),
    '1.0 KB',
  );

  assert.equal(
    formatBytesMetric({
      value: null,
      unit: 'bytes',
      availability: 'unavailable',
      reason: 'No data',
    }),
    'Unknown (No data)',
  );

  assert.equal(
    formatBytesMetric({
      value: 0,
      unit: 'bytes',
      availability: 'unknown',
      reason: null,
    }),
    'Unknown',
  );
});

test('formatCountMetric formats valid counts and handles unknown states', () => {
  assert.equal(formatCountMetric(null), 'Unknown');

  assert.equal(
    formatCountMetric({
      value: 1234567,
      unit: 'count',
      availability: 'observed',
      reason: null,
    }),
    (1234567).toLocaleString(),
  );

  assert.equal(
    formatCountMetric({
      value: null,
      unit: 'count',
      availability: 'unavailable',
      reason: 'failed',
    }),
    'Unknown (failed)',
  );
});

test('formatMinutesMetric handles observed minutes and fallbacks', () => {
  assert.equal(formatMinutesMetric(null), 'Unknown');

  assert.equal(
    formatMinutesMetric({
      value: 42,
      unit: 'minutes',
      availability: 'observed',
      reason: null,
    }),
    '42 mins',
  );

  assert.equal(
    formatMinutesMetric({
      value: null,
      unit: 'minutes',
      availability: 'unknown',
      reason: 'pending',
    }),
    'Unknown (pending)',
  );
});

test('formatBytes correctly scales and formats byte counts', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(500), '500 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(1048576), '1.0 MB');
  assert.equal(formatBytes(1048576 * 1024), '1.0 GB');
  assert.equal(formatBytes(1048576 * 1024 * 1024), '1.0 TB');
});

test('formatTimestamp safely formats ISO strings to human-readable UTC', () => {
  assert.equal(formatTimestamp(null), 'Unknown');
  assert.equal(formatTimestamp(undefined), 'Unknown');

  // Valid UTC time
  assert.equal(
    formatTimestamp('2023-10-05T14:48:00.000Z'),
    '2023-10-05 14:48:00 UTC',
  );

  // Invalid string
  assert.equal(formatTimestamp('not-a-date'), 'not-a-date');
});

test('formatDuration calculates time correctly between ISO timestamps', () => {
  const start = '2023-10-05T14:48:00.000Z';
  const underSecond = '2023-10-05T14:48:00.500Z';
  const underMinute = '2023-10-05T14:48:45.000Z';
  const overMinute = '2023-10-05T14:50:15.000Z';

  assert.equal(formatDuration(start, underSecond), '500ms');
  assert.equal(formatDuration(start, underMinute), '45s');
  assert.equal(formatDuration(start, overMinute), '2m 15s');

  // Invalid values
  assert.equal(formatDuration('invalid', overMinute), 'Unknown');
  assert.equal(formatDuration(overMinute, start), 'Unknown'); // Negative time
});

test('getSeverityBadgeClass maps severities to primer badge variants', () => {
  assert.equal(getSeverityBadgeClass('high'), 'danger');
  assert.equal(getSeverityBadgeClass('medium'), 'attention');
  assert.equal(getSeverityBadgeClass('low'), 'accent');
  assert.equal(getSeverityBadgeClass('info'), 'secondary');
  assert.equal(getSeverityBadgeClass('unknown'), 'secondary'); // default
});

test('getDimensionStatusBadgeClass maps statuses to primer badge variants', () => {
  assert.equal(getDimensionStatusBadgeClass('review_required'), 'attention');
  assert.equal(getDimensionStatusBadgeClass('no_issue_observed'), 'success');
  assert.equal(getDimensionStatusBadgeClass('unknown'), 'secondary');
  assert.equal(getDimensionStatusBadgeClass('not_applicable'), 'default');
  assert.equal(getDimensionStatusBadgeClass('other'), 'secondary'); // default
});

test('getCollectorStatusBadgeClass maps statuses to primer badge variants', () => {
  assert.equal(getCollectorStatusBadgeClass('complete'), 'success');
  assert.equal(getCollectorStatusBadgeClass('partial'), 'attention');
  assert.equal(getCollectorStatusBadgeClass('failed'), 'danger');
  assert.equal(getCollectorStatusBadgeClass('skipped'), 'secondary');
  assert.equal(getCollectorStatusBadgeClass('unavailable'), 'secondary');
  assert.equal(getCollectorStatusBadgeClass('other'), 'secondary'); // default
});

test('resolveOrgName returns appropriate string for an organization ID', () => {
  // Dummy bundle stub
  const mockBundle = {
    organizations: [
      { id: 'org_1', login: 'github', displayName: 'GitHub Inc.' },
      { id: 'org_2', login: 'no-display' },
    ],
  } as unknown as DiscoveryBundle;

  assert.equal(resolveOrgName(mockBundle, 'org_1'), 'GitHub Inc. (github)');
  assert.equal(resolveOrgName(mockBundle, 'org_2'), 'no-display');
  assert.equal(resolveOrgName(mockBundle, 'org_missing'), 'org_missing');
});
