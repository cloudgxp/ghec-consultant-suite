import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  categorizeDiscrepancySeverity,
  formatValue,
  computeLineDiff,
  generateCliRemediationCommand,
  classifyReportDiscrepancies,
  computeVerificationStats,
  generateVerificationCsv,
  generateRemediationScopeJson,
  sampleCleanVerificationReport,
  sampleDiscrepantVerificationReport,
} from '../src/lib/verification-diff.js';

describe('Verification Diff & Remediation Engine (Task 043 / DASH-28)', () => {
  describe('categorizeDiscrepancySeverity', () => {
    it('assigns critical severity to ruleset bypass actor drift and missing protection', () => {
      const sev1 = categorizeDiscrepancySeverity('rulesets', {
        resourceName: 'Protected Branches',
        expected: { bypass_actors: ['Repository migrations'] },
        actual: { bypass_actors: [] },
        message: 'Ruleset missing required bypass actor',
      });
      assert.strictEqual(sev1, 'critical');

      const sev2 = categorizeDiscrepancySeverity('branch-protection', {
        resourceName: 'main',
        expected: true,
        actual: false,
        message: 'Branch protection missing on main',
      });
      assert.strictEqual(sev2, 'critical');
    });

    it('assigns critical severity to deploy keys with unexpected write access', () => {
      const sev = categorizeDiscrepancySeverity('deploy-keys', {
        resourceName: 'deploy-key-1',
        expected: { read_only: true },
        actual: { read_only: false },
        message: 'Deploy key has unexpected write access; read_only: false',
      });
      assert.strictEqual(sev, 'critical');
    });

    it('assigns high severity to missing LFS OIDs, missing collaborators, and unreclaimed mannequins', () => {
      const lfsSev = categorizeDiscrepancySeverity('lfs', {
        resourceName: 'weights.bin',
        expected: { oid: 'abc' },
        actual: null,
        message: 'Missing OID in target LFS storage',
      });
      assert.strictEqual(lfsSev, 'high');

      const colSev = categorizeDiscrepancySeverity('collaborators', {
        resourceName: 'octocat',
        expected: 'admin',
        actual: 'none',
        message: 'Missing direct admin collaborator grant',
      });
      assert.strictEqual(colSev, 'high');

      const manSev = categorizeDiscrepancySeverity('mannequins', {
        resourceName: 'contributor-1',
        expected: 'reclaimed',
        actual: 'unmapped',
        message: 'Unreclaimed mannequin user',
      });
      assert.strictEqual(manSev, 'high');
    });

    it('assigns low severity to minor description or timestamp differences', () => {
      const sev = categorizeDiscrepancySeverity('org-variables', {
        resourceName: 'APP_DESCRIPTION',
        expected: 'v1 description',
        actual: 'v2 description',
        message: 'Description drift detected',
      });
      assert.strictEqual(sev, 'low');
    });
  });

  describe('formatValue and computeLineDiff', () => {
    it('formats primitives and objects into formatted strings', () => {
      assert.strictEqual(formatValue(null), '<null>');
      assert.strictEqual(formatValue(undefined), '<undefined>');
      assert.strictEqual(formatValue(123), '123');
      assert.strictEqual(
        formatValue({ a: 1 }),
        JSON.stringify({ a: 1 }, null, 2),
      );
    });

    it('computes single-line and multi-line line diffs', () => {
      const singleDiff = computeLineDiff('alpha', 'beta');
      assert.deepStrictEqual(singleDiff, [
        { type: 'removed', text: 'alpha' },
        { type: 'added', text: 'beta' },
      ]);

      const sameDiff = computeLineDiff('gamma', 'gamma');
      assert.deepStrictEqual(sameDiff, [{ type: 'same', text: 'gamma' }]);

      const multiDiff = computeLineDiff('line1\nline2', 'line1\nlineModified');
      assert.strictEqual(multiDiff.length, 3);
      assert.strictEqual(multiDiff[0]?.type, 'same');
      assert.strictEqual(multiDiff[1]?.type, 'removed');
      assert.strictEqual(multiDiff[2]?.type, 'added');
    });
  });

  describe('generateCliRemediationCommand', () => {
    it('generates correct command and rationale for deploy-keys', () => {
      const { command, rationale } = generateCliRemediationCommand(
        'deploy-keys',
        {
          resourceName: 'ci-key',
          expected: {},
          actual: {},
          message: 'Key mismatch',
        },
      );
      assert.match(
        command,
        /ghec-consultant-cli migrate --scope scopes\/remediation-scope\.json --modules deploy-keys --force/,
      );
      assert.match(rationale, /deploy key \x27ci-key\x27/);
    });

    it('generates correct command for releases, LFS, rulesets, and mannequins', () => {
      const rel = generateCliRemediationCommand('releases', {
        resourceName: 'v1.0.0',
        expected: {},
        actual: {},
        message: 'Missing asset',
      });
      assert.match(rel.command, /--modules releases --retry-failed-assets/);

      const lfs = generateCliRemediationCommand('lfs', {
        resourceName: 'data.bin',
        expected: {},
        actual: {},
        message: 'Missing blob',
      });
      assert.match(lfs.command, /--modules lfs --verify-oids/);

      const rules = generateCliRemediationCommand('rulesets', {
        resourceName: 'Branch Rule',
        expected: {},
        actual: {},
        message: 'Bypass missing',
      });
      assert.match(rules.command, /--modules rulesets --overwrite-drift/);

      const man = generateCliRemediationCommand('mannequins', {
        resourceName: 'ghost-dev',
        expected: {},
        actual: {},
        message: 'Unmapped',
      });
      assert.match(man.command, /--modules mannequins --skip-invitation/);
    });
  });

  describe('classifyReportDiscrepancies & computeVerificationStats', () => {
    it('classifies clean report with zero discrepancies and 100% compliance', () => {
      const classified = classifyReportDiscrepancies(
        sampleCleanVerificationReport,
      );
      assert.strictEqual(classified.length, 0);

      const stats = computeVerificationStats(
        sampleCleanVerificationReport,
        classified,
      );
      assert.strictEqual(stats.verifiedModuleCount, 17);
      assert.strictEqual(stats.unverifiedModuleCount, 0);
      assert.strictEqual(stats.discrepancyCount, 0);
      assert.strictEqual(stats.compliancePercentage, 100);
    });

    it('classifies discrepant report with 6 discrepancies across 6 modules', () => {
      const classified = classifyReportDiscrepancies(
        sampleDiscrepantVerificationReport,
      );
      assert.strictEqual(classified.length, 6);

      const modulesWithDiscrepancies = classified.map((c) => c.moduleId);
      assert.ok(modulesWithDiscrepancies.includes('deploy-keys'));
      assert.ok(modulesWithDiscrepancies.includes('collaborators'));
      assert.ok(modulesWithDiscrepancies.includes('releases'));
      assert.ok(modulesWithDiscrepancies.includes('lfs'));
      assert.ok(modulesWithDiscrepancies.includes('rulesets'));
      assert.ok(modulesWithDiscrepancies.includes('mannequins'));

      const stats = computeVerificationStats(
        sampleDiscrepantVerificationReport,
        classified,
      );
      assert.strictEqual(stats.verifiedModuleCount, 11);
      assert.strictEqual(stats.unverifiedModuleCount, 6);
      assert.strictEqual(stats.discrepancyCount, 6);
      assert.ok(stats.criticalCount >= 2); // rulesets bypass & deploy-key write
      assert.ok(stats.compliancePercentage < 100);
    });
  });

  describe('generateVerificationCsv & generateRemediationScopeJson', () => {
    it('generates CSV audit text with proper columns and rows', () => {
      const classified = classifyReportDiscrepancies(
        sampleDiscrepantVerificationReport,
      );
      const csv = generateVerificationCsv(
        sampleDiscrepantVerificationReport,
        classified,
      );

      assert.ok(
        csv.startsWith(
          'Module,Resource Name,Severity,Discrepancy Message,Expected Value,Actual Value,Remediation Command',
        ),
      );
      assert.ok(csv.includes('deploy-keys'));
      assert.ok(csv.includes('frontend-service-ci-key'));
      assert.ok(csv.includes('npx ghec-consultant-cli migrate'));
    });

    it('generates targeted remediation scope JSON containing only affected modules', () => {
      const classified = classifyReportDiscrepancies(
        sampleDiscrepantVerificationReport,
      );
      const scope = generateRemediationScopeJson(
        sampleDiscrepantVerificationReport,
        classified,
      ) as unknown as {
        sourceOrganization: string;
        targetOrganization: string;
        discrepanciesCount: number;
        selectedModules: string[];
      };

      assert.strictEqual(scope.sourceOrganization, 'cloudgxp-source');
      assert.strictEqual(scope.targetOrganization, 'cloudgxp-target');
      assert.strictEqual(scope.discrepanciesCount, 6);
      assert.strictEqual(scope.selectedModules.length, 6);
      assert.ok(scope.selectedModules.includes('deploy-keys'));
      assert.ok(scope.selectedModules.includes('lfs'));
    });
  });
});
