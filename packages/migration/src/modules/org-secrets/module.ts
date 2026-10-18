import {
  MIGRATION_SCHEMA_VERSION,
  type DiscoveryBundle,
} from '@ghec/contracts';
import sodium from 'libsodium-wrappers';
import type { MigrationModule } from '../../core/module.js';
import {
  getScopedSourceRepoNames,
  getScopedTargetRepoName,
  isAssociatedOnlyOrgMode,
  isPublicOnlyTargetScope,
} from '../../core/org-item-filter.js';
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
    'Organization Secrets (Actions, Dependabot, Codespaces, Agents)';
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
      if (domain === 'agents' && response.status !== 200) {
        const fallbackSecrets = await this.discoverOrgAgentSecretsViaRepos(
          ctx.sourceClient,
          ctx.scope.sourceOrg,
          ctx.signal,
        );
        secrets.push(...fallbackSecrets);
        continue;
      }
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
    const associatedOnly = isAssociatedOnlyOrgMode(ctx);
    const scopedSourceRepos = getScopedSourceRepoNames(ctx);
    const publicOnlyScope = isPublicOnlyTargetScope(ctx);

    const needsDynamicResolution =
      associatedOnly ||
      (Object.keys(this.repositoryIdMap).length === 0 &&
        source.secrets.some(
          (s) =>
            s.visibility === 'selected' && s.selectedRepositoryIds.length > 0,
        ));
    const repoMeta = needsDynamicResolution
      ? await this.resolveDynamicRepositoryMetadata(ctx)
      : undefined;
    const dynamicMap = repoMeta?.sourceIdToTargetId;

    for (const rawSecret of source.secrets) {
      let secret = rawSecret;
      if (associatedOnly) {
        if (secret.visibility === 'private' && publicOnlyScope) {
          warnings.push(
            `Skipping ${secret.domain} secret "${secret.name}" (visibility: private) because private organization secrets do not apply to public repositories.`,
          );
          continue;
        }
        if (secret.visibility === 'selected') {
          const filteredSourceIds = secret.selectedRepositoryIds.filter(
            (sourceId) => {
              const sourceName = repoMeta?.sourceIdToName[sourceId];
              if (sourceName) {
                return scopedSourceRepos.has(sourceName);
              }
              return scopedSourceRepos.has(sourceId.toLowerCase());
            },
          );
          if (filteredSourceIds.length === 0) {
            continue;
          }
          secret = {
            ...secret,
            selectedRepositoryIds: filteredSourceIds,
          };
        }
      }

      const current = existing.get(`${secret.domain}:${secret.name}`);
      let desired: OrganizationSecret;

      if (
        associatedOnly &&
        secret.visibility === 'all' &&
        (repoMeta?.scopedTargetRepoIds.length ?? 0) > 0
      ) {
        const mergedTargetIds = [
          ...new Set([
            ...(current?.visibility === 'selected'
              ? current.selectedRepositoryIds
              : []),
            ...(repoMeta?.scopedTargetRepoIds.map(String) ?? []),
          ]),
        ].sort();
        warnings.push(
          `Scoped ${secret.domain} secret "${secret.name}" from visibility "all" to "selected" (${mergedTargetIds.length} repository/repositories) for associated-only migration.`,
        );
        desired = {
          ...secret,
          visibility: 'selected',
          selectedRepositoryIds: mergedTargetIds,
        };
      } else {
        const mappedIds = this.mapped(secret, warnings, dynamicMap).map(String);
        const mergedSelectedIds =
          secret.visibility === 'selected' &&
          (associatedOnly || ctx.scope.isMultiOrgConsolidation) &&
          current?.visibility === 'selected'
            ? [
                ...new Set([...current.selectedRepositoryIds, ...mappedIds]),
              ].sort()
            : mappedIds;
        desired = {
          ...secret,
          selectedRepositoryIds: mergedSelectedIds,
        };
      }

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
        reason:
          operation === 'noop'
            ? `${secret.domain} organization secret (${desired.visibility} visibility) scope matches target; verify secret value is populated.`
            : `${secret.domain} organization secret (${desired.visibility} visibility) requires post-migration secret value population.`,
        payload:
          operation === 'noop'
            ? undefined
            : {
                domain: desired.domain,
                visibility: desired.visibility,
                selected_repository_ids:
                  desired.selectedRepositoryIds.map(Number),
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
        if (
          secret.domain === 'agents' &&
          (key.status === 403 || key.status === 404)
        ) {
          results.push({
            operationId: operation.id,
            status: 'skipped',
            httpStatus: key.status,
            error: `Organization-level Copilot agent secrets API returned HTTP ${key.status} on ${ctx.scope.targetOrg}; configure "${secret.name}" manually in Organization Settings -> Secrets and variables -> Agents.`,
            completedAt: new Date().toISOString(),
          });
          continue;
        }
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
        if (
          secret.domain === 'agents' &&
          (response.status === 403 || response.status === 404)
        ) {
          results.push({
            operationId: operation.id,
            status: 'skipped',
            httpStatus: response.status,
            error: `Organization-level Copilot agent secrets API returned HTTP ${response.status} on ${ctx.scope.targetOrg}; configure "${secret.name}" manually in Organization Settings -> Secrets and variables -> Agents.`,
            completedAt: new Date().toISOString(),
          });
          continue;
        }
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
    const targetInfo = await this.targetWithMeta(ctx);
    const target = new Map(
      targetInfo.secrets.map((secret) => [
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
        expected.domain === 'agents' &&
        !actual &&
        targetInfo.agentsApiUnavailable
      ) {
        continue;
      }
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
    return (await this.targetWithMeta(ctx)).secrets;
  }

  private async targetWithMeta(ctx: MigrationContext): Promise<{
    secrets: OrganizationSecret[];
    agentsApiUnavailable: boolean;
  }> {
    const secrets: OrganizationSecret[] = [];
    let agentsApiUnavailable = false;
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
      if (domain === 'agents' && response.status !== 200) {
        agentsApiUnavailable = true;
        const fallbackSecrets = await this.discoverOrgAgentSecretsViaRepos(
          ctx.targetClient,
          ctx.scope.targetOrg,
          ctx.signal,
        );
        secrets.push(...fallbackSecrets);
        continue;
      }
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
    return { secrets, agentsApiUnavailable };
  }

  private async discoverOrgAgentSecretsViaRepos(
    client: MigrationContext['sourceClient'],
    org: string,
    signal: AbortSignal,
  ): Promise<OrganizationSecret[]> {
    try {
      const reposRes = await client.fetchAll<{
        id?: number;
        name?: string;
        private?: boolean;
        visibility?: string;
        archived?: boolean;
      }>(
        {
          id: 'rest.repos.listForOrg',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}/repos',
          pathParams: { org },
          queryParams: { per_page: 100 },
        },
        signal,
      );
      const repos = (reposRes?.items ?? []).filter(
        (r) => typeof r.name === 'string' && !r.archived,
      );
      const publicRepo = repos.find(
        (r) => r.private === false || r.visibility === 'public',
      );
      const privateRepo = repos.find(
        (r) => r.private === true || r.visibility === 'private',
      );
      const publicNames = new Set<string>();
      const byName = new Map<string, OrganizationSecret>();

      for (const candidate of [publicRepo, privateRepo]) {
        if (!candidate?.name) continue;
        const res = await client.readSingle<RawOrganizationSecretsResponse>(
          {
            id: 'rest.agents.listRepoOrgSecrets',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/agents/organization-secrets',
            pathParams: { owner: org, repo: candidate.name },
          },
          signal,
        );
        if (res.status !== 200) continue;
        const isPub = candidate === publicRepo;
        for (const item of res.data?.secrets ?? []) {
          if (!item.name) continue;
          if (isPub) publicNames.add(item.name);
          if (!byName.has(item.name)) {
            byName.set(item.name, {
              domain: 'agents',
              name: item.name,
              visibility: isPub ? 'all' : 'private',
              selectedRepositoryIds: [],
            });
          }
        }
      }
      return Array.from(byName.values()).map((secret) => ({
        ...secret,
        visibility: publicNames.has(secret.name) ? 'all' : 'private',
      }));
    } catch {
      return [];
    }
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
  private mapped(
    secret: OrganizationSecret,
    warnings: string[],
    dynamicMap?: Readonly<Record<string, number>> | undefined,
  ): number[] {
    if (secret.visibility !== 'selected') return [];
    const mapped: number[] = [];
    for (const sourceId of secret.selectedRepositoryIds) {
      const targetId = this.repositoryIdMap[sourceId] ?? dynamicMap?.[sourceId];
      if (targetId === undefined)
        warnings.push(
          `Selected repository ${sourceId} for ${secret.domain} secret "${secret.name}" has no target repository ID mapping.`,
        );
      else mapped.push(targetId);
    }
    return [...new Set(mapped)].sort((a, b) => a - b);
  }
  private async resolveDynamicRepositoryMetadata(
    ctx: MigrationContext,
  ): Promise<{
    sourceIdToTargetId: Record<string, number>;
    sourceIdToName: Record<string, string>;
    scopedTargetRepoIds: number[];
  }> {
    const sourceIdToTargetId: Record<string, number> = {};
    const sourceIdToName: Record<string, string> = {};
    const scopedTargetRepoIds: number[] = [];
    const scopedSourceRepos = getScopedSourceRepoNames(ctx);
    try {
      const [srcRes, tgtRes] = await Promise.all([
        ctx.sourceClient.fetchAll<{ id?: number; name?: string }>(
          {
            id: 'rest.repos.listForOrg',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/repos',
            pathParams: { org: ctx.scope.sourceOrg },
            queryParams: { per_page: 100 },
          },
          ctx.signal,
        ),
        ctx.targetClient.fetchAll<{ id?: number; name?: string }>(
          {
            id: 'rest.repos.listForOrg',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/repos',
            pathParams: { org: ctx.scope.targetOrg },
            queryParams: { per_page: 100 },
          },
          ctx.signal,
        ),
      ]);
      const targetByName = new Map<string, number>();
      for (const item of tgtRes?.items ?? []) {
        if (typeof item.id === 'number' && typeof item.name === 'string') {
          targetByName.set(item.name.toLowerCase(), item.id);
        }
      }
      for (const item of srcRes?.items ?? []) {
        if (typeof item.id === 'number' && typeof item.name === 'string') {
          const sourceLower = item.name.toLowerCase();
          sourceIdToName[String(item.id)] = sourceLower;
          const mappedTargetName = getScopedTargetRepoName(
            ctx,
            item.name,
          ).toLowerCase();
          const targetId =
            targetByName.get(mappedTargetName) ?? targetByName.get(sourceLower);
          if (targetId !== undefined) {
            sourceIdToTargetId[String(item.id)] = targetId;
            if (scopedSourceRepos.has(sourceLower)) {
              scopedTargetRepoIds.push(targetId);
            }
          }
        }
      }
    } catch {
      // Ignore if repository listing fails; fallback to empty maps
    }
    return {
      sourceIdToTargetId,
      sourceIdToName,
      scopedTargetRepoIds: [...new Set(scopedTargetRepoIds)].sort(
        (a, b) => a - b,
      ),
    };
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
    for (const entity of bundle!.entities) {
      if (entity.kind !== 'configuration-metadata') continue;
      const mappedDomain =
        entity.domain === 'copilot' ? 'agents' : entity.domain;
      if (
        entity.organizationId === org.id &&
        entity.configurationKind === 'secret' &&
        entity.level === 'organization' &&
        REPO_SECRET_DOMAINS.includes(mappedDomain as RepoSecretDomain)
      )
        secrets.push({
          domain: mappedDomain as RepoSecretDomain,
          name: entity.name,
          visibility:
            entity.accessMode === 'private_repositories'
              ? 'private'
              : entity.accessMode === 'selected_repositories'
                ? 'selected'
                : 'all',
          selectedRepositoryIds: entity.selectedRepositoryIds,
        });
    }
    return { organization, secrets };
  }
}
