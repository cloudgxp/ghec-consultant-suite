import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { type MigrationScope, validatePreflightReport } from '@ghec/contracts';
import type { GitHubReadAdapter, ReadOperation } from '@ghec/github-client';
import {
  PreflightEvaluator,
  SourceRepositoryInspector,
  DestinationBlockerInspector,
  isRepositoryMigrationsExemptBypass,
  type GitHubRuleset,
  type GitSizingStats,
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

describe('Preflight Engine', () => {
  describe('isRepositoryMigrationsExemptBypass', () => {
    it('returns true when bypass actor is "Repository migrations" with mode "exempt"', () => {
      assert.equal(
        isRepositoryMigrationsExemptBypass({
          actor_type: 'Integration',
          actor_name: 'Repository migrations',
          bypass_mode: 'exempt',
        }),
        true,
      );

      assert.equal(
        isRepositoryMigrationsExemptBypass({
          actor_type: 'Repository migrations',
          bypass_mode: 'exempt',
        }),
        true,
      );
    });

    it('returns false when bypass mode is "always" or "always_allow" (DEC-012)', () => {
      assert.equal(
        isRepositoryMigrationsExemptBypass({
          actor_type: 'Integration',
          actor_name: 'Repository migrations',
          bypass_mode: 'always',
        }),
        false,
      );

      assert.equal(
        isRepositoryMigrationsExemptBypass({
          actor_type: 'Integration',
          actor_name: 'Repository migrations',
          bypass_mode: 'always_allow',
        }),
        false,
      );
    });

    it('returns false for other actors even in exempt mode', () => {
      assert.equal(
        isRepositoryMigrationsExemptBypass({
          actor_type: 'Team',
          actor_name: 'DevOps',
          bypass_mode: 'exempt',
        }),
        false,
      );
    });
  });

  describe('SourceRepositoryInspector', () => {
    it('classifies normal repository within all limits as "ready"', async () => {
      const adapter = createMockAdapter({
        async readSingle(op) {
          if (op.id === 'rest.repos.get') {
            return {
              data: { size: 1024 }, // 1 MiB
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
        async fetchAll() {
          return {
            items: [],
            observedAt: new Date().toISOString(),
            complete: true,
          };
        },
      });

      const inspector = new SourceRepositoryInspector({
        adapter,
        sourceOrg: 'octocat-inc',
      });

      const assessment = await inspector.inspect('demo-repo', {
        gitSizeBytes: 1024 * 1024,
        largestCommitBytes: 10000,
        largestBlobBytes: 50000,
        longestRefLength: 30,
      });

      assert.equal(assessment.repo, 'demo-repo');
      assert.equal(assessment.status, 'ready');
      assert.equal(assessment.blockers.length, 0);
    });

    it('classifies repository with LFS as "ready-with-follow-up"', async () => {
      const adapter = createMockAdapter({
        async readSingle(op) {
          if (op.id === 'rest.repos.get') {
            return {
              data: { size: 2048 },
              observedAt: new Date().toISOString(),
              status: 200,
            };
          }
          if (op.id === 'rest.repos.getContent') {
            return {
              data: {
                content: Buffer.from(
                  '*.psd filter=lfs diff=lfs merge=lfs -text\n',
                ).toString('base64'),
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
        async fetchAll() {
          return {
            items: [],
            observedAt: new Date().toISOString(),
            complete: true,
          };
        },
      });

      const inspector = new SourceRepositoryInspector({
        adapter,
        sourceOrg: 'octocat-inc',
      });

      const assessment = await inspector.inspect('design-assets');
      assert.equal(assessment.status, 'ready-with-follow-up');
      assert.equal(assessment.lfsObjectCount > 0, true);
      assert.match(assessment.blockers[0]!, /Git LFS/);
    });

    it('classifies repository with releases > 10 GiB as "requires-special-strategy"', async () => {
      const adapter = createMockAdapter({
        async readSingle() {
          return {
            data: { size: 1024 },
            observedAt: new Date().toISOString(),
            status: 200,
          };
        },
        async fetchAll(op) {
          if (op.id === 'rest.repos.getReleases') {
            return {
              items: [
                {
                  id: 1,
                  assets: [
                    { id: 101, size: 6 * 1024 * 1024 * 1024 }, // 6 GiB
                    { id: 102, size: 5 * 1024 * 1024 * 1024 }, // 5 GiB -> 11 GiB total
                  ],
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

      const inspector = new SourceRepositoryInspector({
        adapter,
        sourceOrg: 'octocat-inc',
      });

      const assessment = await inspector.inspect('heavy-releases');
      assert.equal(assessment.status, 'requires-special-strategy');
      assert.match(assessment.blockers[0]!, /--skip-releases/);
    });

    it('classifies repository exceeding 2 GiB commit limit as "blocked"', async () => {
      const adapter = createMockAdapter();
      const inspector = new SourceRepositoryInspector({
        adapter,
        sourceOrg: 'octocat-inc',
      });

      const assessment = await inspector.inspect('monstrous-commit', {
        gitSizeBytes: 10 * 1024 * 1024 * 1024,
        largestCommitBytes: 3 * 1024 * 1024 * 1024, // 3 GiB > 2 GiB limit
        largestBlobBytes: 100 * 1024 * 1024,
        longestRefLength: 40,
      });

      assert.equal(assessment.status, 'blocked');
      assert.equal(assessment.blockers.length >= 1, true);
      assert.match(assessment.blockers[0]!, /2 GiB/);
    });
  });

  describe('DestinationBlockerInspector', () => {
    it('passes when active rulesets have Repository migrations in Exempt mode', async () => {
      const adapter = createMockAdapter({
        async fetchAll(op) {
          if (op.id === 'rest.orgs.getRulesets') {
            const ruleset: GitHubRuleset = {
              id: 42,
              name: 'production-branch-protection',
              enforcement: 'active',
              bypass_actors: [
                {
                  actor_type: 'Integration',
                  actor_name: 'Repository migrations',
                  bypass_mode: 'exempt',
                },
              ],
            };
            return {
              items: [ruleset],
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
        async readSingle() {
          return {
            data: null,
            observedAt: new Date().toISOString(),
            status: 404,
          };
        },
      });

      const inspector = new DestinationBlockerInspector({
        adapter,
        targetOrg: 'enterprise-target',
        scopedRepos: ['repo-a'],
      });

      const destAssessment = await inspector.inspect();
      assert.equal(destAssessment.rulesetBypassConfigured, true);
      assert.equal(destAssessment.nameConflicts.length, 0);
    });

    it('fails when active ruleset has Repository migrations in always_allow mode', async () => {
      const adapter = createMockAdapter({
        async fetchAll(op) {
          if (op.id === 'rest.orgs.getRulesets') {
            const ruleset: GitHubRuleset = {
              id: 42,
              name: 'strict-ruleset',
              enforcement: 'active',
              bypass_actors: [
                {
                  actor_type: 'Integration',
                  actor_name: 'Repository migrations',
                  bypass_mode: 'always',
                },
              ],
            };
            return {
              items: [ruleset],
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

      const inspector = new DestinationBlockerInspector({
        adapter,
        targetOrg: 'enterprise-target',
        scopedRepos: ['repo-a'],
      });

      const destAssessment = await inspector.inspect();
      assert.equal(destAssessment.rulesetBypassConfigured, false);
      assert.equal(destAssessment.rulesetBypassIssues.length, 1);
      assert.match(destAssessment.rulesetBypassIssues[0]!, /Exempt mode/);
    });

    it('detects existing target repositories as name conflicts', async () => {
      const adapter = createMockAdapter({
        async readSingle(op) {
          if (op.id === 'rest.repos.get') {
            const params = op.pathParams as { repo?: string };
            if (params.repo === 'already-exists') {
              return {
                data: { id: 999 },
                observedAt: new Date().toISOString(),
                status: 200,
              };
            }
          }
          return {
            data: null,
            observedAt: new Date().toISOString(),
            status: 404,
          };
        },
        async fetchAll() {
          return {
            items: [],
            observedAt: new Date().toISOString(),
            complete: true,
          };
        },
      });

      const inspector = new DestinationBlockerInspector({
        adapter,
        targetOrg: 'enterprise-target',
        scopedRepos: ['already-exists', 'brand-new'],
      });

      const destAssessment = await inspector.inspect();
      assert.deepEqual(destAssessment.nameConflicts, ['already-exists']);
    });
  });

  describe('PreflightEvaluator (End-to-End)', () => {
    it('produces a fully valid MigrationPreflightReport classifying 4 tiers', async () => {
      const scope: MigrationScope = {
        version: '1.0.0',
        name: 'Wave 1 Migration',
        organizations: [{ source: 'legacy-org', target: 'modern-org' }],
        repositories: [
          {
            sourceOrg: 'legacy-org',
            sourceRepo: 'repo-ready',
            targetOrg: 'modern-org',
            targetRepo: 'repo-ready',
            useGei: true,
          },
          {
            sourceOrg: 'legacy-org',
            sourceRepo: 'repo-lfs',
            targetOrg: 'modern-org',
            targetRepo: 'repo-lfs',
            useGei: true,
          },
          {
            sourceOrg: 'legacy-org',
            sourceRepo: 'repo-releases',
            targetOrg: 'modern-org',
            targetRepo: 'repo-releases',
            useGei: true,
          },
          {
            sourceOrg: 'legacy-org',
            sourceRepo: 'repo-huge-blob',
            targetOrg: 'modern-org',
            targetRepo: 'repo-huge-blob',
            useGei: true,
          },
        ],
      };

      const sizerMetricsMap = new Map<string, GitSizingStats>([
        [
          'repo-ready',
          {
            gitSizeBytes: 10 * 1024 * 1024,
            largestCommitBytes: 1024 * 1024,
            largestBlobBytes: 5 * 1024 * 1024,
            longestRefLength: 20,
          },
        ],
        [
          'repo-lfs',
          {
            gitSizeBytes: 50 * 1024 * 1024,
            largestCommitBytes: 2 * 1024 * 1024,
            largestBlobBytes: 10 * 1024 * 1024,
            longestRefLength: 25,
          },
        ],
        [
          'repo-releases',
          {
            gitSizeBytes: 20 * 1024 * 1024,
            largestCommitBytes: 1024 * 1024,
            largestBlobBytes: 5 * 1024 * 1024,
            longestRefLength: 20,
          },
        ],
        [
          'repo-huge-blob',
          {
            gitSizeBytes: 1024 * 1024 * 1024,
            largestCommitBytes: 50 * 1024 * 1024,
            largestBlobBytes: 500 * 1024 * 1024, // 500 MiB > 400 MiB limit
            longestRefLength: 30,
          },
        ],
      ]);

      const sourceAdapter = createMockAdapter({
        async readSingle(op) {
          if (op.id === 'rest.repos.getContent') {
            const params = op.pathParams as { repo?: string };
            if (params.repo === 'repo-lfs') {
              return {
                data: {
                  content: Buffer.from(
                    '*.bin filter=lfs diff=lfs merge=lfs\n',
                  ).toString('base64'),
                },
                observedAt: new Date().toISOString(),
                status: 200,
              };
            }
          }
          return {
            data: { size: 1024 },
            observedAt: new Date().toISOString(),
            status: 200,
          };
        },
        async fetchAll(op) {
          if (op.id === 'rest.repos.getReleases') {
            const params = op.pathParams as { repo?: string };
            if (params.repo === 'repo-releases') {
              return {
                items: [
                  {
                    id: 1,
                    assets: [{ id: 1, size: 12 * 1024 * 1024 * 1024 }], // 12 GiB
                  },
                ],
                observedAt: new Date().toISOString(),
                complete: true,
              };
            }
          }
          return {
            items: [],
            observedAt: new Date().toISOString(),
            complete: true,
          };
        },
      });

      const targetAdapter = createMockAdapter({
        async readSingle(op) {
          if (op.id === 'rest.orgs.get') {
            return {
              data: { advanced_security_enabled_for_new_repositories: true },
              observedAt: new Date().toISOString(),
              status: 200,
            };
          }
          // Target repos do not exist
          return {
            data: null,
            observedAt: new Date().toISOString(),
            status: 404,
          };
        },
        async fetchAll(op) {
          if (op.id === 'rest.orgs.getRulesets') {
            return {
              items: [
                {
                  id: 1,
                  name: 'default',
                  enforcement: 'active',
                  bypass_actors: [
                    {
                      actor_type: 'Integration',
                      actor_name: 'Repository migrations',
                      bypass_mode: 'exempt',
                    },
                  ],
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

      const evaluator = new PreflightEvaluator({
        scope,
        sourceAdapter,
        targetAdapter,
        sizerMetricsMap,
      });

      const report = await evaluator.evaluate();

      // Ensure validatePreflightReport contract accepts it
      const validation = validatePreflightReport(report);
      assert.equal(validation.success, true);

      assert.equal(report.sourceOrg, 'legacy-org');
      assert.equal(report.targetOrg, 'modern-org');
      assert.equal(report.repositoryAssessments.length, 4);

      const statusMap = new Map(
        report.repositoryAssessments.map((a) => [a.repo, a.status]),
      );

      assert.equal(statusMap.get('repo-ready'), 'ready');
      assert.equal(statusMap.get('repo-lfs'), 'ready-with-follow-up');
      assert.equal(statusMap.get('repo-releases'), 'requires-special-strategy');
      assert.equal(statusMap.get('repo-huge-blob'), 'blocked');

      // Check blockers invariant
      const readyRepo = report.repositoryAssessments.find(
        (a) => a.repo === 'repo-ready',
      );
      assert.equal(readyRepo?.blockers.length, 0);

      const blockedRepo = report.repositoryAssessments.find(
        (a) => a.repo === 'repo-huge-blob',
      );
      assert.ok(blockedRepo);
      assert.equal(blockedRepo.blockers.length >= 1, true);
    });

    it('blocks all repositories if destination ruleset bypass is missing or not exempt', async () => {
      const scope: MigrationScope = {
        version: '1.0.0',
        name: 'Ruleset Blocked Scope',
        organizations: [{ source: 'legacy-org', target: 'modern-org' }],
        repositories: [
          {
            sourceOrg: 'legacy-org',
            sourceRepo: 'healthy-repo',
            targetOrg: 'modern-org',
            targetRepo: 'healthy-repo',
            useGei: true,
          },
        ],
      };

      const sourceAdapter = createMockAdapter({
        async readSingle() {
          return {
            data: { size: 1024 },
            observedAt: new Date().toISOString(),
            status: 200,
          };
        },
        async fetchAll() {
          return {
            items: [],
            observedAt: new Date().toISOString(),
            complete: true,
          };
        },
      });

      // Destination ruleset lacks exempt bypass
      const targetAdapter = createMockAdapter({
        async readSingle() {
          return {
            data: null,
            observedAt: new Date().toISOString(),
            status: 404,
          };
        },
        async fetchAll(op) {
          if (op.id === 'rest.orgs.getRulesets') {
            return {
              items: [
                {
                  id: 1,
                  name: 'strict-governance',
                  enforcement: 'active',
                  bypass_actors: [], // No bypass configured
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

      const evaluator = new PreflightEvaluator({
        scope,
        sourceAdapter,
        targetAdapter,
      });

      const report = await evaluator.evaluate();
      assert.equal(validatePreflightReport(report).success, true);
      assert.equal(
        report.destinationAssessments[0]!.rulesetBypassConfigured,
        false,
      );
      assert.equal(report.repositoryAssessments[0]!.status, 'blocked');
      assert.match(
        report.repositoryAssessments[0]!.blockers[0]!,
        /Exempt mode/,
      );
    });
  });
});
