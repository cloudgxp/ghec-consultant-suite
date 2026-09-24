import { randomUUID } from 'node:crypto';
import type {
  DiscoveryBundle,
  CollectorExecution,
  Entity,
  ErrorSchema,
} from '@ghec/contracts';
import { collectors } from '../collectors/index.js';
import type {
  Collector,
  CollectorContext,
  DiscoveredState,
} from '../collectors/types.js';
import type { DiscoveryPlan } from '../commands/discover.js';
import type { CliConfig } from '../config/index.js';
import type { GitHubReadAdapter } from '../github/adapter.js';
import { HttpGitHubReadAdapter } from '../github/http.js';
import { publishBundle } from '../output/publisher.js';

export interface DiscoveryResult {
  readonly bundle: DiscoveryBundle;
  readonly filePath: string;
  readonly exitCode: 0 | 4;
}

export class DiscoveryOrchestrator {
  private readonly plan: DiscoveryPlan;
  private readonly config: CliConfig;
  private readonly adapter: GitHubReadAdapter;

  constructor(
    plan: DiscoveryPlan,
    config: CliConfig,
    customAdapter?: GitHubReadAdapter,
  ) {
    this.plan = plan;
    this.config = config;
    this.adapter =
      customAdapter ??
      new HttpGitHubReadAdapter({
        token: config.token,
        baseUrl: config.baseUrl,
        apiVersion: config.apiVersion,
      });
  }

  printDryRunPlan(): void {
    const estimatedRequests = this.plan.modules.length * 3;
    console.log(`================================================================
 GHEC CONSULTANT CLI — PREFLIGHT DISCOVERY PLAN
================================================================
Target Scope:       ${this.plan.scope.kind.toUpperCase()} "${this.plan.scope.name}"
Resolved Modules:   ${this.plan.modules.join(', ')}
Output Destination: ${this.plan.output}
Redaction Profile:  ${this.plan.redactionProfile}
Continue On Error:  ${this.plan.continueOnError}
Concurrency Limit:  2 concurrent requests
Estimated Requests: ≥ ${estimatedRequests} requests (initial discovery)
Credential Status:  ${this.config.token ? 'Present (GHEC_TOKEN detected)' : 'None (GHEC_TOKEN missing)'}

Execution DAG Order:
  1. [Anchor] orgs (rest.orgs.get)
  2. [Anchor] repos (rest.repos.list-for-org)
  3. [Children] ${this.plan.modules.filter((m) => !['orgs', 'repos'].includes(m)).join(', ')}

Verification Note:
  All capabilities will be executed with read-only operations.
  Dry-run preflight validated; no API requests sent and no output written.
================================================================`);
  }

  async run(signal: AbortSignal): Promise<DiscoveryResult> {
    if (
      !this.config.token &&
      !(this.adapter as unknown as { isMock?: boolean }).isMock
    ) {
      throw new Error(
        'GHEC_TOKEN environment variable is required for live collection.',
      );
    }

    const runId = randomUUID().replace(/-/g, '').slice(0, 12);
    const startedAt = new Date().toISOString();
    const collectorMap = new Map<string, Collector>(
      collectors.map((c) => [c.id, c]),
    );

    const allExecutions: CollectorExecution[] = [];
    const allEntities: Entity[] = [];
    let organizations: DiscoveryBundle['organizations'] = [];
    const sharedState: {
      repositories: Extract<Entity, { kind: 'repository' }>[];
      teams: Extract<Entity, { kind: 'team' }>[];
    } = {
      repositories: [],
      teams: [],
    };

    const orgId = this.plan.scope.name;
    const errors: (typeof ErrorSchema)['_type'][] = [];

    // Helper to run a single collector safely
    const executeCollector = async (
      moduleId: (typeof collectors)[number]['id'],
    ) => {
      if (signal.aborted) {
        throw signal.reason ?? new Error('Aborted');
      }

      const collector = collectorMap.get(moduleId);
      if (!collector) return;

      const executionId = `exec:${orgId}:${moduleId}:${runId}`;
      const context: CollectorContext = {
        organizationId: orgId,
        executionId,
        adapter: this.adapter,
        signal,
        configuration: {
          modules: this.plan.modules,
          format: 'json',
          includeSensitiveMetadata: this.plan.includeSensitiveMetadata,
          redactionProfile: this.plan.redactionProfile,
          continueOnError: this.plan.continueOnError,
        },
        sharedState: sharedState as DiscoveredState,
      };

      try {
        const result = await collector.collect(context);
        allExecutions.push(result.execution);
        allEntities.push(...result.entities);
        if (result.organizations.length > 0) {
          organizations = result.organizations;
        }
        if (moduleId === 'repos') {
          sharedState.repositories = result.entities.filter(
            (e): e is Extract<Entity, { kind: 'repository' }> =>
              e.kind === 'repository',
          );
        }
        if (moduleId === 'teams') {
          sharedState.teams = result.entities.filter(
            (e): e is Extract<Entity, { kind: 'team' }> => e.kind === 'team',
          );
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errorRecord: (typeof ErrorSchema)['_type'] = {
          code: 'unknown',
          message: `Collector ${moduleId} failed: ${errorMsg}`,
          retryable: false,
        };
        errors.push(errorRecord);

        const now = new Date().toISOString();
        allExecutions.push({
          id: executionId,
          module: moduleId,
          organizationId: orgId,
          status: 'failed',
          startedAt: now,
          completedAt: now,
          provenance: [
            {
              source: 'rest',
              operation: `rest.${moduleId}.failed`,
              observedAt: now,
              apiVersion: '2026-03-10',
            },
          ],
          warnings: [],
          errors: [errorRecord],
          coverage: {
            state: 'none',
            observed: 0,
            expected: null,
            reason: `Collector execution failed: ${errorMsg}`,
          },
        });

        if (!this.plan.continueOnError) {
          throw err;
        }
      }
    };

    // 1. Run Organization Anchor first
    await executeCollector('orgs');

    // If org anchor didn't populate organizations, provide fallback matching orgId
    if (organizations.length === 0) {
      organizations = [{ id: orgId, login: orgId, displayName: null }];
    }

    // 2. Run Repositories Anchor second (if selected)
    if (this.plan.modules.includes('repos')) {
      await executeCollector('repos');
    }

    // 3. Run Remaining Selected Collectors with concurrency limit 2
    const remainingModules = this.plan.modules.filter(
      (m) => m !== 'orgs' && m !== 'repos',
    );

    const concurrencyLimit = 2;
    for (let i = 0; i < remainingModules.length; i += concurrencyLimit) {
      const batch = remainingModules.slice(i, i + concurrencyLimit);
      await Promise.all(batch.map((mod) => executeCollector(mod)));
    }

    const completedAt = new Date().toISOString();
    const completeCount = allExecutions.filter(
      (e) => e.status === 'complete',
    ).length;
    const incompleteCount = allExecutions.length - completeCount;
    const isComplete = incompleteCount === 0 && errors.length === 0;

    const bundle: DiscoveryBundle = {
      schemaVersion: '1.0.0',
      synthetic: false,
      scan: {
        id: runId,
        startedAt,
        completedAt,
        producer: 'ghec-consultant-cli',
        producerVersion: '0.1.0',
        status: isComplete ? 'complete' : 'partial',
      },
      configuration: {
        modules: this.plan.modules,
        format: 'json',
        includeSensitiveMetadata: this.plan.includeSensitiveMetadata,
        redactionProfile: this.plan.redactionProfile,
        continueOnError: this.plan.continueOnError,
      },
      scope:
        this.plan.scope.kind === 'organization'
          ? { kind: 'organization', organizationId: orgId }
          : {
              kind: 'enterprise',
              slug: this.plan.scope.name,
              enumeration: 'complete',
              inaccessibleOrganizationCount: null,
            },
      organizations,
      collectors: allExecutions,
      entities: allEntities,
      findings: [],
      limitations: [],
      errors,
      summary: {
        organizationCount: organizations.length,
        repositoryCount: sharedState.repositories.length,
        completeCollectorCount: completeCount,
        incompleteCollectorCount: incompleteCount,
      },
    };

    const filePath = publishBundle(bundle, {
      outputPath: this.plan.output,
      scopeKind: this.plan.scope.kind,
      scopeName: this.plan.scope.name,
      runId,
      startedAt,
    });

    return {
      bundle,
      filePath,
      exitCode: isComplete ? 0 : 4,
    };
  }
}
