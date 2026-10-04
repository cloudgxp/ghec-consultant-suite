import {
  MIGRATION_SCHEMA_VERSION,
  type DiscoveryBundle,
} from '@ghec/contracts';
import sodium from 'libsodium-wrappers';
import type { MigrationModule } from '../../core/module.js';
import type {
  MigrationContext,
  MigrationScopeLevel,
  ModuleExecutionResult,
  ModulePlan,
  ModuleVerificationResult,
  OperationExecutionResult,
  PlannedOperation,
  VerificationDiscrepancy,
} from '../../core/types.js';
import {
  REPO_SECRET_DOMAINS,
  type RawGitHubPublicKeyResponse,
  type RawGitHubSecretsResponse,
  type RepoSecretDomain,
  type RepoSecretMetadata,
  type RepoSecretsData,
} from './types.js';

const endpointFor = (domain: RepoSecretDomain, suffix = ''): string =>
  `/repos/{owner}/{repo}/${domain === 'actions' ? 'actions' : domain}/secrets${suffix}`;

function isSecretDomain(value: unknown): value is RepoSecretDomain {
  return (
    typeof value === 'string' &&
    REPO_SECRET_DOMAINS.includes(value as RepoSecretDomain)
  );
}

function secretFromOperation(
  op: PlannedOperation,
): RepoSecretMetadata | undefined {
  const source = op.sourceState as Partial<RepoSecretMetadata> | undefined;
  const domain =
    source?.domain ?? (op.payload as { domain?: unknown } | undefined)?.domain;
  return isSecretDomain(domain) ? { domain, name: op.resourceName } : undefined;
}

async function encryptSecret(
  value: string,
  publicKey: string,
): Promise<string> {
  await sodium.ready;
  const key = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
  const encrypted = sodium.crypto_box_seal(sodium.from_string(value), key);
  return sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);
}

/**
 * Rehydrates secret names after GEI. Values are never collected or persisted:
 * a client vault can supply an ephemeral value, otherwise a blank placeholder
 * is encrypted with the target repository's public key (DEC-004).
 */
export class RepoSecretsMigrationModule implements MigrationModule<RepoSecretsData> {
  readonly id = 'repo-secrets';
  readonly displayName = 'Repository Secrets (Actions, Dependabot, Codespaces)';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['gei-repo'];

  async discover(
    ctx: MigrationContext,
    cachedData?: unknown,
  ): Promise<RepoSecretsData> {
    const repo = ctx.scope.sourceRepo;
    if (!repo) {
      throw new Error(
        'RepoSecretsMigrationModule requires sourceRepo in migration context.',
      );
    }

    const cached = this.discoverCached(repo, cachedData);
    if (cached) return cached;

    const secrets: RepoSecretMetadata[] = [];
    for (const domain of REPO_SECRET_DOMAINS) {
      const response =
        await ctx.sourceClient.readSingle<RawGitHubSecretsResponse>(
          {
            id: `rest.${domain}.listRepoSecrets`,
            transport: 'rest',
            verifiedReadOnly: true,
            path: endpointFor(domain),
            pathParams: { owner: ctx.scope.sourceOrg, repo },
          },
          ctx.signal,
        );
      for (const secret of response.data?.secrets ?? []) {
        if (secret.name) {
          secrets.push({
            domain,
            name: secret.name,
            updatedAt: secret.updated_at,
          });
        }
      }
    }
    return { repo, secrets };
  }

  async plan(
    ctx: MigrationContext,
    sourceData: RepoSecretsData,
  ): Promise<ModulePlan> {
    const targetRepo = ctx.scope.targetRepo ?? sourceData.repo;
    const targetSecrets = new Set<string>();
    const warnings: string[] = [];

    for (const domain of REPO_SECRET_DOMAINS) {
      try {
        const response =
          await ctx.targetClient.readSingle<RawGitHubSecretsResponse>(
            {
              id: `rest.${domain}.listRepoSecrets`,
              transport: 'rest',
              verifiedReadOnly: true,
              path: endpointFor(domain),
              pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
            },
            ctx.signal,
          );
        for (const secret of response.data?.secrets ?? []) {
          if (secret.name) targetSecrets.add(`${domain}:${secret.name}`);
        }
      } catch {
        warnings.push(
          `Could not query target ${domain} secrets on ${ctx.scope.targetOrg}/${targetRepo}; assuming none exist.`,
        );
      }
    }

    const operations: PlannedOperation[] = sourceData.secrets.map((secret) => {
      const exists = targetSecrets.has(`${secret.domain}:${secret.name}`);
      if (exists) {
        return {
          id: `repo-secrets:${targetRepo}:${secret.domain}:${secret.name}`,
          resourceType: 'secret',
          resourceName: secret.name,
          operation: 'noop',
          sourceState: secret,
          reason: `A ${secret.domain} secret with this name already exists on the target.`,
        };
      }
      warnings.push(
        `${secret.domain} secret "${secret.name}" requires post-migration value injection; a client vault value or encrypted blank placeholder will be used.`,
      );
      return {
        id: `repo-secrets:${targetRepo}:${secret.domain}:${secret.name}`,
        resourceType: 'secret',
        resourceName: secret.name,
        operation: 'create',
        sourceState: secret,
        payload: { domain: secret.domain, valuePopulation: 'vault-or-blank' },
        reason: `A ${secret.domain} secret is missing on the target.`,
      };
    });

    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier: `${ctx.scope.targetOrg}/${targetRepo}`,
      operations,
      warnings,
    };
  }

  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    const startedAt = Date.now();
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const results: OperationExecutionResult[] = [];
    if (!ctx.targetWriteClient && !ctx.dryRun) {
      throw new Error(
        'TargetWriteClient must be provided in MigrationContext to apply mutations.',
      );
    }

    for (const operation of plan.operations) {
      const completedAt = new Date().toISOString();
      if (operation.operation === 'noop') {
        results.push({
          operationId: operation.id,
          status: 'succeeded',
          completedAt,
        });
        continue;
      }
      if (operation.operation !== 'create') {
        results.push({
          operationId: operation.id,
          status: 'skipped',
          completedAt,
        });
        continue;
      }
      const secret = secretFromOperation(operation);
      if (!secret) {
        results.push({
          operationId: operation.id,
          status: 'failed',
          error: 'Secret domain is missing from the planned operation.',
          completedAt,
        });
        if (!ctx.continueOnError) break;
        continue;
      }
      if (ctx.dryRun) {
        results.push({
          operationId: operation.id,
          status: 'succeeded',
          httpStatus: 200,
          completedAt,
        });
        continue;
      }

      try {
        const publicKey =
          await ctx.targetClient.readSingle<RawGitHubPublicKeyResponse>(
            {
              id: `rest.${secret.domain}.getRepoPublicKey`,
              transport: 'rest',
              verifiedReadOnly: true,
              path: endpointFor(secret.domain, '/public-key'),
              pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
            },
            ctx.signal,
          );
        if (!publicKey.data?.key_id || !publicKey.data.key) {
          throw new Error(
            `Target ${secret.domain} secrets public key is unavailable.`,
          );
        }
        const value =
          (await ctx.secretValueProvider?.getSecretValue({
            domain: secret.domain,
            name: secret.name,
            sourceOrg: ctx.scope.sourceOrg,
            sourceRepo: ctx.scope.sourceRepo ?? '',
            targetOrg: ctx.scope.targetOrg,
            targetRepo,
            signal: ctx.signal,
          })) ?? '';
        const encryptedValue = await encryptSecret(value, publicKey.data.key);
        const response = await ctx.targetWriteClient!.mutate(
          {
            id: `rest.${secret.domain}.createOrUpdateRepoSecret`,
            method: 'PUT',
            path: `${endpointFor(secret.domain)}/{secret_name}`,
            pathParams: {
              owner: ctx.scope.targetOrg,
              repo: targetRepo,
              secret_name: secret.name,
            },
            body: {
              encrypted_value: encryptedValue,
              key_id: publicKey.data.key_id,
            },
          },
          ctx.signal,
        );
        results.push({
          operationId: operation.id,
          status:
            response.status >= 200 && response.status < 300
              ? 'succeeded'
              : 'failed',
          httpStatus: response.status,
          error:
            response.status >= 200 && response.status < 300
              ? undefined
              : `GitHub API error (HTTP ${response.status})`,
          completedAt: new Date().toISOString(),
        });
      } catch (error) {
        void error;
        results.push({
          operationId: operation.id,
          status: 'failed',
          error: 'Secret population or target update failed.',
          completedAt: new Date().toISOString(),
        });
      }
      if (results.at(-1)?.status === 'failed' && !ctx.continueOnError) break;
    }

    const failed = results.some((result) => result.status === 'failed');
    const succeeded = results.some((result) => result.status === 'succeeded');
    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status: failed
        ? succeeded
          ? 'partial'
          : 'failed'
        : succeeded
          ? 'complete'
          : 'skipped',
      results,
      durationMs: Date.now() - startedAt,
    };
  }

  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const present = new Set<string>();
    const discrepancies: VerificationDiscrepancy[] = [];
    try {
      for (const domain of REPO_SECRET_DOMAINS) {
        const response =
          await ctx.targetClient.readSingle<RawGitHubSecretsResponse>(
            {
              id: `rest.${domain}.listRepoSecrets`,
              transport: 'rest',
              verifiedReadOnly: true,
              path: endpointFor(domain),
              pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
            },
            ctx.signal,
          );
        for (const secret of response.data?.secrets ?? []) {
          if (secret.name) present.add(`${domain}:${secret.name}`);
        }
      }
    } catch (error) {
      return {
        moduleId: this.id,
        verified: false,
        discrepancies: [
          {
            resourceName: targetRepo,
            expected: 'reachable',
            actual: 'unreachable',
            message: `Failed to query target repository secrets: ${error instanceof Error ? error.message : 'unknown error'}`,
          },
        ],
      };
    }

    for (const operation of plan.operations) {
      const secret = secretFromOperation(operation);
      if (
        secret &&
        ['create', 'noop'].includes(operation.operation) &&
        !present.has(`${secret.domain}:${secret.name}`)
      ) {
        discrepancies.push({
          resourceName: `${secret.domain}:${secret.name}`,
          expected: 'present',
          actual: 'missing',
          message: `${secret.domain} secret "${secret.name}" is missing on target repository.`,
        });
      }
    }
    return {
      moduleId: this.id,
      verified: discrepancies.length === 0,
      discrepancies,
    };
  }

  private discoverCached(
    repo: string,
    cachedData?: unknown,
  ): RepoSecretsData | undefined {
    const bundle = cachedData as DiscoveryBundle | undefined;
    const repoEntity = bundle?.entities?.find(
      (entity) => entity.kind === 'repository' && entity.name === repo,
    );
    if (!repoEntity) return undefined;
    const secrets: RepoSecretMetadata[] = [];
    for (const entity of bundle!.entities) {
      if (
        entity.kind === 'configuration-metadata' &&
        entity.configurationKind === 'secret' &&
        entity.level === 'repository' &&
        entity.repositoryId === repoEntity.id &&
        isSecretDomain(entity.domain)
      ) {
        secrets.push({
          domain: entity.domain,
          name: entity.name,
          updatedAt: entity.updatedAt ?? undefined,
        });
      }
    }
    return { repo, secrets };
  }
}
