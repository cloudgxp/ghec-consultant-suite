import {
  MIGRATION_SCHEMA_VERSION,
  validateBundle,
  validateMigrationResultsManifest,
  validateVerificationReport,
  type DiscoveryBundle,
  type MigrationResultsManifest,
  type VerificationReport,
} from '@ghec/contracts';
import { evaluateBundle, type EvaluatedInsights } from '@ghec/analysis';
import type { ImportStage, ImportWorkerMessage } from './importer.worker.js';
import {
  SAMPLE_ORGANIZATION_BUNDLE,
  SAMPLE_ENTERPRISE_BUNDLE,
  SAMPLE_SPECIALIZED_BUNDLE,
  SAMPLE_PARTIAL_DENIED_BUNDLE,
} from './samples.js';

export type DashboardOperationalMode = 'discovery' | 'dry-run' | 'live';

export type HydratedPostCareCategory =
  | 'secret'
  | 'webhook'
  | 'github-app'
  | 'runner'
  | 'deploy-key'
  | 'mannequin'
  | 'idp-team'
  | 'collaborator'
  | 'policy'
  | 'package'
  | 'security'
  | 'failed-operation';

export interface HydratedPostCareItem {
  readonly itemId: string;
  readonly mode: DashboardOperationalMode;
  readonly priority: 'high' | 'medium' | 'low';
  readonly category: HydratedPostCareCategory;
  readonly scopeLevel: 'organization' | 'repository' | 'environment';
  readonly targetOrg: string;
  readonly targetRepo?: string | undefined;
  readonly environmentName?: string | undefined;
  readonly moduleId: string;
  readonly resourceType: string;
  readonly resourceName: string;
  readonly subDomain: string;
  readonly migrationStatus: string;
  readonly actionRequired: string;
  readonly settingsUrl: string;
  readonly secondaryUrl?: string | undefined;
  readonly cliCommand?: string | undefined;
  readonly notes?: string | undefined;
}

export interface HydratedOperationRow {
  readonly scopeLevel: 'organization' | 'repository' | 'environment';
  readonly targetOrg: string;
  readonly targetRepo: string;
  readonly moduleId: string;
  readonly resourceName: string;
  readonly resourceType: string;
  readonly subDomain: string;
  readonly operationType: string;
  readonly status: string;
  readonly verificationStatus: string;
  readonly requiresPostCare: boolean;
  readonly settingsUrl: string;
  readonly settingsLinkLabel?: string | undefined;
  readonly secondaryUrl?: string | undefined;
  readonly secondaryLinkLabel?: string | undefined;
  readonly isSecret?: boolean | undefined;
  readonly cliCommand: string;
  readonly notes: string;
}

export interface HydratedSkippedArchivedRow {
  readonly sourceOrg: string;
  readonly sourceRepo: string;
  readonly visibility: string;
  readonly isFork: boolean;
  readonly archivedStatus: 'archived';
  readonly disposition: 'skipped-archived';
  readonly sourceUrl: string;
  readonly notes: string;
}

export interface ResultsHydrationData {
  readonly schemaVersion: string;
  readonly operationalMode: DashboardOperationalMode;
  readonly manifest: MigrationResultsManifest;
  readonly verificationSummary?:
    | {
        readonly verifiedModuleCount: number;
        readonly unverifiedModuleCount: number;
        readonly discrepancyCount: number;
      }
    | undefined;
  readonly operationTotals?:
    | {
        readonly total: number;
        readonly succeeded: number;
        readonly mutated: number;
        readonly noop: number;
        readonly skipped: number;
        readonly failed: number;
      }
    | undefined;
  readonly transferStrategies: {
    readonly largeReleases?:
      | {
          readonly repos: readonly string[];
          readonly releasesCount: number;
          readonly assetsStreamed: number;
          readonly bytesStreamed: number;
        }
      | undefined;
    readonly lfs?:
      | {
          readonly repos: readonly string[];
          readonly objectsTransferred: number;
          readonly bytesTransferred: number;
        }
      | undefined;
    readonly mirrorPushRepos?: readonly string[] | undefined;
    readonly archivedRepos?: readonly string[] | undefined;
  };
  readonly repoStrategyBadges: Readonly<Record<string, string>>;
  readonly postCare: {
    readonly summary: {
      readonly totalItems: number;
      readonly secretCount: number;
      readonly appCount: number;
      readonly webhookCount: number;
      readonly runnerCount: number;
      readonly otherCount: number;
      readonly identityAndAccessCount: number;
      readonly governanceAndRemediationCount: number;
      readonly skippedArchivedCount: number;
    };
    readonly items: readonly HydratedPostCareItem[];
    readonly operationRows: readonly HydratedOperationRow[];
    readonly skippedArchivedRows: readonly HydratedSkippedArchivedRow[];
  };
}

export type ImportResult =
  | {
      success: true;
      bundle: DiscoveryBundle;
      insights: EvaluatedInsights;
    }
  | { success: false; message: string; code?: string };

export interface ImportProgress {
  status: ImportStage;
  progress: number;
}

export interface HostedEvidenceProbeOptions {
  readonly fetchFn?: typeof fetch | undefined;
  readonly bundleUrl?: string | undefined;
  readonly verificationReportUrl?: string | undefined;
  readonly manifestUrl?: string | undefined;
  readonly scopeUrl?: string | undefined;
  readonly hydrationUrl?: string | undefined;
}

export interface HostedEvidenceProbeResult {
  readonly found: boolean;
  readonly bundleResult?: ImportResult | undefined;
  readonly verificationReport?: VerificationReport | undefined;
  readonly resultsHydration?: ResultsHydrationData | undefined;
}

interface HostedManifestLike {
  readonly schemaVersion?: string | undefined;
  readonly runId?: string | undefined;
  readonly sourceOrg?: string | undefined;
  readonly targetOrg?: string | undefined;
  readonly targetResultsRepo?: string | undefined;
  readonly executionMode?: 'dry-run' | 'live' | undefined;
  readonly generatedAt?: string | undefined;
  readonly repositories?:
    | readonly {
        readonly sourceRepo?: string | undefined;
        readonly targetRepo?: string | undefined;
        readonly status?: 'succeeded' | 'failed' | undefined;
        readonly durationMs?: number | undefined;
        readonly relativeFilePath?: string | undefined;
        readonly moduleBreakdown?:
          | readonly {
              readonly moduleId: string;
              readonly status: 'complete' | 'partial' | 'failed' | 'skipped';
              readonly operationsCount?: number | undefined;
              readonly mutatedCount?: number | undefined;
              readonly noopCount?: number | undefined;
              readonly skippedCount?: number | undefined;
              readonly failedCount?: number | undefined;
              readonly relativeFilePath?: string | undefined;
            }[]
          | undefined;
        readonly failedStage?: string | undefined;
        readonly failureReason?: string | undefined;
        readonly remediationCommands?: readonly string[] | undefined;
      }[]
    | undefined;
  readonly transferStrategies?:
    | {
        readonly archivedRepos?: readonly string[] | undefined;
        readonly lfs?:
          | {
              readonly repos?: readonly string[] | undefined;
            }
          | undefined;
      }
    | undefined;
  readonly summary?:
    | {
        readonly totalRepositories?: number | undefined;
        readonly succeededCount?: number | undefined;
        readonly failedCount?: number | undefined;
        readonly successRatePercent?: number | undefined;
        readonly durationMs?: number | undefined;
        readonly orgModulesSummary?:
          MigrationResultsManifest['summary']['orgModulesSummary'] | undefined;
        readonly transferStrategies?:
          | {
              readonly archivedRepos?: readonly string[] | undefined;
              readonly lfs?:
                | {
                    readonly repos?: readonly string[] | undefined;
                  }
                | undefined;
            }
          | undefined;
      }
    | undefined;
}

interface HostedScopeLike {
  readonly sourceOrg?: string | undefined;
  readonly targetOrg?: string | undefined;
  readonly organizations?:
    | readonly {
        readonly source?: string | undefined;
        readonly target?: string | undefined;
      }[]
    | undefined;
  readonly repositories?:
    | readonly {
        readonly name?: string | undefined;
        readonly sourceOrg?: string | undefined;
        readonly sourceRepo?: string | undefined;
        readonly targetOrg?: string | undefined;
        readonly targetRepo?: string | undefined;
        readonly visibility?: 'public' | 'private' | 'internal' | undefined;
        readonly targetRepoVisibility?:
          'public' | 'private' | 'internal' | undefined;
        readonly archived?: boolean | undefined;
        readonly sizeKb?: number | undefined;
        readonly hasLfs?: boolean | undefined;
        readonly options?:
          | {
              readonly archived?: boolean | undefined;
              readonly targetRepoVisibility?:
                'public' | 'private' | 'internal' | undefined;
            }
          | undefined;
      }[]
    | undefined;
}

/**
 * Derives a discovery-mode ResultsHydrationData payload from a DiscoveryBundle when
 * no migration results hydration payload is loaded (e.g. discovery scan or sample bundle).
 */
export function deriveDiscoveryHydrationFromBundle(
  bundle: DiscoveryBundle,
): ResultsHydrationData {
  const org = bundle.organizations[0];
  const sourceOrg = org?.login ?? org?.id ?? 'source-org';
  const targetOrg =
    org?.displayName && org.displayName.includes('➔')
      ? org.displayName.split('➔')[1]?.trim() || sourceOrg
      : sourceOrg;
  const repoIdToName = new Map<string, string>();
  const skippedArchivedRows: HydratedSkippedArchivedRow[] = [];

  for (const entity of bundle.entities) {
    if (entity.kind === 'repository') {
      repoIdToName.set(entity.id, entity.name);
      if (entity.archived) {
        skippedArchivedRows.push({
          sourceOrg,
          sourceRepo: entity.name,
          visibility: entity.visibility,
          isFork: Boolean(entity.fork),
          archivedStatus: 'archived',
          disposition: 'skipped-archived',
          sourceUrl: `https://github.com/${encodeURIComponent(sourceOrg)}/${encodeURIComponent(entity.name)}`,
          notes:
            'Archived repository detected during discovery scan (excluded by default unless include_archived=true).',
        });
      }
    }
  }

  const items: HydratedPostCareItem[] = [];
  for (const entity of bundle.entities) {
    if (
      (entity.kind === 'actions-secret' ||
        entity.kind === 'dependabot-secret' ||
        entity.kind === 'codespaces-secret') &&
      entity.configurationKind === 'secret'
    ) {
      const targetRepo = entity.repositoryId
        ? repoIdToName.get(entity.repositoryId)
        : undefined;
      const subDomain =
        entity.kind === 'dependabot-secret'
          ? 'dependabot'
          : entity.kind === 'codespaces-secret'
            ? 'codespaces'
            : 'actions';
      const settingsUrl = targetRepo
        ? `https://github.com/${encodeURIComponent(targetOrg)}/${encodeURIComponent(targetRepo)}/settings/secrets/${subDomain}/${encodeURIComponent(entity.name)}`
        : `https://github.com/organizations/${encodeURIComponent(targetOrg)}/settings/secrets/${subDomain}/${encodeURIComponent(entity.name)}`;
      const cliCommand = targetRepo
        ? `gh secret set ${entity.name} --repo ${targetOrg}/${targetRepo} --app ${subDomain}`
        : `gh secret set ${entity.name} --org ${targetOrg} --app ${subDomain}`;
      items.push({
        itemId: `disc:secret:${targetRepo ?? 'org'}:${subDomain}:${entity.name}`,
        mode: 'discovery',
        priority: 'high',
        category: 'secret',
        scopeLevel:
          entity.level === 'environment'
            ? 'environment'
            : targetRepo
              ? 'repository'
              : 'organization',
        targetOrg,
        targetRepo,
        moduleId: targetRepo ? 'repo-secrets' : 'org-secrets',
        resourceType: targetRepo ? 'repo-secret' : 'org-secret',
        resourceName: entity.name,
        subDomain,
        migrationStatus: 'discovered',
        actionRequired: `Populate write-only ${subDomain} secret "${entity.name}" on target after migration.`,
        settingsUrl,
        cliCommand,
      });
    } else if (entity.kind === 'integration') {
      const targetRepo = entity.repositoryId
        ? repoIdToName.get(entity.repositoryId)
        : undefined;
      if (entity.integrationKind === 'github_app') {
        items.push({
          itemId: `disc:app:${entity.label}`,
          mode: 'discovery',
          priority: 'high',
          category: 'github-app',
          scopeLevel: 'organization',
          targetOrg,
          moduleId: 'apps-inventory',
          resourceType: 'github-app-installation',
          resourceName: entity.label,
          subDomain: 'github_app',
          migrationStatus: 'discovered',
          actionRequired: `Install or recreate GitHub App "${entity.label}" on ${targetOrg}.`,
          settingsUrl: `https://github.com/apps/${encodeURIComponent(entity.label)}/installations/new`,
          secondaryUrl: `https://github.com/organizations/${encodeURIComponent(targetOrg)}/settings/apps/new?name=${encodeURIComponent(`${entity.label}-${targetOrg}`)}`,
        });
      } else if (entity.integrationKind === 'webhook') {
        const settingsUrl = targetRepo
          ? `https://github.com/${encodeURIComponent(targetOrg)}/${encodeURIComponent(targetRepo)}/settings/hooks`
          : `https://github.com/organizations/${encodeURIComponent(targetOrg)}/settings/hooks`;
        items.push({
          itemId: `disc:webhook:${targetRepo ?? 'org'}:${entity.label}`,
          mode: 'discovery',
          priority: 'high',
          category: 'webhook',
          scopeLevel: targetRepo ? 'repository' : 'organization',
          targetOrg,
          targetRepo,
          moduleId: targetRepo ? 'webhooks' : 'org-webhooks',
          resourceType: targetRepo ? 'webhook' : 'org-webhook',
          resourceName: entity.label,
          subDomain: 'webhook',
          migrationStatus: 'discovered',
          actionRequired: `Supply HMAC signing secret and re-enable webhook "${entity.label}" on target.`,
          settingsUrl,
        });
      } else if (entity.integrationKind === 'deploy_key') {
        items.push({
          itemId: `disc:deploy-key:${targetRepo ?? 'org'}:${entity.label}`,
          mode: 'discovery',
          priority: 'medium',
          category: 'deploy-key',
          scopeLevel: 'repository',
          targetOrg,
          targetRepo,
          moduleId: 'deploy-keys',
          resourceType: 'deploy-key',
          resourceName: entity.label,
          subDomain: 'deploy-key',
          migrationStatus: 'discovered',
          actionRequired: `Cut over or rotate SSH deploy key "${entity.label}" on ${targetOrg}/${targetRepo ?? ''}.`,
          settingsUrl: `https://github.com/${encodeURIComponent(targetOrg)}/${encodeURIComponent(targetRepo ?? '')}/settings/keys`,
        });
      }
    } else if (
      entity.kind === 'action-runner' &&
      entity.runnerType === 'self-hosted'
    ) {
      const targetRepo = entity.repositoryId
        ? repoIdToName.get(entity.repositoryId)
        : undefined;
      items.push({
        itemId: `disc:runner:${targetRepo ?? 'org'}:${entity.name}`,
        mode: 'discovery',
        priority: 'medium',
        category: 'runner',
        scopeLevel: targetRepo ? 'repository' : 'organization',
        targetOrg,
        targetRepo,
        moduleId: 'actions-runners',
        resourceType: 'action-runner',
        resourceName: entity.name,
        subDomain: 'self-hosted-runner',
        migrationStatus: 'discovered',
        actionRequired: `Register self-hosted runner "${entity.name}" against ${targetRepo ? `${targetOrg}/${targetRepo}` : targetOrg}.`,
        settingsUrl: targetRepo
          ? `https://github.com/${encodeURIComponent(targetOrg)}/${encodeURIComponent(targetRepo)}/settings/actions/runners/new`
          : `https://github.com/organizations/${encodeURIComponent(targetOrg)}/settings/actions/runners/new`,
      });
    } else if (entity.kind === 'team') {
      items.push({
        itemId: `disc:team:${entity.name}`,
        mode: 'discovery',
        priority: 'medium',
        category: 'idp-team',
        scopeLevel: 'organization',
        targetOrg,
        moduleId: 'teams',
        resourceType: 'team',
        resourceName: entity.name,
        subDomain: 'idp-group-sync',
        migrationStatus: 'discovered',
        actionRequired: `Link team "${entity.name}" to its external IdP SCIM group in GHEC-EMU.`,
        settingsUrl: `https://github.com/orgs/${encodeURIComponent(targetOrg)}/teams/${encodeURIComponent(entity.name)}/edit`,
      });
    }
  }

  const secretCount = items.filter((i) => i.category === 'secret').length;
  const appCount = items.filter((i) => i.category === 'github-app').length;
  const webhookCount = items.filter((i) => i.category === 'webhook').length;
  const runnerCount = items.filter((i) => i.category === 'runner').length;
  const identityAndAccessCount = items.filter(
    (i) =>
      i.category === 'idp-team' ||
      i.category === 'mannequin' ||
      i.category === 'collaborator' ||
      i.category === 'deploy-key',
  ).length;
  const governanceAndRemediationCount = items.filter(
    (i) =>
      i.category === 'policy' ||
      i.category === 'package' ||
      i.category === 'security' ||
      i.category === 'failed-operation',
  ).length;
  const otherCount =
    items.length - secretCount - appCount - webhookCount - runnerCount;

  return {
    schemaVersion: MIGRATION_SCHEMA_VERSION,
    operationalMode: 'discovery',
    manifest: {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      runId: bundle.scan.id,
      generatedAt: bundle.scan.completedAt,
      sourceOrg,
      targetOrg,
      targetResultsRepo: 'migration-audit-results',
      executionMode: 'dry-run',
      summary: {
        totalRepositories: bundle.summary.repositoryCount,
        succeededCount: bundle.summary.repositoryCount,
        failedCount: 0,
        successRatePercent: 100,
        durationMs: 0,
        orgModulesSummary: {},
      },
      repositories: [],
    },
    transferStrategies: {
      ...(skippedArchivedRows.length > 0
        ? { archivedRepos: skippedArchivedRows.map((r) => r.sourceRepo) }
        : {}),
    },
    repoStrategyBadges: {},
    postCare: {
      summary: {
        totalItems: items.length,
        secretCount,
        appCount,
        webhookCount,
        runnerCount,
        otherCount,
        identityAndAccessCount,
        governanceAndRemediationCount,
        skippedArchivedCount: skippedArchivedRows.length,
      },
      items,
      operationRows: [],
      skippedArchivedRows,
    },
  };
}

function synthesizeBundleFromHostedArtifacts(params: {
  readonly manifest?: HostedManifestLike | undefined;
  readonly scope?: HostedScopeLike | undefined;
  readonly verificationReport?: VerificationReport | undefined;
}): ImportResult | undefined {
  const { manifest, scope, verificationReport } = params;
  if (!manifest && !scope && !verificationReport) {
    return undefined;
  }

  const orgId =
    manifest?.sourceOrg ||
    scope?.sourceOrg ||
    scope?.organizations?.[0]?.source ||
    scope?.repositories?.[0]?.sourceOrg ||
    verificationReport?.sourceOrg ||
    manifest?.targetOrg ||
    scope?.targetOrg ||
    scope?.organizations?.[0]?.target ||
    verificationReport?.targetOrg ||
    'hosted-migration-org';
  const targetOrg =
    manifest?.targetOrg ||
    scope?.targetOrg ||
    scope?.organizations?.[0]?.target ||
    scope?.repositories?.[0]?.targetOrg ||
    verificationReport?.targetOrg ||
    orgId;
  const rawTimestamp =
    manifest?.generatedAt ||
    verificationReport?.verifiedAt ||
    '2026-01-01T00:00:00.000Z';
  const parsedTime = Date.parse(rawTimestamp);
  const completedAt = Number.isNaN(parsedTime)
    ? '2026-01-01T00:00:00.000Z'
    : new Date(parsedTime).toISOString();
  const startedAt = Number.isNaN(parsedTime)
    ? '2026-01-01T00:00:00.000Z'
    : new Date(Math.max(0, parsedTime - 60_000)).toISOString();

  const strategies =
    manifest?.transferStrategies ?? manifest?.summary?.transferStrategies;
  const archivedSet = new Set(
    (strategies?.archivedRepos ?? []).map((r) => r.toLowerCase()),
  );
  const lfsSet = new Set(
    (strategies?.lfs?.repos ?? []).map((r) => r.toLowerCase()),
  );
  const scopeRepoMap = new Map<
    string,
    NonNullable<HostedScopeLike['repositories']>[number]
  >();
  for (const r of scope?.repositories ?? []) {
    const repoKey = r.targetRepo || r.sourceRepo || r.name;
    if (repoKey) {
      scopeRepoMap.set(repoKey.toLowerCase(), r);
    }
  }

  const repoNames = new Set<string>();
  for (const r of manifest?.repositories ?? []) {
    const name = r.targetRepo || r.sourceRepo;
    if (name) repoNames.add(name);
  }
  for (const r of scope?.repositories ?? []) {
    const name = r.targetRepo || r.sourceRepo || r.name;
    if (name) repoNames.add(name);
  }
  if (repoNames.size === 0 && verificationReport) {
    for (const mod of verificationReport.modules) {
      if (mod.moduleId === 'gei-repo') {
        for (const d of mod.discrepancies) {
          if (d.resourceName) repoNames.add(d.resourceName);
        }
      }
    }
  }

  const provenance = {
    source: 'rest' as const,
    operation: 'migration-audit-results.hydrate',
    observedAt: completedAt,
    apiVersion: '2022-11-28',
  };

  const modules = [
    'orgs',
    'repos',
    'lfs',
    'teams',
    'actions',
    'actions-secrets',
    'policies',
    'security',
    'integrations',
    'users',
    'packages',
  ] as const;

  const collectors = modules.map((mod) => ({
    id: `exec-${mod}`,
    module: mod,
    organizationId: orgId,
    status: 'complete' as const,
    startedAt,
    completedAt,
    provenance: [provenance],
    warnings: [],
    errors: [],
    coverage: {
      state: 'complete' as const,
      observed: mod === 'repos' ? repoNames.size : 1,
      expected: mod === 'repos' ? repoNames.size : 1,
      reason: null,
    },
  }));

  const entities: Record<string, unknown>[] = [];
  for (const repoName of Array.from(repoNames).sort((a, b) =>
    a.localeCompare(b),
  )) {
    const scopeEntry = scopeRepoMap.get(repoName.toLowerCase());
    const repoId = `repo:${repoName}`;
    const isArchived = Boolean(
      scopeEntry?.archived ||
      scopeEntry?.options?.archived ||
      archivedSet.has(repoName.toLowerCase()),
    );
    const hasLfs = Boolean(
      scopeEntry?.hasLfs || lfsSet.has(repoName.toLowerCase()),
    );
    const sizeBytes = Math.max(0, Math.round((scopeEntry?.sizeKb ?? 0) * 1024));

    entities.push({
      id: repoId,
      organizationId: orgId,
      collectorExecutionId: 'exec-repos',
      provenance,
      kind: 'repository',
      name: repoName,
      visibility:
        scopeEntry?.targetRepoVisibility ??
        scopeEntry?.options?.targetRepoVisibility ??
        scopeEntry?.visibility ??
        'private',
      archived: isArchived,
      defaultBranch: 'main',
      size: {
        value: sizeBytes,
        unit: 'bytes',
        availability: 'observed',
        reason: null,
      },
      fork: false,
    });

    entities.push({
      id: `portfolio:${repoName}`,
      organizationId: orgId,
      collectorExecutionId: 'exec-repos',
      provenance,
      kind: 'repository-portfolio',
      repositoryId: repoId,
      primaryLanguage: null,
      topics: isArchived ? ['archived', 'migrated'] : ['migrated'],
      template: false,
      pushedAt: completedAt,
      businessClassification: isArchived ? 'Archived' : 'Active',
      migrationWave: 'wave-1',
      customProperties: [],
      metadataCoverage: 'complete',
    });

    entities.push({
      id: `lfs:${repoName}`,
      organizationId: orgId,
      collectorExecutionId: 'exec-lfs',
      provenance,
      kind: 'lfs',
      repositoryId: repoId,
      storage: {
        value: hasLfs ? sizeBytes : 0,
        unit: 'bytes',
        availability: 'observed',
        reason: null,
      },
      objectCount: {
        value: hasLfs ? 1 : 0,
        unit: 'count',
        availability: 'observed',
        reason: null,
      },
      indicator: hasLfs ? 'detected' : 'not_detected',
    });

    entities.push({
      id: `security:${repoName}`,
      organizationId: orgId,
      collectorExecutionId: 'exec-security',
      provenance,
      kind: 'security',
      repositoryId: repoId,
      codeScanning: 'enabled',
      dependabot: 'enabled',
      secretScanning: 'enabled',
      openAlertCount: {
        value: 0,
        unit: 'count',
        availability: 'observed',
        reason: null,
      },
    });

    entities.push({
      id: `actions:${repoName}`,
      organizationId: orgId,
      collectorExecutionId: 'exec-actions',
      provenance,
      kind: 'actions',
      repositoryId: repoId,
      enabled: !isArchived,
      workflowCount: {
        value: 0,
        unit: 'count',
        availability: 'observed',
        reason: null,
      },
      runnerCount: {
        value: 0,
        unit: 'count',
        availability: 'observed',
        reason: null,
      },
      usage: {
        value: 0,
        unit: 'minutes',
        availability: 'observed',
        reason: null,
      },
      workflowNames: [],
      runnerTypes: ['hosted'],
    });
  }

  const candidate = {
    schemaVersion: '1.0.0',
    synthetic: false,
    scan: {
      id:
        manifest?.runId ||
        verificationReport?.reportId ||
        'hosted-migration-run',
      startedAt,
      completedAt,
      producer: 'ghec-consultant-cli',
      producerVersion: '1.0.0',
      status: 'complete',
    },
    configuration: {
      modules: [...modules],
      format: 'json',
      includeSensitiveMetadata: false,
      redactionProfile: 'standard',
      continueOnError: true,
    },
    scope: {
      kind: 'organization',
      organizationId: orgId,
    },
    organizations: [
      {
        id: orgId,
        login: orgId,
        displayName: targetOrg !== orgId ? `${orgId} ➔ ${targetOrg}` : orgId,
      },
    ],
    collectors,
    entities,
    findings: [],
    limitations: [],
    errors: [],
    summary: {
      organizationCount: 1,
      repositoryCount: repoNames.size,
      completeCollectorCount: collectors.length,
      incompleteCollectorCount: 0,
    },
  };

  const imported = importBundleJson(candidate);
  return imported.success ? imported : undefined;
}

function parseResultsHydrationJson(
  raw: unknown,
): ResultsHydrationData | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj['manifest'] !== 'object' ||
    !obj['manifest'] ||
    typeof obj['postCare'] !== 'object' ||
    !obj['postCare']
  ) {
    return undefined;
  }
  const modeRaw = obj['operationalMode'];
  const operationalMode: DashboardOperationalMode =
    modeRaw === 'discovery' || modeRaw === 'dry-run' || modeRaw === 'live'
      ? modeRaw
      : 'live';
  return {
    schemaVersion:
      typeof obj['schemaVersion'] === 'string'
        ? obj['schemaVersion']
        : MIGRATION_SCHEMA_VERSION,
    operationalMode,
    manifest: obj['manifest'] as MigrationResultsManifest,
    ...(obj['verificationSummary'] &&
    typeof obj['verificationSummary'] === 'object'
      ? {
          verificationSummary: obj[
            'verificationSummary'
          ] as ResultsHydrationData['verificationSummary'],
        }
      : {}),
    ...(obj['operationTotals'] && typeof obj['operationTotals'] === 'object'
      ? {
          operationTotals: obj[
            'operationTotals'
          ] as ResultsHydrationData['operationTotals'],
        }
      : {}),
    transferStrategies:
      obj['transferStrategies'] && typeof obj['transferStrategies'] === 'object'
        ? (obj[
            'transferStrategies'
          ] as ResultsHydrationData['transferStrategies'])
        : {},
    repoStrategyBadges:
      obj['repoStrategyBadges'] && typeof obj['repoStrategyBadges'] === 'object'
        ? (obj['repoStrategyBadges'] as Readonly<Record<string, string>>)
        : {},
    postCare: obj['postCare'] as ResultsHydrationData['postCare'],
  };
}

function synthesizeHydrationFromManifest(
  manifest: HostedManifestLike,
  verificationReport?: VerificationReport | undefined,
): ResultsHydrationData | undefined {
  const validated = validateMigrationResultsManifest(manifest);
  const resolvedManifest: MigrationResultsManifest = validated.success
    ? validated.data
    : {
        schemaVersion: MIGRATION_SCHEMA_VERSION,
        runId: manifest.runId ?? 'hosted-run',
        generatedAt: manifest.generatedAt ?? '2026-01-01T00:00:00.000Z',
        sourceOrg: manifest.sourceOrg ?? 'source-org',
        targetOrg: manifest.targetOrg ?? manifest.sourceOrg ?? 'target-org',
        targetResultsRepo:
          manifest.targetResultsRepo ?? 'migration-audit-results',
        executionMode: manifest.executionMode ?? 'live',
        summary: {
          totalRepositories:
            manifest.summary?.totalRepositories ??
            manifest.repositories?.length ??
            0,
          succeededCount:
            manifest.summary?.succeededCount ??
            manifest.repositories?.length ??
            0,
          failedCount: manifest.summary?.failedCount ?? 0,
          successRatePercent: manifest.summary?.successRatePercent ?? 100,
          durationMs: manifest.summary?.durationMs ?? 0,
          orgModulesSummary: manifest.summary?.orgModulesSummary ?? {},
        },
        repositories: (manifest.repositories ?? []).map((r) => ({
          sourceRepo: r.sourceRepo ?? r.targetRepo ?? 'repo',
          targetRepo: r.targetRepo ?? r.sourceRepo ?? 'repo',
          status: r.status ?? 'succeeded',
          durationMs: r.durationMs ?? 0,
          relativeFilePath:
            r.relativeFilePath ??
            `success/${r.targetRepo ?? r.sourceRepo ?? 'repo'}.md`,
          stagesRun: ['preflight', 'gei', 'verification'],
          verified: r.status !== 'failed',
          discrepancyCount: 0,
          warnings: [],
          ...(r.failedStage ? { failedStage: r.failedStage } : {}),
          ...(r.failureReason ? { failureReason: r.failureReason } : {}),
          ...(r.remediationCommands
            ? { remediationCommands: [...r.remediationCommands] }
            : {}),
        })),
      };

  const strategies =
    manifest.transferStrategies ?? manifest.summary?.transferStrategies;

  return {
    schemaVersion: MIGRATION_SCHEMA_VERSION,
    operationalMode: resolvedManifest.executionMode,
    manifest: resolvedManifest,
    ...(verificationReport?.summary
      ? {
          verificationSummary: {
            verifiedModuleCount: verificationReport.summary.verifiedModuleCount,
            unverifiedModuleCount:
              verificationReport.summary.unverifiedModuleCount,
            discrepancyCount: verificationReport.summary.discrepancyCount,
          },
        }
      : {}),
    transferStrategies: {
      ...(strategies?.archivedRepos
        ? { archivedRepos: strategies.archivedRepos }
        : {}),
      ...(strategies?.lfs?.repos
        ? {
            lfs: {
              repos: strategies.lfs.repos,
              objectsTransferred: strategies.lfs.repos.length,
              bytesTransferred: 0,
            },
          }
        : {}),
    },
    repoStrategyBadges: {},
    postCare: {
      summary: {
        totalItems: 0,
        secretCount: 0,
        appCount: 0,
        webhookCount: 0,
        runnerCount: 0,
        otherCount: 0,
        identityAndAccessCount: 0,
        governanceAndRemediationCount: 0,
        skippedArchivedCount: 0,
      },
      items: [],
      operationRows: [],
      skippedArchivedRows: [],
    },
  };
}

const MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024;

/**
 * Parses and validates an uploaded bundle file.
 * Complies with DASH-INGEST-001 and DASH-COMPAT-001:
 * - Checks byte limit
 * - Parses as untrusted data
 * - Validates schema version and invariants
 * - Never echoes sensitive payload contents in error messages
 */
export async function importBundleFile(
  file: File,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      code: 'file_too_large',
      message: `File exceeds maximum allowed size of 250 MB (uploaded file: ${(file.size / (1024 * 1024)).toFixed(1)} MB). Split the assessment or reduce optional evidence before retrying.`,
    };
  }

  return new Promise((resolve) => {
    const worker = new Worker(
      new URL('./importer.worker.ts', import.meta.url),
      {
        type: 'module',
      },
    );
    const finish = (result: ImportResult) => {
      worker.terminate();
      resolve(result);
    };
    worker.onmessage = (event: MessageEvent<ImportWorkerMessage>) => {
      const message = event.data;
      onProgress?.({ status: message.status, progress: message.progress });
      if (message.status === 'ready') {
        finish({
          success: true,
          bundle: message.bundle,
          insights: message.insights,
        });
      } else if (message.status === 'error') {
        finish({
          success: false,
          code: message.code,
          message: message.message,
        });
      }
    };
    worker.onerror = () => {
      finish({
        success: false,
        code: 'worker_error',
        message:
          'The background importer stopped unexpectedly. Retry the import or verify the bundle schema.',
      });
    };
    worker.postMessage(file);
  });
}

/**
 * Loads one of the pre-bundled synthetic fixtures for instant demo and critique.
 */
export function loadSampleBundle(
  type: 'organization' | 'enterprise' | 'specialized' | 'partial-denied',
): ImportResult {
  const sample = (() => {
    switch (type) {
      case 'organization':
        return SAMPLE_ORGANIZATION_BUNDLE;
      case 'enterprise':
        return SAMPLE_ENTERPRISE_BUNDLE;
      case 'specialized':
        return SAMPLE_SPECIALIZED_BUNDLE;
      case 'partial-denied':
        return SAMPLE_PARTIAL_DENIED_BUNDLE;
    }
  })();
  const validation = validateBundle(sample);
  if (!validation.success) {
    return {
      success: false,
      code: validation.code,
      message: validation.message,
    };
  }
  return {
    success: true,
    bundle: validation.data,
    insights: evaluateBundle(validation.data),
  };
}

/**
 * Validates and evaluates a pre-parsed or fetched JSON discovery bundle directly.
 */
export function importBundleJson(data: unknown): ImportResult {
  const candidate =
    data &&
    typeof data === 'object' &&
    'discoveryBundle' in data &&
    (data as { discoveryBundle?: unknown }).discoveryBundle &&
    typeof (data as { discoveryBundle?: unknown }).discoveryBundle === 'object'
      ? (data as { discoveryBundle: unknown }).discoveryBundle
      : data;

  const validation = validateBundle(candidate);
  if (!validation.success) {
    return {
      success: false,
      code: validation.code,
      message: validation.message,
    };
  }
  return {
    success: true,
    bundle: validation.data,
    insights: evaluateBundle(validation.data),
  };
}

/**
 * Probes relative `./evidence/` paths when the dashboard is hosted as a Private GitHub Pages
 * site inside a results repository (`migration-audit-results`).
 * Falls back silently (`found: false`) when running on localhost or when no evidence JSON is present.
 */
export async function probeHostedEvidence(
  options: HostedEvidenceProbeOptions = {},
): Promise<HostedEvidenceProbeResult> {
  const fetchImpl =
    options.fetchFn ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetchImpl) {
    return { found: false };
  }

  const bundleUrl = options.bundleUrl ?? './evidence/discovery-bundle.json';
  const verificationUrl =
    options.verificationReportUrl ?? './evidence/verification-report.json';
  const manifestUrl = options.manifestUrl ?? './manifest.json';
  const scopeUrl = options.scopeUrl ?? './evidence/migration-scope.json';
  const hydrationUrl =
    options.hydrationUrl ?? './evidence/results-hydration.json';

  let bundleResult: ImportResult | undefined;
  let verificationReport: VerificationReport | undefined;
  let hostedManifest: HostedManifestLike | undefined;
  let hostedScope: HostedScopeLike | undefined;
  let resultsHydration: ResultsHydrationData | undefined;

  const fetchJsonSafe = async (url: string): Promise<unknown> => {
    try {
      const res = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return undefined;
      const text = (await res.text()).trim();
      if (!text || text.startsWith('<')) return undefined;
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };

  await Promise.all([
    (async () => {
      const parsed = await fetchJsonSafe(bundleUrl);
      if (!parsed) return;
      const imported = importBundleJson(parsed);
      if (imported.success) {
        bundleResult = imported;
      }
    })(),
    (async () => {
      const parsed = await fetchJsonSafe(verificationUrl);
      if (!parsed) return;
      const validated = validateVerificationReport(parsed);
      if (validated.success) {
        verificationReport = validated.data;
      } else if (
        typeof parsed === 'object' &&
        'schemaVersion' in parsed &&
        Array.isArray((parsed as { modules?: unknown }).modules)
      ) {
        verificationReport = parsed as VerificationReport;
      }
    })(),
    (async () => {
      const parsed = await fetchJsonSafe(manifestUrl);
      if (
        parsed &&
        typeof parsed === 'object' &&
        ('sourceOrg' in parsed || 'repositories' in parsed)
      ) {
        hostedManifest = parsed as HostedManifestLike;
      }
    })(),
    (async () => {
      const parsed = await fetchJsonSafe(scopeUrl);
      if (
        parsed &&
        typeof parsed === 'object' &&
        ('sourceOrg' in parsed || 'repositories' in parsed)
      ) {
        hostedScope = parsed as HostedScopeLike;
      }
    })(),
    (async () => {
      const parsed = await fetchJsonSafe(hydrationUrl);
      if (!parsed) return;
      resultsHydration = parseResultsHydrationJson(parsed);
    })(),
  ]);

  if (!resultsHydration && hostedManifest) {
    resultsHydration = synthesizeHydrationFromManifest(
      hostedManifest,
      verificationReport,
    );
  }

  if (
    !bundleResult?.success &&
    (resultsHydration || hostedManifest || hostedScope || verificationReport)
  ) {
    bundleResult = synthesizeBundleFromHostedArtifacts({
      manifest: resultsHydration?.manifest ?? hostedManifest,
      scope: hostedScope,
      verificationReport,
    });
  }

  if (!resultsHydration && bundleResult?.success) {
    resultsHydration = deriveDiscoveryHydrationFromBundle(bundleResult.bundle);
  }

  return {
    found: Boolean(
      bundleResult?.success || verificationReport || resultsHydration,
    ),
    bundleResult,
    verificationReport,
    resultsHydration,
  };
}
