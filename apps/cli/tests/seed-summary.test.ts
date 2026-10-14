import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  formatMarkdownSummary,
  appendGithubStepSummary,
} from '../src/commands/seeder/summary.js';
import type { SeedExecutionSummary } from '@ghec/contracts';

describe('Seed Summary & Auditability (US5)', () => {
  const sampleSummary: SeedExecutionSummary = {
    schemaVersion: '1.0.0',
    runId: 'seed-test-123',
    organization: 'octodemo',
    repository: 'ecommerce-repo',
    scopeLevel: 'both',
    contentType: 'core-governance',
    dryRun: false,
    cleanupExisting: false,
    startedAt: '2026-10-14T12:00:00.000Z',
    completedAt: '2026-10-14T12:00:04.500Z',
    totalDurationMs: 4500,
    counts: {
      total: 3,
      created: 2,
      updated: 1,
      skipped: 0,
      deleted: 0,
      failed: 0,
    },
    items: [
      {
        itemId: 'org-settings',
        itemName: 'Organization Settings',
        scope: 'organization',
        action: 'updated',
        durationMs: 320,
        resourceIdentifier: 'octodemo',
        details: 'Configured default repo permissions',
      },
      {
        itemId: 'teams',
        itemName: 'Nested Team Hierarchy',
        scope: 'organization',
        action: 'created',
        durationMs: 1400,
        resourceIdentifier: 'demo-engineering',
        details: 'Created parent and 2 child teams',
      },
      {
        itemId: 'gei-repo',
        itemName: 'Base Repository',
        scope: 'repository',
        action: 'created',
        durationMs: 850,
        resourceIdentifier: 'octodemo/ecommerce-repo',
        details: 'Initialized repo and merge strategies',
      },
    ],
    warnings: ['[ip-allow-lists] Enterprise plan required; skipped.'],
    errors: [],
  };

  it('formats comprehensive markdown summary table with parameters and metrics', () => {
    const md = formatMarkdownSummary(sampleSummary);

    assert.ok(md.includes('## 🚀 Synthetic Demo Content Seeding Report'));
    assert.ok(md.includes('| **Organization** | `octodemo` |'));
    assert.ok(md.includes('| **Repository** | `ecommerce-repo` |'));
    assert.ok(md.includes('| **Duration** | `4.50s` |'));
    assert.ok(md.includes('### 📊 Summary Metrics'));
    assert.ok(md.includes('| **3** | 2 | 1 | 0 | 0 | 0 |'));
    assert.ok(md.includes('### 📦 Detailed Item Breakdown'));
    assert.ok(md.includes('🟢 Created'));
    assert.ok(md.includes('🔵 Updated'));
    assert.ok(md.includes('### ⚠️ Warnings & Advisories'));
    assert.ok(md.includes('Enterprise plan required; skipped.'));
  });

  it('appends markdown summary to $GITHUB_STEP_SUMMARY when variable is present', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'seed-summary-test-'));
    const summaryFilePath = join(tmpDir, 'step-summary.md');
    process.env.GITHUB_STEP_SUMMARY = summaryFilePath;

    try {
      appendGithubStepSummary(sampleSummary);
      const content = readFileSync(summaryFilePath, 'utf8');
      assert.ok(
        content.includes('## 🚀 Synthetic Demo Content Seeding Report'),
      );
      assert.ok(content.includes('`octodemo`'));
    } finally {
      delete process.env.GITHUB_STEP_SUMMARY;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
