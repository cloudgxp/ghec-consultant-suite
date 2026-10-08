import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_MODULES,
  aggregateOperationsBreakdown,
  parseStepSummaryMarkdown,
  sanitizeDiagnostics,
} from '../src/lib/step-summary.js';

describe('Task 041 (DASH-26): Step Summary & Artifact Report Viewer', () => {
  describe('Canonical Modules Registry', () => {
    it('defines the expected total modules across all three scopes', () => {
      assert.equal(CANONICAL_MODULES.length, 23);

      const orgModules = CANONICAL_MODULES.filter(
        (m) => m.category === 'organization',
      );
      const repoModules = CANONICAL_MODULES.filter(
        (m) => m.category === 'repository',
      );
      const postModules = CANONICAL_MODULES.filter(
        (m) => m.category === 'post-migration',
      );

      assert.equal(orgModules.length, 6);
      assert.equal(repoModules.length, 14);
      assert.equal(postModules.length, 3);

      const moduleIds = CANONICAL_MODULES.map((m) => m.id);
      assert.ok(moduleIds.includes('org-variables'));
      assert.ok(moduleIds.includes('org-secrets'));
      assert.ok(moduleIds.includes('teams'));
      assert.ok(moduleIds.includes('gei-repo'));
      assert.ok(moduleIds.includes('rulesets'));
      assert.ok(moduleIds.includes('issues'));
      assert.ok(moduleIds.includes('pull-requests'));
      assert.ok(moduleIds.includes('post-migration-mannequins'));
    });
  });

  describe('Zero-Secret Diagnostic Sanitization', () => {
    it('redacts classic personal access tokens (ghp_)', () => {
      const msg =
        'Failed to clone repository with token ghp_123456789012345678901234567890123456 from origin';
      const sanitized = sanitizeDiagnostics(msg);
      assert.ok(!sanitized.includes('ghp_'));
      assert.ok(sanitized.includes('[REDACTED_SECRET]'));
    });

    it('redacts fine-grained personal access tokens (github_pat_)', () => {
      const fakePat =
        'github_pat_11AAAAAAA0000000000000_12345678901234567890123456789012345678901234567890123456789012';
      const msg = `Authentication rejected: ${fakePat}`;
      const sanitized = sanitizeDiagnostics(msg);
      assert.ok(!sanitized.includes('github_pat_'));
      assert.ok(sanitized.includes('[REDACTED_SECRET]'));
    });

    it('redacts Bearer authorization headers', () => {
      const msg =
        'HTTP 401 Unauthorized for header Authorization: Bearer secret-oauth-token-val';
      const sanitized = sanitizeDiagnostics(msg);
      assert.ok(!sanitized.includes('secret-oauth-token-val'));
      assert.ok(sanitized.includes('[REDACTED_SECRET]'));
    });

    it('preserves clean diagnostic messages without tokens', () => {
      const clean =
        'Ruleset "Production Protection" already exists on destination repository.';
      assert.equal(sanitizeDiagnostics(clean), clean);
    });
  });

  describe('Step Summary Markdown Parsing', () => {
    const SAMPLE_MD = `## 🚀 Migration Wave Execution Summary

### Overview
| Metric | Value |
| :--- | :--- |
| **Run ID** | \`9948271\` |
| **Overall Status** | 🟢 **Complete** |
| **Mode** | 🧪 Dry-Run (Simulation) |
| **Source Organization** | \`source-enterprise\` |
| **Target Organization** | \`target-enterprise\` |
| **Duration** | 121.50s |
| **Started At** | \`2126-10-06T10:00:00.000Z\` |
| **Completed At** | \`2126-10-06T10:02:00.500Z\` |

> [!WARNING]
> **Operational Warnings (1):**
> - Rate limit approaching 80% on destination API

> [!CAUTION]
> **Errors Encountered (1):**
> - Failed to reconcile deploy key: ghp_111111111111111111111111111111111111
`;

    it('extracts metadata key-value pairs accurately from markdown table', () => {
      const parsed = parseStepSummaryMarkdown(SAMPLE_MD);
      assert.equal(parsed.title, '🚀 Migration Wave Execution Summary');
      assert.equal(parsed.runId, '9948271');
      assert.equal(parsed.overallStatus, '🟢 **Complete**');
      assert.equal(parsed.mode, '🧪 Dry-Run (Simulation)');
      assert.equal(parsed.sourceOrg, 'source-enterprise');
      assert.equal(parsed.targetOrg, 'target-enterprise');
      assert.equal(parsed.duration, '121.50s');
    });

    it('parses GitHub-style alert callouts with categories and bullet items', () => {
      const parsed = parseStepSummaryMarkdown(SAMPLE_MD);
      assert.equal(parsed.alerts.length, 2);

      const warningAlert = parsed.alerts.find((a) => a.type === 'warning');
      assert.ok(warningAlert);
      assert.equal(warningAlert?.title, 'Operational Warnings (1):');
      assert.equal(warningAlert?.items.length, 1);
      assert.ok(warningAlert?.items[0]?.includes('Rate limit approaching'));

      const cautionAlert = parsed.alerts.find((a) => a.type === 'caution');
      assert.ok(cautionAlert);
      assert.equal(cautionAlert?.title, 'Errors Encountered (1):');
    });
  });

  describe('Operations Breakdown Aggregation', () => {
    it('aggregates creates, updates, and noops across multiple cohorts', () => {
      const reports = {
        cohorts: [
          {
            id: 'cohort-1',
            modules: {
              'repo-variables': {
                creates: 5,
                updates: 2,
                noops: 10,
                skips: 0,
                failures: 0,
              },
              rulesets: {
                creates: 2,
                updates: 0,
                noops: 4,
                skips: 0,
                failures: 0,
              },
            },
          },
          {
            id: 'cohort-2',
            modules: {
              'repo-variables': {
                creates: 3,
                updates: 1,
                noops: 5,
                skips: 0,
                failures: 1,
                errors: ['Rate limit reached'],
              },
              rulesets: {
                creates: 1,
                updates: 2,
                noops: 0,
                skips: 0,
                failures: 0,
              },
            },
          },
        ],
      };

      const breakdown = aggregateOperationsBreakdown(reports);
      const varMod = breakdown.find((m) => m.moduleId === 'repo-variables');
      assert.ok(varMod);
      assert.equal(varMod?.creates, 8);
      assert.equal(varMod?.updates, 3);
      assert.equal(varMod?.noops, 15);
      assert.equal(varMod?.failures, 1);
      assert.equal(varMod?.status, 'failed');
      assert.equal(varMod?.errors?.length, 1);

      const rulesetMod = breakdown.find((m) => m.moduleId === 'rulesets');
      assert.ok(rulesetMod);
      assert.equal(rulesetMod?.creates, 3);
      assert.equal(rulesetMod?.updates, 2);
      assert.equal(rulesetMod?.status, 'completed');
    });

    it('incorporates post-migration verification discrepancies into failure count', () => {
      const reports = {
        verification: {
          discrepancies: [
            {
              module: 'teams',
              message: 'Team "core-devs" missing 1 expected member on target.',
            },
          ],
        },
        cohorts: [
          {
            id: 'cohort-1',
            modules: {
              teams: {
                creates: 2,
                updates: 0,
                noops: 0,
                skips: 0,
                failures: 0,
              },
            },
          },
        ],
      };

      const breakdown = aggregateOperationsBreakdown(reports);
      const teamsMod = breakdown.find((m) => m.moduleId === 'teams');
      assert.ok(teamsMod);
      assert.equal(teamsMod?.failures, 1);
      assert.equal(teamsMod?.status, 'failed');
      assert.ok(teamsMod?.errors?.[0]?.includes('Team "core-devs" missing'));
    });
  });
});
