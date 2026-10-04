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
import { IdentityMappingEngine } from '../teams/identity-mapper.js';
import type {
  DeploymentBranchPolicy,
  DeploymentBranchPolicyRule,
  EnvironmentDefinition,
  EnvironmentReviewer,
  EnvironmentsData,
  EnvironmentsModuleOptions,
  EnvironmentSecret,
  EnvironmentVariable,
  RawGitHubBranchPoliciesResponse,
  RawGitHubEnvironmentItem,
  RawGitHubEnvironmentPublicKeyResponse,
  RawGitHubEnvironmentsResponse,
  RawGitHubEnvironmentSecretsResponse,
  RawGitHubEnvironmentVariablesResponse,
} from './types.js';

async function encryptSecret(
  value: string,
  publicKey: string,
): Promise<string> {
  await sodium.ready;
  const key = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
  const encrypted = sodium.crypto_box_seal(sodium.from_string(value), key);
  return sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);
}

function parseProtectionRules(envItem: RawGitHubEnvironmentItem): {
  waitTimer?: number | undefined;
  preventSelfReview?: boolean | undefined;
  reviewers?: EnvironmentReviewer[] | undefined;
} {
  let waitTimer: number | undefined;
  let preventSelfReview: boolean | undefined;
  const reviewers: EnvironmentReviewer[] = [];

  for (const rule of envItem.protection_rules ?? []) {
    if (rule.type === 'wait_timer' && typeof rule.wait_timer === 'number') {
      waitTimer = rule.wait_timer;
    } else if (rule.type === 'required_reviewers') {
      if (typeof rule.prevent_self_review === 'boolean') {
        preventSelfReview = rule.prevent_self_review;
      }
      for (const r of rule.reviewers ?? []) {
        reviewers.push({
          type: r.type,
          id: r.reviewer.id,
          login: r.reviewer.login,
          slug: r.reviewer.slug,
        });
      }
    }
  }

  return {
    waitTimer,
    preventSelfReview,
    reviewers: reviewers.length > 0 ? reviewers : undefined,
  };
}

export class EnvironmentsMigrationModule implements MigrationModule<EnvironmentsData> {
  readonly id = 'environments';
  readonly displayName =
    'Deployment Environments, Variables & Protection Rules';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['gei-repo'];

  private readonly identityMapper: IdentityMappingEngine;

  constructor(options: EnvironmentsModuleOptions = {}) {
    this.identityMapper =
      options.identityMapper ??
      new IdentityMappingEngine({ strategy: 'pass-through' });
  }

  async discover(
    ctx: MigrationContext,
    cachedData?: unknown,
  ): Promise<EnvironmentsData> {
    const repo = ctx.scope.sourceRepo;
    if (!repo) {
      throw new Error(
        'EnvironmentsMigrationModule requires sourceRepo in migration context.',
      );
    }

    if (cachedData) {
      const cached = this.discoverCached(repo, cachedData);
      if (cached) return cached;
    }

    try {
      const envsResponse =
        await ctx.sourceClient.readSingle<RawGitHubEnvironmentsResponse>(
          {
            id: 'rest.environments.list',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/environments',
            pathParams: { owner: ctx.scope.sourceOrg, repo },
          },
          ctx.signal,
        );

      const environments: EnvironmentDefinition[] = [];

      for (const envItem of envsResponse.data?.environments ?? []) {
        const { waitTimer, preventSelfReview, reviewers } =
          parseProtectionRules(envItem);

        let customBranchPolicies: DeploymentBranchPolicyRule[] | undefined;
        if (envItem.deployment_branch_policy?.custom_branch_policies) {
          try {
            const bpRes =
              await ctx.sourceClient.readSingle<RawGitHubBranchPoliciesResponse>(
                {
                  id: 'rest.environments.listBranchPolicies',
                  transport: 'rest',
                  verifiedReadOnly: true,
                  path: '/repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies',
                  pathParams: {
                    owner: ctx.scope.sourceOrg,
                    repo,
                    environment_name: envItem.name,
                  },
                },
                ctx.signal,
              );
            customBranchPolicies = (bpRes.data?.branch_policies ?? []).map(
              (bp) => ({
                id: bp.id,
                name: bp.name,
                type: bp.type,
              }),
            );
          } catch {
            ctx.logger.warn(
              `Failed to query branch policies for environment "${envItem.name}"`,
            );
          }
        }

        const variables: EnvironmentVariable[] = [];
        try {
          const varRes =
            await ctx.sourceClient.readSingle<RawGitHubEnvironmentVariablesResponse>(
              {
                id: 'rest.environments.listVariables',
                transport: 'rest',
                verifiedReadOnly: true,
                path: '/repos/{owner}/{repo}/environments/{environment_name}/variables',
                pathParams: {
                  owner: ctx.scope.sourceOrg,
                  repo,
                  environment_name: envItem.name,
                },
              },
              ctx.signal,
            );
          for (const v of varRes.data?.variables ?? []) {
            if (v.name) {
              variables.push({
                name: v.name,
                value: v.value ?? '',
                createdAt: v.created_at,
                updatedAt: v.updated_at,
              });
            }
          }
        } catch {
          ctx.logger.warn(
            `Failed to query variables for environment "${envItem.name}"`,
          );
        }

        const secrets: EnvironmentSecret[] = [];
        try {
          const secRes =
            await ctx.sourceClient.readSingle<RawGitHubEnvironmentSecretsResponse>(
              {
                id: 'rest.environments.listSecrets',
                transport: 'rest',
                verifiedReadOnly: true,
                path: '/repos/{owner}/{repo}/environments/{environment_name}/secrets',
                pathParams: {
                  owner: ctx.scope.sourceOrg,
                  repo,
                  environment_name: envItem.name,
                },
              },
              ctx.signal,
            );
          for (const s of secRes.data?.secrets ?? []) {
            if (s.name) {
              secrets.push({
                name: s.name,
                createdAt: s.created_at,
                updatedAt: s.updated_at,
              });
            }
          }
        } catch {
          ctx.logger.warn(
            `Failed to query secrets for environment "${envItem.name}"`,
          );
        }

        environments.push({
          name: envItem.name,
          waitTimer,
          preventSelfReview,
          reviewers,
          deploymentBranchPolicy: envItem.deployment_branch_policy,
          customBranchPolicies,
          variables,
          secrets,
        });
      }

      return { repo, environments };
    } catch (err) {
      ctx.logger.error(
        `Failed to discover environments for ${ctx.scope.sourceOrg}/${repo}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async plan(
    ctx: MigrationContext,
    sourceData: EnvironmentsData,
  ): Promise<ModulePlan> {
    const targetRepo = ctx.scope.targetRepo ?? sourceData.repo;
    const targetIdentifier = `${ctx.scope.targetOrg}/${targetRepo}`;
    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    const targetEnvMap = new Map<string, EnvironmentDefinition>();
    try {
      const envsResponse =
        await ctx.targetClient.readSingle<RawGitHubEnvironmentsResponse>(
          {
            id: 'rest.environments.list',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/environments',
            pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          },
          ctx.signal,
        );

      for (const envItem of envsResponse.data?.environments ?? []) {
        const { waitTimer, preventSelfReview, reviewers } =
          parseProtectionRules(envItem);

        let customBranchPolicies: DeploymentBranchPolicyRule[] | undefined;
        if (envItem.deployment_branch_policy?.custom_branch_policies) {
          try {
            const bpRes =
              await ctx.targetClient.readSingle<RawGitHubBranchPoliciesResponse>(
                {
                  id: 'rest.environments.listBranchPolicies',
                  transport: 'rest',
                  verifiedReadOnly: true,
                  path: '/repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies',
                  pathParams: {
                    owner: ctx.scope.targetOrg,
                    repo: targetRepo,
                    environment_name: envItem.name,
                  },
                },
                ctx.signal,
              );
            customBranchPolicies = (bpRes.data?.branch_policies ?? []).map(
              (bp) => ({
                id: bp.id,
                name: bp.name,
                type: bp.type,
              }),
            );
          } catch {
            // assume empty branch policies
          }
        }

        const variables: EnvironmentVariable[] = [];
        try {
          const varRes =
            await ctx.targetClient.readSingle<RawGitHubEnvironmentVariablesResponse>(
              {
                id: 'rest.environments.listVariables',
                transport: 'rest',
                verifiedReadOnly: true,
                path: '/repos/{owner}/{repo}/environments/{environment_name}/variables',
                pathParams: {
                  owner: ctx.scope.targetOrg,
                  repo: targetRepo,
                  environment_name: envItem.name,
                },
              },
              ctx.signal,
            );
          for (const v of varRes.data?.variables ?? []) {
            if (v.name) {
              variables.push({
                name: v.name,
                value: v.value ?? '',
                createdAt: v.created_at,
                updatedAt: v.updated_at,
              });
            }
          }
        } catch {
          // assume empty variables
        }

        const secrets: EnvironmentSecret[] = [];
        try {
          const secRes =
            await ctx.targetClient.readSingle<RawGitHubEnvironmentSecretsResponse>(
              {
                id: 'rest.environments.listSecrets',
                transport: 'rest',
                verifiedReadOnly: true,
                path: '/repos/{owner}/{repo}/environments/{environment_name}/secrets',
                pathParams: {
                  owner: ctx.scope.targetOrg,
                  repo: targetRepo,
                  environment_name: envItem.name,
                },
              },
              ctx.signal,
            );
          for (const s of secRes.data?.secrets ?? []) {
            if (s.name) {
              secrets.push({
                name: s.name,
                createdAt: s.created_at,
                updatedAt: s.updated_at,
              });
            }
          }
        } catch {
          // assume empty secrets
        }

        targetEnvMap.set(envItem.name, {
          name: envItem.name,
          waitTimer,
          preventSelfReview,
          reviewers,
          deploymentBranchPolicy: envItem.deployment_branch_policy,
          customBranchPolicies,
          variables,
          secrets,
        });
      }
    } catch {
      warnings.push(
        `Could not query target environments on ${targetIdentifier}; assuming empty target.`,
      );
    }

    for (const srcEnv of sourceData.environments) {
      const targetEnv = targetEnvMap.get(srcEnv.name);

      const mappedReviewers: EnvironmentReviewer[] = [];
      for (const r of srcEnv.reviewers ?? []) {
        if (r.type === 'User' && r.login) {
          const mapping = this.identityMapper.mapLogin(r.login);
          if (mapping.status === 'unmapped') {
            warnings.push(
              `Reviewer user "${r.login}" in environment "${srcEnv.name}" could not be mapped to target EMU identity.`,
            );
            mappedReviewers.push({
              ...r,
              mappedLogin: r.login,
            });
          } else {
            mappedReviewers.push({
              ...r,
              mappedLogin: mapping.mappedLogin,
            });
          }
        } else {
          mappedReviewers.push(r);
        }
      }

      const envPayload = {
        name: srcEnv.name,
        waitTimer: srcEnv.waitTimer,
        preventSelfReview: srcEnv.preventSelfReview,
        reviewers: mappedReviewers.length > 0 ? mappedReviewers : undefined,
        deploymentBranchPolicy: srcEnv.deploymentBranchPolicy,
      };

      if (!targetEnv) {
        operations.push({
          id: `environments:${targetRepo}:${srcEnv.name}`,
          resourceType: 'environment',
          resourceName: srcEnv.name,
          operation: 'create',
          sourceState: srcEnv,
          payload: envPayload,
          reason: `Environment "${srcEnv.name}" does not exist in destination.`,
        });
      } else {
        const needsUpdate =
          (srcEnv.waitTimer ?? 0) !== (targetEnv.waitTimer ?? 0) ||
          Boolean(srcEnv.preventSelfReview) !==
            Boolean(targetEnv.preventSelfReview) ||
          JSON.stringify(srcEnv.deploymentBranchPolicy ?? null) !==
            JSON.stringify(targetEnv.deploymentBranchPolicy ?? null) ||
          (srcEnv.reviewers?.length ?? 0) !==
            (targetEnv.reviewers?.length ?? 0);

        operations.push({
          id: `environments:${targetRepo}:${srcEnv.name}`,
          resourceType: 'environment',
          resourceName: srcEnv.name,
          operation: needsUpdate ? 'update' : 'noop',
          sourceState: srcEnv,
          destinationCurrentState: targetEnv,
          payload: needsUpdate ? envPayload : undefined,
          reason: needsUpdate
            ? `Environment "${srcEnv.name}" configuration differs between source and destination.`
            : `Environment "${srcEnv.name}" matches in destination.`,
        });
      }

      if (
        srcEnv.customBranchPolicies &&
        srcEnv.customBranchPolicies.length > 0
      ) {
        const targetPolicies = new Set(
          (targetEnv?.customBranchPolicies ?? []).map((bp) => bp.name),
        );
        for (const bp of srcEnv.customBranchPolicies) {
          const exists = targetPolicies.has(bp.name);
          operations.push({
            id: `environments:${targetRepo}:${srcEnv.name}:branch-policy:${bp.name}`,
            resourceType: 'environment-branch-policy',
            resourceName: `${srcEnv.name}/${bp.name}`,
            operation: exists ? 'noop' : 'create',
            sourceState: bp,
            payload: exists
              ? undefined
              : {
                  environmentName: srcEnv.name,
                  name: bp.name,
                  type: bp.type ?? 'branch',
                },
            reason: exists
              ? `Branch policy "${bp.name}" already exists on target environment "${srcEnv.name}".`
              : `Branch policy "${bp.name}" is missing on target environment "${srcEnv.name}".`,
          });
        }
      }

      const targetVarMap = new Map(
        (targetEnv?.variables ?? []).map((v) => [v.name, v]),
      );
      for (const srcVar of srcEnv.variables ?? []) {
        const targetVar = targetVarMap.get(srcVar.name);
        const opId = `environments:${targetRepo}:${srcEnv.name}:variable:${srcVar.name}`;

        if (!targetVar) {
          operations.push({
            id: opId,
            resourceType: 'environment-variable',
            resourceName: `${srcEnv.name}/${srcVar.name}`,
            operation: 'create',
            sourceState: srcVar,
            payload: {
              environmentName: srcEnv.name,
              name: srcVar.name,
              value: srcVar.value,
            },
            reason: `Variable "${srcVar.name}" is missing on target environment "${srcEnv.name}".`,
          });
        } else if (targetVar.value !== srcVar.value) {
          operations.push({
            id: opId,
            resourceType: 'environment-variable',
            resourceName: `${srcEnv.name}/${srcVar.name}`,
            operation: 'update',
            sourceState: srcVar,
            destinationCurrentState: targetVar,
            payload: {
              environmentName: srcEnv.name,
              name: srcVar.name,
              value: srcVar.value,
            },
            reason: `Variable "${srcVar.name}" value differs on target environment "${srcEnv.name}".`,
          });
        } else {
          operations.push({
            id: opId,
            resourceType: 'environment-variable',
            resourceName: `${srcEnv.name}/${srcVar.name}`,
            operation: 'noop',
            sourceState: srcVar,
            destinationCurrentState: targetVar,
          });
        }
      }

      const targetSecretSet = new Set(
        (targetEnv?.secrets ?? []).map((s) => s.name),
      );
      for (const srcSecret of srcEnv.secrets ?? []) {
        const exists = targetSecretSet.has(srcSecret.name);
        const opId = `environments:${targetRepo}:${srcEnv.name}:secret:${srcSecret.name}`;

        if (!exists) {
          warnings.push(
            `Environment "${srcEnv.name}" secret "${srcSecret.name}" requires post-migration value injection; a client vault value or encrypted blank placeholder will be used.`,
          );
          operations.push({
            id: opId,
            resourceType: 'environment-secret',
            resourceName: `${srcEnv.name}/${srcSecret.name}`,
            operation: 'create',
            sourceState: srcSecret,
            payload: {
              environmentName: srcEnv.name,
              name: srcSecret.name,
              valuePopulation: 'vault-or-blank',
            },
            reason: `Secret "${srcSecret.name}" is missing on target environment "${srcEnv.name}".`,
          });
        } else {
          operations.push({
            id: opId,
            resourceType: 'environment-secret',
            resourceName: `${srcEnv.name}/${srcSecret.name}`,
            operation: 'noop',
            sourceState: srcSecret,
            reason: `Secret "${srcSecret.name}" already exists on target environment "${srcEnv.name}".`,
          });
        }
      }
    }

    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier,
      operations,
      warnings,
    };
  }

  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    const startTime = Date.now();
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const results: OperationExecutionResult[] = [];

    if (!ctx.targetWriteClient && !ctx.dryRun) {
      throw new Error(
        'TargetWriteClient must be provided in MigrationContext to apply mutations.',
      );
    }

    const publicKeyCache = new Map<string, { key_id: string; key: string }>();

    for (const op of plan.operations) {
      const completedAt = new Date().toISOString();

      if (op.operation === 'noop') {
        results.push({
          operationId: op.id,
          status: 'succeeded',
          completedAt,
        });
        continue;
      }

      if (op.operation === 'skip') {
        results.push({
          operationId: op.id,
          status: 'skipped',
          completedAt,
        });
        continue;
      }

      if (ctx.dryRun) {
        ctx.logger.info(
          `[DRY-RUN] Simulating ${op.operation} on ${op.resourceType} ${op.resourceName}`,
        );
        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: 200,
          completedAt,
        });
        continue;
      }

      try {
        if (op.resourceType === 'environment') {
          const payload = op.payload as
            | {
                name: string;
                waitTimer?: number;
                preventSelfReview?: boolean;
                reviewers?: EnvironmentReviewer[];
                deploymentBranchPolicy?: DeploymentBranchPolicy | null;
              }
            | undefined;

          const reviewersBody = payload?.reviewers?.map((r) => ({
            type: r.type,
            id: r.id ?? 0,
          }));

          const res = await ctx.targetWriteClient!.mutate(
            {
              id: 'rest.environments.createOrUpdateEnvironment',
              method: 'PUT',
              path: '/repos/{owner}/{repo}/environments/{environment_name}',
              pathParams: {
                owner: ctx.scope.targetOrg,
                repo: targetRepo,
                environment_name: op.resourceName,
              },
              body: {
                wait_timer: payload?.waitTimer,
                prevent_self_review: payload?.preventSelfReview,
                reviewers:
                  reviewersBody && reviewersBody.length > 0
                    ? reviewersBody
                    : undefined,
                deployment_branch_policy: payload?.deploymentBranchPolicy,
              },
            },
            ctx.signal,
          );

          results.push({
            operationId: op.id,
            status:
              res.status >= 200 && res.status < 300 ? 'succeeded' : 'failed',
            httpStatus: res.status,
            error:
              res.status >= 200 && res.status < 300
                ? undefined
                : `GitHub API error (HTTP ${res.status})`,
            completedAt: new Date().toISOString(),
          });
        } else if (op.resourceType === 'environment-branch-policy') {
          const payload = op.payload as
            | {
                environmentName: string;
                name: string;
                type: 'branch' | 'tag';
              }
            | undefined;

          const res = await ctx.targetWriteClient!.mutate(
            {
              id: 'rest.environments.createBranchPolicy',
              method: 'POST',
              path: '/repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies',
              pathParams: {
                owner: ctx.scope.targetOrg,
                repo: targetRepo,
                environment_name: payload?.environmentName ?? '',
              },
              body: {
                name: payload?.name,
                type: payload?.type ?? 'branch',
              },
            },
            ctx.signal,
          );

          results.push({
            operationId: op.id,
            status:
              res.status >= 200 && res.status < 300 ? 'succeeded' : 'failed',
            httpStatus: res.status,
            error:
              res.status >= 200 && res.status < 300
                ? undefined
                : `GitHub API error (HTTP ${res.status})`,
            completedAt: new Date().toISOString(),
          });
        } else if (op.resourceType === 'environment-variable') {
          const payload = op.payload as
            | {
                environmentName: string;
                name: string;
                value: string;
              }
            | undefined;

          if (op.operation === 'create') {
            const res = await ctx.targetWriteClient!.mutate(
              {
                id: 'rest.environments.createVariable',
                method: 'POST',
                path: '/repos/{owner}/{repo}/environments/{environment_name}/variables',
                pathParams: {
                  owner: ctx.scope.targetOrg,
                  repo: targetRepo,
                  environment_name: payload?.environmentName ?? '',
                },
                body: {
                  name: payload?.name,
                  value: payload?.value,
                },
              },
              ctx.signal,
            );

            results.push({
              operationId: op.id,
              status:
                res.status >= 200 && res.status < 300 ? 'succeeded' : 'failed',
              httpStatus: res.status,
              error:
                res.status >= 200 && res.status < 300
                  ? undefined
                  : `GitHub API error (HTTP ${res.status})`,
              completedAt: new Date().toISOString(),
            });
          } else if (op.operation === 'update') {
            const res = await ctx.targetWriteClient!.mutate(
              {
                id: 'rest.environments.updateVariable',
                method: 'PATCH',
                path: '/repos/{owner}/{repo}/environments/{environment_name}/variables/{name}',
                pathParams: {
                  owner: ctx.scope.targetOrg,
                  repo: targetRepo,
                  environment_name: payload?.environmentName ?? '',
                  name: payload?.name ?? '',
                },
                body: {
                  value: payload?.value,
                },
              },
              ctx.signal,
            );

            results.push({
              operationId: op.id,
              status:
                res.status >= 200 && res.status < 300 ? 'succeeded' : 'failed',
              httpStatus: res.status,
              error:
                res.status >= 200 && res.status < 300
                  ? undefined
                  : `GitHub API error (HTTP ${res.status})`,
              completedAt: new Date().toISOString(),
            });
          }
        } else if (op.resourceType === 'environment-secret') {
          const payload = op.payload as
            | {
                environmentName: string;
                name: string;
              }
            | undefined;

          const envName = payload?.environmentName ?? '';
          const secretName = payload?.name ?? '';

          let pubKey = publicKeyCache.get(envName);
          if (!pubKey) {
            const pkRes =
              await ctx.targetClient.readSingle<RawGitHubEnvironmentPublicKeyResponse>(
                {
                  id: 'rest.environments.getPublicKey',
                  transport: 'rest',
                  verifiedReadOnly: true,
                  path: '/repos/{owner}/{repo}/environments/{environment_name}/secrets/public-key',
                  pathParams: {
                    owner: ctx.scope.targetOrg,
                    repo: targetRepo,
                    environment_name: envName,
                  },
                },
                ctx.signal,
              );

            if (!pkRes.data?.key || !pkRes.data?.key_id) {
              throw new Error(
                `Public key unavailable for target environment "${envName}"`,
              );
            }
            pubKey = { key: pkRes.data.key, key_id: pkRes.data.key_id };
            publicKeyCache.set(envName, pubKey);
          }

          const rawSecretValue =
            (await ctx.secretValueProvider?.getSecretValue({
              domain: 'environment',
              name: secretName,
              sourceOrg: ctx.scope.sourceOrg,
              sourceRepo: ctx.scope.sourceRepo ?? '',
              targetOrg: ctx.scope.targetOrg,
              targetRepo,
              environmentName: envName,
              signal: ctx.signal,
            })) ?? '';

          const encryptedValue = await encryptSecret(
            rawSecretValue,
            pubKey.key,
          );

          const res = await ctx.targetWriteClient!.mutate(
            {
              id: 'rest.environments.createOrUpdateSecret',
              method: 'PUT',
              path: '/repos/{owner}/{repo}/environments/{environment_name}/secrets/{secret_name}',
              pathParams: {
                owner: ctx.scope.targetOrg,
                repo: targetRepo,
                environment_name: envName,
                secret_name: secretName,
              },
              body: {
                encrypted_value: encryptedValue,
                key_id: pubKey.key_id,
              },
            },
            ctx.signal,
          );

          results.push({
            operationId: op.id,
            status:
              res.status >= 200 && res.status < 300 ? 'succeeded' : 'failed',
            httpStatus: res.status,
            error:
              res.status >= 200 && res.status < 300
                ? undefined
                : `GitHub API error (HTTP ${res.status})`,
            completedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        results.push({
          operationId: op.id,
          status: 'failed',
          error: (err as Error).message || 'Unknown network error',
          completedAt: new Date().toISOString(),
        });
      }

      if (results.at(-1)?.status === 'failed' && !ctx.continueOnError) {
        break;
      }
    }

    const hasFailed = results.some((r) => r.status === 'failed');
    const hasSucceeded = results.some((r) => r.status === 'succeeded');
    let overallStatus: ModuleExecutionResult['status'];

    if (!hasFailed && hasSucceeded) {
      overallStatus = 'complete';
    } else if (hasFailed && hasSucceeded) {
      overallStatus = 'partial';
    } else if (hasFailed && !hasSucceeded) {
      overallStatus = 'failed';
    } else {
      overallStatus = 'skipped';
    }

    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status: overallStatus,
      results,
      durationMs: Date.now() - startTime,
    };
  }

  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const discrepancies: VerificationDiscrepancy[] = [];

    const targetEnvMap = new Map<string, EnvironmentDefinition>();
    try {
      const envsResponse =
        await ctx.targetClient.readSingle<RawGitHubEnvironmentsResponse>(
          {
            id: 'rest.environments.list',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/environments',
            pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          },
          ctx.signal,
        );

      for (const envItem of envsResponse.data?.environments ?? []) {
        const { waitTimer, preventSelfReview, reviewers } =
          parseProtectionRules(envItem);

        const variables: EnvironmentVariable[] = [];
        try {
          const varRes =
            await ctx.targetClient.readSingle<RawGitHubEnvironmentVariablesResponse>(
              {
                id: 'rest.environments.listVariables',
                transport: 'rest',
                verifiedReadOnly: true,
                path: '/repos/{owner}/{repo}/environments/{environment_name}/variables',
                pathParams: {
                  owner: ctx.scope.targetOrg,
                  repo: targetRepo,
                  environment_name: envItem.name,
                },
              },
              ctx.signal,
            );
          for (const v of varRes.data?.variables ?? []) {
            if (v.name) {
              variables.push({
                name: v.name,
                value: v.value ?? '',
              });
            }
          }
        } catch {
          // ignore
        }

        const secrets: EnvironmentSecret[] = [];
        try {
          const secRes =
            await ctx.targetClient.readSingle<RawGitHubEnvironmentSecretsResponse>(
              {
                id: 'rest.environments.listSecrets',
                transport: 'rest',
                verifiedReadOnly: true,
                path: '/repos/{owner}/{repo}/environments/{environment_name}/secrets',
                pathParams: {
                  owner: ctx.scope.targetOrg,
                  repo: targetRepo,
                  environment_name: envItem.name,
                },
              },
              ctx.signal,
            );
          for (const s of secRes.data?.secrets ?? []) {
            if (s.name) {
              secrets.push({ name: s.name });
            }
          }
        } catch {
          // ignore
        }

        targetEnvMap.set(envItem.name, {
          name: envItem.name,
          waitTimer,
          preventSelfReview,
          reviewers,
          deploymentBranchPolicy: envItem.deployment_branch_policy,
          variables,
          secrets,
        });
      }
    } catch (err) {
      discrepancies.push({
        resourceName: targetRepo,
        expected: 'reachable',
        actual: 'unreachable',
        message: `Failed to query target repository environments: ${(err as Error).message}`,
      });
      return {
        moduleId: this.id,
        verified: false,
        discrepancies,
      };
    }

    for (const op of plan.operations) {
      if (
        op.operation !== 'create' &&
        op.operation !== 'update' &&
        op.operation !== 'noop'
      ) {
        continue;
      }

      if (op.resourceType === 'environment') {
        const expected = op.sourceState as EnvironmentDefinition | undefined;
        const actual = targetEnvMap.get(op.resourceName);

        if (!actual) {
          discrepancies.push({
            resourceName: op.resourceName,
            expected: 'present',
            actual: 'missing',
            message: `Environment "${op.resourceName}" is missing on target repository.`,
          });
        } else if (
          expected?.waitTimer !== undefined &&
          actual.waitTimer !== expected.waitTimer
        ) {
          discrepancies.push({
            resourceName: `${op.resourceName}:waitTimer`,
            expected: String(expected.waitTimer),
            actual: String(actual.waitTimer ?? 0),
            message: `Environment "${op.resourceName}" waitTimer mismatch.`,
          });
        }
      } else if (op.resourceType === 'environment-variable') {
        const expected = op.sourceState as EnvironmentVariable | undefined;
        const [envName, varName] = op.resourceName.split('/');
        const actualEnv = targetEnvMap.get(envName ?? '');
        const actualVar = actualEnv?.variables?.find((v) => v.name === varName);

        if (!actualVar) {
          discrepancies.push({
            resourceName: op.resourceName,
            expected: expected?.value ?? 'present',
            actual: 'missing',
            message: `Environment variable "${op.resourceName}" is missing on target repository.`,
          });
        } else if (expected && expected.value !== actualVar.value) {
          discrepancies.push({
            resourceName: op.resourceName,
            expected: expected.value,
            actual: actualVar.value,
            message: `Environment variable "${op.resourceName}" value mismatch on target repository.`,
          });
        }
      } else if (op.resourceType === 'environment-secret') {
        const [envName, secretName] = op.resourceName.split('/');
        const actualEnv = targetEnvMap.get(envName ?? '');
        const actualSecret = actualEnv?.secrets?.find(
          (s) => s.name === secretName,
        );

        if (!actualSecret) {
          discrepancies.push({
            resourceName: op.resourceName,
            expected: 'present',
            actual: 'missing',
            message: `Environment secret "${op.resourceName}" is missing on target repository.`,
          });
        }
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
    cachedData: unknown,
  ): EnvironmentsData | undefined {
    const bundle = cachedData as DiscoveryBundle | undefined;
    const repoEntity = bundle?.entities?.find(
      (e) => e.kind === 'repository' && e.name === repo,
    );
    if (!repoEntity) return undefined;

    const envEntities = bundle!.entities.filter(
      (e) =>
        e.kind === 'action-environment' && e.repositoryId === repoEntity.id,
    );

    const environments: EnvironmentDefinition[] = [];

    for (const envEnt of envEntities) {
      if (envEnt.kind !== 'action-environment') continue;

      let deploymentBranchPolicy: DeploymentBranchPolicy | null = null;
      if (envEnt.deploymentBranchPolicy === 'protected') {
        deploymentBranchPolicy = {
          protected_branches: true,
          custom_branch_policies: false,
        };
      } else if (envEnt.deploymentBranchPolicy === 'selected') {
        deploymentBranchPolicy = {
          protected_branches: false,
          custom_branch_policies: true,
        };
      } else if (envEnt.deploymentBranchPolicy === 'all') {
        deploymentBranchPolicy = {
          protected_branches: false,
          custom_branch_policies: false,
        };
      }

      const variables: EnvironmentVariable[] = [];
      const secrets: EnvironmentSecret[] = [];

      for (const ent of bundle!.entities) {
        if (
          ent.kind === 'configuration-metadata' &&
          ent.level === 'environment' &&
          ent.repositoryId === repoEntity.id &&
          ent.environmentName === envEnt.name
        ) {
          if (ent.configurationKind === 'variable') {
            variables.push({
              name: ent.name,
              value: '',
              createdAt: ent.createdAt ?? undefined,
              updatedAt: ent.updatedAt ?? undefined,
            });
          } else if (ent.configurationKind === 'secret') {
            secrets.push({
              name: ent.name,
              createdAt: ent.createdAt ?? undefined,
              updatedAt: ent.updatedAt ?? undefined,
            });
          }
        }
      }

      environments.push({
        name: envEnt.name,
        deploymentBranchPolicy,
        variables,
        secrets,
      });
    }

    return { repo, environments };
  }
}
