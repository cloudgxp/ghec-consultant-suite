import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GitHubReadAdapter, ReadOperation } from '@ghec/github-client';
import type { TargetWriteClient, TargetWriteOperation } from '@ghec/migration';
import {
  parsePublishResultsOptions,
  executePublishResultsCommand,
} from '../src/commands/publish-results.js';
import { runCli } from '../src/index.js';

describe('TASK-035: CLI Publish Results Command and Workflow Integration', () => {
  it('parses publish-results CLI arguments with accurate defaults', () => {
    const parsed = parsePublishResultsOptions([
      '--execution-report',
      './scans/execution.json',
      '--verification-report',
      './scans/verification.json',
      '--target-org',
      'dest-org',
      '--dry-run',
    ]);

    assert.equal(parsed.executionReportPath, './scans/execution.json');
    assert.equal(parsed.verificationReportPath, './scans/verification.json');
    assert.equal(parsed.targetOrg, 'dest-org');
    assert.equal(parsed.repoName, 'migration-audit-results');
    assert.equal(parsed.outputDir, './scans/results-repo');
    assert.equal(parsed.dryRun, true);
    assert.equal(parsed.skipPush, false);
    assert.equal(parsed.branch, 'main');
  });

  it('generates files and publishes atomic commit via executePublishResultsCommand', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'pub-results-test-'));

    try {
      const scopePath = join(tmpDir, 'scope.json');
      const scope = {
        version: '1.0.0',
        name: 'test-scope',
        organizations: [
          {
            source: 'src-org',
            target: 'dest-org',
          },
        ],
        repositories: [
          {
            sourceOrg: 'src-org',
            sourceRepo: 'service-a',
            targetOrg: 'dest-org',
            targetRepo: 'service-a',
            useGei: true,
          },
          {
            sourceOrg: 'src-org',
            sourceRepo: 'service-b',
            targetOrg: 'dest-org',
            targetRepo: 'service-b',
            useGei: true,
          },
        ],
      };
      writeFileSync(scopePath, JSON.stringify(scope, null, 2), 'utf-8');

      const verificationPath = join(tmpDir, 'verification.json');
      const verification = {
        schemaVersion: '1.0.0',
        reportId: 'ver-001',
        verifiedAt: new Date().toISOString(),
        scopeName: 'test-scope',
        sourceOrg: 'src-org',
        targetOrg: 'dest-org',
        modules: [
          {
            moduleId: 'rulesets',
            verified: false,
            discrepancies: [
              {
                resourceName: 'service-b:ruleset',
                expected: 'exempt',
                actual: 'none',
                message: 'Bypass actor missing',
              },
            ],
          },
        ],
        summary: {
          verifiedModuleCount: 0,
          unverifiedModuleCount: 1,
          discrepancyCount: 1,
        },
      };
      writeFileSync(
        verificationPath,
        JSON.stringify(verification, null, 2),
        'utf-8',
      );

      const outDir = join(tmpDir, 'results-output');

      const mutations: TargetWriteOperation[] = [];
      const mockTargetClient: GitHubReadAdapter = {
        queryGraphQL: async () => {
          throw new Error('Not implemented');
        },
        readPage: async () => {
          throw new Error('Not implemented');
        },
        fetchAll: async () => {
          throw new Error('Not implemented');
        },
        readSingle: async <T>(op: ReadOperation) => {
          if (op.path === '/repos/{owner}/{repo}') {
            return {
              status: 200,
              observedAt: new Date().toISOString(),
              data: { name: 'gei-migration-results' } as unknown as T,
            };
          }
          if (op.path === '/repos/{owner}/{repo}/git/ref/heads/{branch}') {
            return {
              status: 200,
              observedAt: new Date().toISOString(),
              data: { object: { sha: 'existing-sha' } } as unknown as T,
            };
          }
          throw new Error(`Unexpected read path: ${op.path}`);
        },
      };

      const mockTargetWriteClient: TargetWriteClient = {
        mutate: async <T>(operation: TargetWriteOperation) => {
          mutations.push(operation);
          if (operation.path === '/repos/{owner}/{repo}/git/blobs') {
            return { status: 201, data: { sha: 'blob-1' } as unknown as T };
          }
          if (operation.path === '/repos/{owner}/{repo}/git/trees') {
            return { status: 201, data: { sha: 'tree-1' } as unknown as T };
          }
          if (operation.path === '/repos/{owner}/{repo}/git/commits') {
            return { status: 201, data: { sha: 'commit-1' } as unknown as T };
          }
          if (
            operation.path === '/repos/{owner}/{repo}/git/refs/heads/{branch}'
          ) {
            return { status: 200, data: {} as unknown as T };
          }
          throw new Error(`Unexpected write path: ${operation.path}`);
        },
      };

      const options = parsePublishResultsOptions([
        '--scope',
        scopePath,
        '--verification-report',
        verificationPath,
        '--output-dir',
        outDir,
      ]);

      const result = await executePublishResultsCommand(options, {
        targetClient: mockTargetClient,
        targetWriteClient: mockTargetWriteClient,
      });

      assert.equal(result.results.manifest.summary.totalRepositories, 2);
      assert.equal(result.results.manifest.summary.succeededCount, 1);
      assert.equal(result.results.manifest.summary.failedCount, 1);
      assert.equal(result.results.manifest.summary.successRatePercent, 50);

      // Verify files written to disk
      assert.ok(existsSync(join(outDir, 'README.md')));
      assert.ok(existsSync(join(outDir, 'manifest.json')));
      assert.ok(existsSync(join(outDir, 'success/service-a.md')));
      assert.ok(existsSync(join(outDir, 'failure/service-b.md')));

      // Verify published commit
      assert.equal(result.publishResult?.commitSha, 'commit-1');
      assert.equal(mutations.length > 0, true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('runs cleanly via runCli dispatcher with --skip-push', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'pub-cli-test-'));

    try {
      const scopePath = join(tmpDir, 'scope.json');
      const scope = {
        version: '1.0.0',
        name: 'cli-test-scope',
        organizations: [
          {
            source: 'acme-source',
            target: 'acme-target-emu',
          },
        ],
        repositories: [
          {
            sourceOrg: 'acme-source',
            sourceRepo: 'docs',
            targetOrg: 'acme-target-emu',
            targetRepo: 'docs',
            useGei: true,
          },
        ],
      };
      writeFileSync(scopePath, JSON.stringify(scope, null, 2), 'utf-8');

      const outDir = join(tmpDir, 'cli-results');

      const exitCode = await runCli([
        'publish-results',
        '--scope',
        scopePath,
        '--output-dir',
        outDir,
        '--skip-push',
      ]);

      assert.equal(exitCode, 0);
      assert.ok(existsSync(join(outDir, 'README.md')));
      assert.ok(existsSync(join(outDir, 'manifest.json')));
      assert.ok(existsSync(join(outDir, 'success/docs.md')));

      const manifest = JSON.parse(
        readFileSync(join(outDir, 'manifest.json'), 'utf-8'),
      );
      assert.equal(manifest.summary.totalRepositories, 1);
      assert.equal(manifest.summary.succeededCount, 1);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('generates 3-tier organization and repository module detail pages from standalone --execution-report', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'pub-3tier-cli-'));

    try {
      const scopePath = join(tmpDir, 'scope.json');
      writeFileSync(
        scopePath,
        JSON.stringify(
          {
            version: '1.0.0',
            name: 'cli-3tier-scope',
            organizations: [{ source: 'acme-src', target: 'acme-tgt' }],
            repositories: [
              {
                sourceOrg: 'acme-src',
                sourceRepo: 'payments-api',
                targetOrg: 'acme-tgt',
                targetRepo: 'payments-api',
                useGei: true,
              },
            ],
          },
          null,
          2,
        ),
        'utf-8',
      );

      const executionPath = join(tmpDir, 'migration-execution.json');
      writeFileSync(
        executionPath,
        JSON.stringify(
          {
            schemaVersion: '1.0.0',
            planId: 'plan-cli-3tier',
            executedAt: '2026-10-08T12:00:00Z',
            status: 'complete',
            exitCode: 0,
            dryRun: false,
            results: [
              {
                schemaVersion: '1.0.0',
                moduleId: 'org-custom-properties',
                targetIdentifier: 'org:acme-src',
                scopeLevel: 'organization',
                status: 'complete',
                results: [
                  {
                    operationId: 'prop-1',
                    status: 'succeeded',
                    resourceType: 'custom-property',
                    resourceName: 'cost_center',
                    operationType: 'create',
                    reason: 'Create custom property cost_center',
                    completedAt: '2026-10-08T12:00:01Z',
                  },
                ],
                durationMs: 300,
              },
              {
                schemaVersion: '1.0.0',
                moduleId: 'environments',
                targetIdentifier: 'acme-src/payments-api',
                scopeLevel: 'repository',
                status: 'complete',
                results: [
                  {
                    operationId: 'env-prod',
                    status: 'succeeded',
                    resourceType: 'environment',
                    resourceName: 'production',
                    operationType: 'create',
                    reason: 'Create production environment',
                    completedAt: '2026-10-08T12:00:02Z',
                  },
                ],
                durationMs: 450,
              },
            ],
          },
          null,
          2,
        ),
        'utf-8',
      );

      const outDir = join(tmpDir, 'results-3tier');
      const exitCode = await runCli([
        'publish-results',
        '--scope',
        scopePath,
        '--execution-report',
        executionPath,
        '--output-dir',
        outDir,
        '--skip-push',
      ]);

      assert.equal(exitCode, 0);
      assert.ok(existsSync(join(outDir, 'README.md')));
      assert.ok(existsSync(join(outDir, 'manifest.json')));
      assert.ok(
        existsSync(join(outDir, 'organization/org-custom-properties.md')),
      );
      assert.ok(existsSync(join(outDir, 'success/payments-api.md')));
      assert.ok(
        existsSync(join(outDir, 'repositories/payments-api/environments.md')),
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('rewrites relative links to full GitHub blob URLs when --append-step-summary is used', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'pub-step-summary-'));
    const prevStepSummary = process.env['GITHUB_STEP_SUMMARY'];
    const stepSummaryPath = join(tmpDir, 'step-summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = stepSummaryPath;

    try {
      const scopePath = join(tmpDir, 'scope.json');
      writeFileSync(
        scopePath,
        JSON.stringify(
          {
            version: '1.0.0',
            name: 'step-summary-scope',
            organizations: [{ source: 'demogxp', target: 'demogxp-mig4' }],
            repositories: [
              {
                sourceOrg: 'demogxp',
                sourceRepo: 'release-heavy-benchmark',
                targetOrg: 'demogxp-mig4',
                targetRepo: 'release-heavy-benchmark',
                useGei: true,
              },
            ],
          },
          null,
          2,
        ),
        'utf-8',
      );

      const outDir = join(tmpDir, 'results-step-summary');
      const exitCode = await runCli([
        'publish-results',
        '--scope',
        scopePath,
        '--output-dir',
        outDir,
        '--skip-push',
        '--append-step-summary',
      ]);

      assert.equal(exitCode, 0);
      const stepSummaryMd = readFileSync(stepSummaryPath, 'utf-8');
      assert.ok(
        stepSummaryMd.includes(
          '[View Log](https://github.com/demogxp-mig4/migration-audit-results/blob/main/success/release-heavy-benchmark.md)',
        ),
      );
      assert.ok(!stepSummaryMd.includes('](success/'));
    } finally {
      if (prevStepSummary === undefined) {
        delete process.env['GITHUB_STEP_SUMMARY'];
      } else {
        process.env['GITHUB_STEP_SUMMARY'] = prevStepSummary;
      }
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
