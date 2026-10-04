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
  type RepoSecretDomain,
} from '../repo-secrets/types.js';
import type {
  OrganizationVisibility,
  RepositoryIdMap,
} from '../org-variables/types.js';
import type {
  OrgSecretsData,
  OrgSecretsModuleOptions,
  OrganizationSecret,
  RawOrganizationPublicKeyResponse,
  RawOrganizationSecretsResponse,
  RawOrganizationSecretSelectedRepositoriesResponse,
} from './types.js';

const pathFor = (domain: RepoSecretDomain) => `/orgs/{org}/${domain}/secrets`;
const isVisibility = (value: unknown): value is OrganizationVisibility =>
  value === 'all' || value === 'private' || value === 'selected';
const equalIds = (left: readonly string[], right: readonly string[]) =>
  [...left].sort().join(',') === [...right].sort().join(',');
async function encrypt(value: string, publicKey: string): Promise<string> {
  await sodium.ready;
  return sodium.to_base64(
    sodium.crypto_box_seal(
      sodium.from_string(value),
      sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL),
    ),
    sodium.base64_variants.ORIGINAL,
  );
}

export class OrgSecretsMigrationModule implements MigrationModule<OrgSecretsData> {
  readonly id = 'org-secrets';
  readonly displayName =
    'Organization Secrets (Actions, Dependabot, Codespaces)';
  readonly scopeLevel: MigrationScopeLevel = 'organization';
  readonly dependencies: readonly string[] = [];
  private readonly repositoryIdMap: RepositoryIdMap;
  constructor(options: OrgSecretsModuleOptions = {}) {
    this.repositoryIdMap = options.repositoryIdMap ?? {};
  }

  async discover(
    ctx: MigrationContext,
    cachedData?: unknown,
  ): Promise<OrgSecretsData> {
    const cached = this.discoverCached(ctx.scope.sourceOrg, cachedData);
    if (cached) return cached;
    const secrets: OrganizationSecret[] = [];
    for (const domain of REPO_SECRET_DOMAINS) {
      const response =
        await ctx.sourceClient.readSingle<RawOrganizationSecretsResponse>(
          {
            id: `rest.${domain}.listOrgSecrets`,
            transport: 'rest',
            verifiedReadOnly: true,
            path: pathFor(domain),
            pathParams: { org: ctx.scope.sourceOrg },
          },
          ctx.signal,
        );
      for (const item of response.data?.secrets ?? [])
        if (item.name) {
          const visibility = isVisibility(item.visibility)
            ? item.visibility
            : 'all';
          secrets.push({
            domain,
            name: item.name,
            visibility,
            selectedRepositoryIds:
              visibility === 'selected'
                ? await this.selected(
                    ctx.sourceClient,
                    ctx.scope.sourceOrg,
                    domain,
                    item.name,
                    ctx.signal,
                  )
                : [],
          });
        }
    }
    return { organization: ctx.scope.sourceOrg, secrets };
  }

  async plan(
    ctx: MigrationContext,
    source: OrgSecretsData,
  ): Promise<ModulePlan> {
    const warnings: string[] = [];
    const target = await this.target(ctx);
    const existing = new Map(
      target.map((secret) => [`${secret.domain}:${secret.name}`, secret]),
    );
    const operations: PlannedOperation[] = [];
    for (const secret of source.secrets) {
      const selectedRepositoryIds = this.mapped(secret, warnings).map(String);
      const desired = { ...secret, selectedRepositoryIds };
      const current = existing.get(`${secret.domain}:${secret.name}`);
      const operation = !current
        ? 'create'
        : current.visibility === desired.visibility &&
            equalIds(
              current.selectedRepositoryIds,
              desired.selectedRepositoryIds,
            )
          ? 'noop'
          : 'update';
      if (operation !== 'noop')
        warnings.push(
          `${secret.domain} secret "${secret.name}" needs a vault value or encrypted blank placeholder.`,
        );
      operations.push({
        id: `org-secrets:${ctx.scope.targetOrg}:${secret.domain}:${secret.name}`,
        resourceType: 'organization-secret',
        resourceName: secret.name,
        operation,
        sourceState: desired,
        destinationCurrentState: current,
        payload:
          operation === 'noop'
            ? undefined
            : {
                domain: secret.domain,
                visibility: secret.visibility,
                selected_repository_ids: selectedRepositoryIds.map(Number),
                valuePopulation: 'vault-or-blank',
              },
      });
    }
    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier: ctx.scope.targetOrg,
      operations,
      warnings,
    };
  }

  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    const startedAt = Date.now(),
      results: OperationExecutionResult[] = [];
    if (!ctx.targetWriteClient && !ctx.dryRun)
      throw new Error(
        'TargetWriteClient must be provided in MigrationContext to apply mutations.',
      );
    for (const operation of plan.operations) {
      const completedAt = new Date().toISOString();
      const secret = operation.sourceState as OrganizationSecret | undefined;
      if (operation.operation === 'noop') {
        results.push({
          operationId: operation.id,
          status: 'succeeded',
          completedAt,
        });
        continue;
      }
      if (
        (operation.operation !== 'create' &&
          operation.operation !== 'update') ||
        !secret
      ) {
        results.push({
          operationId: operation.id,
          status: 'skipped',
          completedAt,
        });
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
        const key =
          await ctx.targetClient.readSingle<RawOrganizationPublicKeyResponse>(
            {
              id: `rest.${secret.domain}.getOrgPublicKey`,
              transport: 'rest',
              verifiedReadOnly: true,
              path: `${pathFor(secret.domain)}/public-key`,
              pathParams: { org: ctx.scope.targetOrg },
            },
            ctx.signal,
          );
        if (!key.data?.key || !key.data.key_id)
          throw new Error('Target organization public key is unavailable.');
        const value =
          (await ctx.secretValueProvider?.getSecretValue({
            domain: secret.domain,
            name: secret.name,
            sourceOrg: ctx.scope.sourceOrg,
            sourceRepo: '',
            targetOrg: ctx.scope.targetOrg,
            targetRepo: '',
            signal: ctx.signal,
          })) ?? '';
        const response = await ctx.targetWriteClient!.mutate(
          {
            id: `rest.${secret.domain}.putOrgSecret`,
            method: 'PUT',
            path: `${pathFor(secret.domain)}/{secret_name}`,
            pathParams: { org: ctx.scope.targetOrg, secret_name: secret.name },
            body: {
              encrypted_value: await encrypt(value, key.data.key),
              key_id: key.data.key_id,
              visibility: secret.visibility,
              ...(secret.visibility === 'selected'
                ? {
                    selected_repository_ids:
                      secret.selectedRepositoryIds.map(Number),
                  }
                : {}),
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
          completedAt: new Date().toISOString(),
        });
      } catch {
        results.push({
          operationId: operation.id,
          status: 'failed',
          error: 'Organization secret update failed.',
          completedAt: new Date().toISOString(),
        });
      }
      if (results.at(-1)?.status === 'failed' && !ctx.continueOnError) break;
    }
    const failed = results.some((result) => result.status === 'failed'),
      succeeded = results.some((result) => result.status === 'succeeded');
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
    const target = new Map(
      (await this.target(ctx)).map((secret) => [
        `${secret.domain}:${secret.name}`,
        secret,
      ]),
    );
    const discrepancies: VerificationDiscrepancy[] = [];
    for (const operation of plan.operations) {
      const expected = operation.sourceState as OrganizationSecret | undefined;
      const actual =
        expected && target.get(`${expected.domain}:${expected.name}`);
      if (
        expected &&
        ['create', 'update', 'noop'].includes(operation.operation) &&
        (!actual ||
          actual.visibility !== expected.visibility ||
          !equalIds(
            actual.selectedRepositoryIds,
            expected.selectedRepositoryIds,
          ))
      )
        discrepancies.push({
          resourceName: `${expected.domain}:${expected.name}`,
          expected: 'matching visibility and selected repositories',
          actual: actual ? 'mismatched' : 'missing',
          message: 'Organization secret target scope does not match the plan.',
        });
    }
    return {
      moduleId: this.id,
      verified: discrepancies.length === 0,
      discrepancies,
    };
  }

  private async target(ctx: MigrationContext): Promise<OrganizationSecret[]> {
    const secrets: OrganizationSecret[] = [];
    for (const domain of REPO_SECRET_DOMAINS) {
      const response =
        await ctx.targetClient.readSingle<RawOrganizationSecretsResponse>(
          {
            id: `rest.${domain}.listOrgSecrets`,
            transport: 'rest',
            verifiedReadOnly: true,
            path: pathFor(domain),
            pathParams: { org: ctx.scope.targetOrg },
          },
          ctx.signal,
        );
      for (const item of response.data?.secrets ?? [])
        if (item.name) {
          const visibility = isVisibility(item.visibility)
            ? item.visibility
            : 'all';
          secrets.push({
            domain,
            name: item.name,
            visibility,
            selectedRepositoryIds:
              visibility === 'selected'
                ? await this.selected(
                    ctx.targetClient,
                    ctx.scope.targetOrg,
                    domain,
                    item.name,
                    ctx.signal,
                  )
                : [],
          });
        }
    }
    return secrets;
  }
  private async selected(
    client: MigrationContext['sourceClient'],
    org: string,
    domain: RepoSecretDomain,
    name: string,
    signal: AbortSignal,
  ): Promise<string[]> {
    const response =
      await client.readSingle<RawOrganizationSecretSelectedRepositoriesResponse>(
        {
          id: `rest.${domain}.listSelectedOrgSecretRepositories`,
          transport: 'rest',
          verifiedReadOnly: true,
          path: `${pathFor(domain)}/{secret_name}/repositories`,
          pathParams: { org, secret_name: name },
        },
        signal,
      );
    return (response.data?.repositories ?? []).flatMap((repository) =>
      repository.id === undefined ? [] : [String(repository.id)],
    );
  }
  private mapped(secret: OrganizationSecret, warnings: string[]): number[] {
    if (secret.visibility !== 'selected') return [];
    const mapped: number[] = [];
    for (const sourceId of secret.selectedRepositoryIds) {
      const targetId = this.repositoryIdMap[sourceId];
      if (targetId === undefined)
        warnings.push(
          `Selected repository ${sourceId} for ${secret.domain} secret "${secret.name}" has no target repository ID mapping.`,
        );
      else mapped.push(targetId);
    }
    return [...new Set(mapped)].sort((a, b) => a - b);
  }
  private discoverCached(
    organization: string,
    cachedData?: unknown,
  ): OrgSecretsData | undefined {
    const bundle = cachedData as DiscoveryBundle | undefined;
    const org = bundle?.organizations.find(
      (candidate) => candidate.login === organization,
    );
    if (!org) return undefined;
    const secrets: OrganizationSecret[] = [];
    for (const entity of bundle!.entities)
      if (
        entity.kind === 'configuration-metadata' &&
        entity.organizationId === org.id &&
        entity.configurationKind === 'secret' &&
        entity.level === 'organization' &&
        REPO_SECRET_DOMAINS.includes(entity.domain as RepoSecretDomain)
      )
        secrets.push({
          domain: entity.domain as RepoSecretDomain,
          name: entity.name,
          visibility:
            entity.accessMode === 'private_repositories'
              ? 'private'
              : entity.accessMode === 'selected_repositories'
                ? 'selected'
                : 'all',
          selectedRepositoryIds: entity.selectedRepositoryIds,
        });
    return { organization, secrets };
  }
}
