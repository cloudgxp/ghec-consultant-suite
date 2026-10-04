import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DiscoveryBundle } from '@ghec/contracts';
import type { GitHubReadAdapter, ReadOperation } from '@ghec/github-client';
import {
  MigrationAdvisoryPlanner,
  GitHubAppsAdvisoryPlanner,
  PackagesCutoverPlanner,
  SelfHostedRunnersPlanner,
  UnsupportedItemsAuditor,
  sanitizeCsvCell,
} from '../../src/index.js';

interface MockHttpHandler {
  readSingle?: (operation: ReadOperation) => Promise<{
    data: unknown;
    observedAt: string;
    status: number;
  }>;
  fetchAll?: (operation: ReadOperation) => Promise<{
    items: unknown[];
    observedAt: string;
    complete: boolean;
  }>;
}

function createMockAdapter(handler: MockHttpHandler = {}): GitHubReadAdapter {
  return {
    async queryGraphQL() {
      return { data: {} as never, observedAt: new Date().toISOString() };
    },
    async readPage() {
      return {
        items: [],
        nextCursor: null,
        observedAt: new Date().toISOString(),
        remainingRequests: 5000,
        resetAt: null,
        status: 200,
      };
    },
    async readSingle(operation: ReadOperation) {
      if (handler.readSingle) {
        return (await handler.readSingle(operation)) as never;
      }
      return {
        data: {} as never,
        observedAt: new Date().toISOString(),
        status: 200,
      };
    },
    async fetchAll(operation: ReadOperation) {
      if (handler.fetchAll) {
        return (await handler.fetchAll(operation)) as never;
      }
      return {
        items: [],
        observedAt: new Date().toISOString(),
        complete: true,
      };
    },
  };
}

describe('Migration Advisory & Non-Migrated Items Planner', () => {
  describe('sanitizeCsvCell', () => {
    it('neutralizes formula injection characters', () => {
      assert.equal(sanitizeCsvCell('=1+2'), "'=1+2");
      assert.equal(sanitizeCsvCell('+1+2'), "'+1+2");
      assert.equal(sanitizeCsvCell('-5*10'), "'-5*10");
      assert.equal(sanitizeCsvCell('@SUM(A1:B2)'), "'@SUM(A1:B2)");
      assert.equal(sanitizeCsvCell('\tCMD'), "'\tCMD");
    });

    it('quotes and escapes fields with commas and double quotes', () => {
      assert.equal(sanitizeCsvCell('normal text'), 'normal text');
      assert.equal(sanitizeCsvCell('hello, world'), '"hello, world"');
      assert.equal(sanitizeCsvCell('say "hello" now'), '"say ""hello"" now"');
    });

    it('handles null and undefined safely', () => {
      assert.equal(sanitizeCsvCell(null), '');
      assert.equal(sanitizeCsvCell(undefined), '');
    });
  });

  describe('GitHubAppsAdvisoryPlanner', () => {
    it('discovers installed GitHub Apps and emits sanitized CSV', async () => {
      const adapter = createMockAdapter({
        async readSingle(op) {
          if (op.id === 'rest.apps.listInstallations') {
            return {
              data: {
                total_count: 2,
                installations: [
                  {
                    id: 101,
                    app_id: 1001,
                    app_slug: 'sonarcloud',
                    target_type: 'Organization',
                    repository_selection: 'selected',
                    permissions: { issues: 'write', pull_requests: 'read' },
                    events: ['pull_request', 'push'],
                    html_url: 'https://github.com/apps/sonarcloud',
                  },
                  {
                    id: 102,
                    app_id: 1002,
                    app_slug: 'formula-app',
                    target_type: 'Organization',
                    repository_selection: 'all',
                    permissions: { contents: 'read' },
                    events: ['push'],
                    html_url: 'https://github.com/apps/formula-app',
                  },
                ],
              },
              observedAt: new Date().toISOString(),
              status: 200,
            };
          }
          return {
            data: null,
            observedAt: new Date().toISOString(),
            status: 404,
          };
        },
      });

      const planner = new GitHubAppsAdvisoryPlanner();
      const apps = await planner.discover('source-org', 'target-org', adapter);

      assert.equal(apps.length, 2);
      assert.equal(apps[0]?.slug, 'sonarcloud');
      assert.equal(
        apps[0]?.destinationInstallUrl,
        'https://github.com/apps/sonarcloud/installations/new',
      );

      const csv = planner.generateAppsMatrixCsv(apps);
      assert.match(csv, /App Name,App ID,App Slug,Target Type/);
      assert.match(csv, /sonarcloud,1001,sonarcloud/);
      assert.match(csv, /issues:write/);
    });
  });

  describe('PackagesCutoverPlanner', () => {
    it('discovers packages and generates cutover commands for all ecosystems', async () => {
      const adapter = createMockAdapter({
        async fetchAll(op) {
          if (op.id === 'rest.packages.listPackages_container') {
            return {
              items: [
                {
                  id: 1,
                  name: 'web-api-image',
                  package_type: 'container',
                  visibility: 'private',
                  version_count: 5,
                },
              ],
              observedAt: new Date().toISOString(),
              complete: true,
            };
          }
          if (op.id === 'rest.packages.listPackages_npm') {
            return {
              items: [
                {
                  id: 2,
                  name: 'core-sdk',
                  package_type: 'npm',
                  visibility: 'internal',
                  version_count: 12,
                },
              ],
              observedAt: new Date().toISOString(),
              complete: true,
            };
          }
          return {
            items: [],
            observedAt: new Date().toISOString(),
            complete: true,
          };
        },
      });

      const planner = new PackagesCutoverPlanner();
      const packages = await planner.discover(
        'source-org',
        'target-org',
        adapter,
      );

      assert.equal(packages.length, 2);
      const containerPkg = packages.find((p) => p.name === 'web-api-image');
      assert.ok(containerPkg);
      assert.match(
        containerPkg.cutoverCommands[0]!,
        /docker pull ghcr.io\/source-org\/web-api-image/,
      );
      assert.match(
        containerPkg.cutoverCommands[2]!,
        /docker push ghcr.io\/target-org\/web-api-image/,
      );

      const npmPkg = packages.find((p) => p.name === 'core-sdk');
      assert.ok(npmPkg);
      assert.match(
        npmPkg.cutoverCommands[1]!,
        /@target-org:registry=https:\/\/npm.pkg.github.com/,
      );

      const guideMd = planner.generatePackagesGuideMarkdown(
        packages,
        'source-org',
        'target-org',
      );
      assert.match(guideMd, /GitHub Packages Migration & Cutover Blueprint/);
      assert.match(guideMd, /web-api-image/);
      assert.match(guideMd, /core-sdk/);
    });
  });

  describe('SelfHostedRunnersPlanner', () => {
    it('discovers runner groups and runners, emitting registration spec', async () => {
      const adapter = createMockAdapter({
        async readSingle(op) {
          if (op.id === 'rest.actions.listRunnerGroupsForOrg') {
            return {
              data: {
                total_count: 1,
                runner_groups: [
                  { id: 7, name: 'gpu-builders', visibility: 'selected' },
                ],
              },
              observedAt: new Date().toISOString(),
              status: 200,
            };
          }
          if (op.id === 'rest.actions.listSelfHostedRunnersForOrg') {
            return {
              data: {
                total_count: 1,
                runners: [
                  {
                    id: 99,
                    name: 'gpu-node-01',
                    os: 'linux',
                    status: 'online',
                    busy: false,
                    runner_group_id: 7,
                    labels: [{ name: 'self-hosted' }, { name: 'gpu' }],
                  },
                ],
              },
              observedAt: new Date().toISOString(),
              status: 200,
            };
          }
          return {
            data: null,
            observedAt: new Date().toISOString(),
            status: 404,
          };
        },
      });

      const planner = new SelfHostedRunnersPlanner();
      const { runners, groups } = await planner.discover('source-org', adapter);

      assert.equal(groups.length, 1);
      assert.equal(groups[0]?.name, 'gpu-builders');

      assert.equal(runners.length, 1);
      assert.equal(runners[0]?.name, 'gpu-node-01');
      assert.equal(runners[0]?.runnerGroupName, 'gpu-builders');
      assert.deepEqual(runners[0]?.labels, ['self-hosted', 'gpu']);

      const specMd = planner.generateRunnerInfrastructureSpecMarkdown(
        runners,
        groups,
        'target-org',
      );
      assert.match(
        specMd,
        /Actions Self-Hosted Runner Infrastructure Specification/,
      );
      assert.match(specMd, /gpu-builders/);
      assert.match(specMd, /gpu-node-01/);
      assert.match(specMd, /registration-token/);
    });
  });

  describe('UnsupportedItemsAuditor', () => {
    it('audits non-migrated categories and detects severed fork relationships', async () => {
      const adapter = createMockAdapter({
        async fetchAll(op) {
          if (op.id === 'rest.repos.listOrgRepos') {
            return {
              items: [
                {
                  name: 'upstream-fork',
                  fork: true,
                  parent: { full_name: 'upstream-owner/upstream-fork' },
                },
                {
                  name: 'original-repo',
                  fork: false,
                },
              ],
              observedAt: new Date().toISOString(),
              complete: true,
            };
          }
          return {
            items: [],
            observedAt: new Date().toISOString(),
            complete: true,
          };
        },
      });

      const auditor = new UnsupportedItemsAuditor();
      const details = await auditor.audit('source-org', 'target-org', adapter);

      assert.equal(details.length, 8); // 8 non-migrated categories
      const forkAudit = details.find(
        (d) => d.category === 'fork_relationships',
      );
      assert.ok(forkAudit);
      assert.equal(forkAudit.impactedEntitiesCount, 1);
      assert.match(forkAudit.impactedEntities[0]!, /upstream-fork/);
      assert.match(forkAudit.limitationDescription, /severs all fork networks/);

      const markdown = auditor.generateUnsupportedAuditMarkdown(details);
      assert.match(markdown, /Fork Network Severance/);
      assert.match(markdown, /Repository Discussions/);
      assert.match(markdown, /Projects \(v2\) Experience/);
      assert.match(markdown, /Enterprise Audit Trail/);
    });
  });

  describe('MigrationAdvisoryPlanner (End-to-End)', () => {
    it('executes in offline mode using a DiscoveryBundle and writes artifacts to disk', async () => {
      const tempDir = join(tmpdir(), `advisory-test-${Date.now()}`);

      const mockBundle: DiscoveryBundle = {
        schemaVersion: '1.0.0',
        synthetic: false,
        scan: {
          id: 'scan-001',
          startedAt: '2026-10-04T10:00:00Z',
          completedAt: '2026-10-04T10:01:00Z',
          producer: 'ghec-consultant-cli',
          producerVersion: '1.0.0',
          status: 'complete',
        },
        configuration: {
          modules: ['repos', 'packages', 'integrations', 'actions'],
          format: 'json',
          includeSensitiveMetadata: false,
          redactionProfile: 'standard',
          continueOnError: false,
        },
        scope: {
          kind: 'organization',
          organizationId: 'source-org',
        },
        organizations: [
          {
            id: 'source-org',
            login: 'source-org',
            displayName: 'Source Org',
          },
        ],
        collectors: [
          {
            id: 'col-repos',
            module: 'repos',
            organizationId: 'source-org',
            status: 'complete',
            startedAt: '2026-10-04T10:00:00Z',
            completedAt: '2026-10-04T10:01:00Z',
            provenance: [
              {
                source: 'rest',
                operation: 'repos.list',
                observedAt: '2026-10-04T10:00:30Z',
                apiVersion: null,
              },
            ],
            warnings: [],
            errors: [],
            coverage: {
              state: 'complete',
              observed: 2,
              expected: 2,
              reason: null,
            },
          },
          {
            id: 'col-packages',
            module: 'packages',
            organizationId: 'source-org',
            status: 'complete',
            startedAt: '2026-10-04T10:00:00Z',
            completedAt: '2026-10-04T10:01:00Z',
            provenance: [
              {
                source: 'rest',
                operation: 'packages.list',
                observedAt: '2026-10-04T10:00:30Z',
                apiVersion: null,
              },
            ],
            warnings: [],
            errors: [],
            coverage: {
              state: 'complete',
              observed: 1,
              expected: 1,
              reason: null,
            },
          },
          {
            id: 'col-integrations',
            module: 'integrations',
            organizationId: 'source-org',
            status: 'complete',
            startedAt: '2026-10-04T10:00:00Z',
            completedAt: '2026-10-04T10:01:00Z',
            provenance: [
              {
                source: 'rest',
                operation: 'integrations.list',
                observedAt: '2026-10-04T10:00:30Z',
                apiVersion: null,
              },
            ],
            warnings: [],
            errors: [],
            coverage: {
              state: 'complete',
              observed: 1,
              expected: 1,
              reason: null,
            },
          },
          {
            id: 'col-actions',
            module: 'actions',
            organizationId: 'source-org',
            status: 'complete',
            startedAt: '2026-10-04T10:00:00Z',
            completedAt: '2026-10-04T10:01:00Z',
            provenance: [
              {
                source: 'rest',
                operation: 'actions.list',
                observedAt: '2026-10-04T10:00:30Z',
                apiVersion: null,
              },
            ],
            warnings: [],
            errors: [],
            coverage: {
              state: 'complete',
              observed: 1,
              expected: 1,
              reason: null,
            },
          },
        ],
        entities: [
          {
            id: 'repo-1',
            organizationId: 'source-org',
            collectorExecutionId: 'col-repos',
            provenance: {
              source: 'rest',
              operation: 'repos.list',
              observedAt: '2026-10-04T10:00:30Z',
              apiVersion: null,
            },
            kind: 'repository',
            name: 'forked-app',
            visibility: 'private',
            archived: false,
            defaultBranch: 'main',
            size: {
              value: 1048576,
              unit: 'bytes',
              availability: 'observed',
              reason: null,
            },
            fork: true,
          },
          {
            id: 'pkg-1',
            organizationId: 'source-org',
            collectorExecutionId: 'col-packages',
            provenance: {
              source: 'rest',
              operation: 'packages.list',
              observedAt: '2026-10-04T10:00:30Z',
              apiVersion: null,
            },
            kind: 'package',
            name: 'shared-library',
            ecosystem: 'npm',
            visibility: 'internal',
            owner: 'source-org',
            repositoryId: 'repo-1',
            versionCount: 4,
            size: {
              value: 204800,
              unit: 'bytes',
              availability: 'observed',
              reason: null,
            },
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-10-01T00:00:00Z',
            disposition: 'transfer',
          },
          {
            id: 'integ-1',
            organizationId: 'source-org',
            collectorExecutionId: 'col-integrations',
            provenance: {
              source: 'rest',
              operation: 'integrations.list',
              observedAt: '2026-10-04T10:00:30Z',
              apiVersion: null,
            },
            kind: 'integration',
            repositoryId: null,
            integrationKind: 'github_app',
            label: 'Jenkins CI',
            active: true,
          },
          {
            id: 'runner-1',
            organizationId: 'source-org',
            collectorExecutionId: 'col-actions',
            provenance: {
              source: 'rest',
              operation: 'actions.list',
              observedAt: '2026-10-04T10:00:30Z',
              apiVersion: null,
            },
            kind: 'action-runner',
            repositoryId: null,
            runnerGroupId: null,
            name: 'build-runner-01',
            runnerType: 'self-hosted',
            operatingSystem: 'linux',
            labels: ['self-hosted', 'linux', 'x64'],
            status: 'online',
            busy: false,
            customImage: false,
          },
        ],
        findings: [],
        limitations: [],
        errors: [],
        summary: {
          organizationCount: 1,
          repositoryCount: 1,
          completeCollectorCount: 4,
          incompleteCollectorCount: 0,
        },
      };

      try {
        const planner = new MigrationAdvisoryPlanner({
          sourceOrg: 'source-org',
          targetOrg: 'target-org',
          discoveryBundle: mockBundle,
        });

        const { report, artifacts } = await planner.generateReport();

        assert.equal(report.sourceOrg, 'source-org');
        assert.equal(report.targetOrg, 'target-org');
        assert.equal(report.summary.appCount, 1);
        assert.equal(report.summary.packageCount, 1);
        assert.equal(report.summary.runnerCount, 1);
        assert.equal(report.apps[0]?.name, 'Jenkins CI');
        assert.equal(report.packages[0]?.name, 'shared-library');
        assert.equal(report.runners.runners[0]?.name, 'build-runner-01');

        // Write to disk
        const { paths } = await planner.writeArtifacts(tempDir, artifacts);

        assert.ok(existsSync(paths.reportJson));
        assert.ok(existsSync(paths.reportMarkdown));
        assert.ok(existsSync(paths.appsMatrixCsv));
        assert.ok(existsSync(paths.packagesGuideMarkdown));
        assert.ok(existsSync(paths.runnerInfrastructureSpecMarkdown));

        const savedJson = JSON.parse(readFileSync(paths.reportJson, 'utf-8'));
        assert.equal(savedJson.reportVersion, '1.0.0');
        assert.equal(savedJson.summary.appCount, 1);
      } finally {
        if (existsSync(tempDir)) {
          rmSync(tempDir, { recursive: true, force: true });
        }
      }
    });
  });
});
