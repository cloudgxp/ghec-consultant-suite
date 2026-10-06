import {
  MIGRATION_SCHEMA_VERSION,
  type DiscoveryBundle,
} from '@ghec/contracts';
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
  AddCollaboratorPayload,
  CollaboratorPermission,
  CollaboratorsMigrationData,
  CollaboratorsModuleOptions,
  MigrationCollaborator,
  RawApiCollaborator,
} from './types.js';

export class CollaboratorsMigrationModule implements MigrationModule<CollaboratorsMigrationData> {
  readonly id = 'collaborators';
  readonly displayName =
    'Outside Collaborators & Direct Permissions Rehydration';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['gei-repo'];

  private readonly identityMapper: IdentityMappingEngine;

  constructor(options: CollaboratorsModuleOptions = {}) {
    this.identityMapper = new IdentityMappingEngine(
      options.identityMappingConfig,
    );
  }

  /**
   * Discovers direct repository collaborators on source repository.
   */
  async discover(
    ctx: MigrationContext,
    cachedData?: unknown,
  ): Promise<CollaboratorsMigrationData> {
    const repo = ctx.scope.sourceRepo ?? '';
    if (!repo) {
      throw new Error(
        'CollaboratorsMigrationModule requires sourceRepo in migration context.',
      );
    }

    // 1. Cached discovery bundle mode
    if (cachedData && typeof cachedData === 'object') {
      const bundle = cachedData as DiscoveryBundle;
      if (bundle.entities) {
        const repoEntity = bundle.entities.find(
          (e) => e.kind === 'repository' && e.name === repo,
        );
        if (
          repoEntity &&
          'collaborators' in repoEntity &&
          Array.isArray(
            (repoEntity as unknown as { collaborators: unknown[] })
              .collaborators,
          )
        ) {
          const rawCollabs = (
            repoEntity as unknown as { collaborators: RawApiCollaborator[] }
          ).collaborators;
          return {
            repo,
            collaborators: rawCollabs.map(mapApiCollaborator),
          };
        }
      }
    }

    // 2. Live GitHub API query
    try {
      let rawCollabs: RawApiCollaborator[] = [];
      const fetchResult = await ctx.sourceClient.fetchAll<RawApiCollaborator>(
        {
          id: 'rest.repos.listCollaborators',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/collaborators',
          pathParams: { owner: ctx.scope.sourceOrg, repo },
          queryParams: { affiliation: 'direct', per_page: 100 },
        },
        ctx.signal,
      );

      if (fetchResult && Array.isArray(fetchResult.items)) {
        rawCollabs = [...fetchResult.items];
      } else {
        const res = await ctx.sourceClient.readSingle<RawApiCollaborator[]>(
          {
            id: 'rest.repos.listCollaborators',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/collaborators',
            pathParams: { owner: ctx.scope.sourceOrg, repo },
            queryParams: { affiliation: 'direct' },
          },
          ctx.signal,
        );
        if (res.status === 200 && Array.isArray(res.data)) {
          rawCollabs = res.data;
        }
      }

      return {
        repo,
        collaborators: rawCollabs.map(mapApiCollaborator),
      };
    } catch (err) {
      ctx.logger.error(
        `Failed to discover direct collaborators for ${ctx.scope.sourceOrg}/${repo}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  /**
   * Plans collaborator migration by mapping logins and diffing against destination repository.
   */
  async plan(
    ctx: MigrationContext,
    sourceData: CollaboratorsMigrationData,
  ): Promise<ModulePlan> {
    const targetRepo = ctx.scope.targetRepo ?? sourceData.repo;
    const targetIdentifier = `${ctx.scope.targetOrg}/${targetRepo}`;
    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    // Query destination repository direct collaborators
    const targetCollaborators: MigrationCollaborator[] = [];
    try {
      const fetchResult = await ctx.targetClient.fetchAll<RawApiCollaborator>(
        {
          id: 'rest.repos.listCollaborators',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/collaborators',
          pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          queryParams: { affiliation: 'direct', per_page: 100 },
        },
        ctx.signal,
      );

      const items = Array.isArray(fetchResult?.items) ? fetchResult.items : [];
      for (const item of items) {
        targetCollaborators.push(mapApiCollaborator(item));
      }
    } catch {
      try {
        const res = await ctx.targetClient.readSingle<RawApiCollaborator[]>(
          {
            id: 'rest.repos.listCollaborators',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/collaborators',
            pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
            queryParams: { affiliation: 'direct' },
          },
          ctx.signal,
        );
        if (res.status === 200 && Array.isArray(res.data)) {
          for (const item of res.data) {
            targetCollaborators.push(mapApiCollaborator(item));
          }
        }
      } catch {
        warnings.push(
          `Could not query target collaborators on ${targetIdentifier}; assuming empty target.`,
        );
      }
    }

    for (const srcCollab of sourceData.collaborators) {
      const mapping = this.identityMapper.mapLogin(srcCollab.login);
      if (mapping.warning) {
        warnings.push(mapping.warning);
      }

      const targetLogin = mapping.mappedLogin;
      const opId = `collaborator:${targetRepo}:${targetLogin}`;

      const existingTarget = targetCollaborators.find(
        (tc) => tc.login.toLowerCase() === targetLogin.toLowerCase(),
      );

      const payload: AddCollaboratorPayload = {
        permission: srcCollab.permission,
      };

      if (!existingTarget) {
        operations.push({
          id: opId,
          resourceType: 'collaborator',
          resourceName: targetLogin,
          operation: 'create',
          sourceState: srcCollab,
          payload,
          reason: `Collaborator "${targetLogin}" (source: "${srcCollab.login}") is not present on target repository.`,
        });
      } else if (existingTarget.permission !== srcCollab.permission) {
        operations.push({
          id: opId,
          resourceType: 'collaborator',
          resourceName: targetLogin,
          operation: 'update',
          sourceState: srcCollab,
          destinationCurrentState: existingTarget,
          payload,
          reason: `Collaborator "${targetLogin}" permission differs (target: "${existingTarget.permission}", source: "${srcCollab.permission}").`,
        });
      } else {
        operations.push({
          id: opId,
          resourceType: 'collaborator',
          resourceName: targetLogin,
          operation: 'noop',
          sourceState: srcCollab,
          destinationCurrentState: existingTarget,
        });
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

  /**
   * Applies planned collaborator additions or updates.
   */
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
          `[DRY-RUN] Simulating ${op.operation} on collaborator "${op.resourceName}" with permission ${(op.payload as AddCollaboratorPayload)?.permission}`,
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
        if (op.operation === 'create' || op.operation === 'update') {
          const res = await ctx.targetWriteClient!.mutate(
            {
              id: 'rest.repos.addCollaborator',
              method: 'PUT',
              path: '/repos/{owner}/{repo}/collaborators/{username}',
              pathParams: {
                owner: ctx.scope.targetOrg,
                repo: targetRepo,
                username: op.resourceName,
              },
              body: op.payload,
            },
            ctx.signal,
          );

          if (
            (res.status >= 200 && res.status < 300) ||
            res.status === 201 ||
            res.status === 204
          ) {
            results.push({
              operationId: op.id,
              status: 'succeeded',
              httpStatus: res.status,
              completedAt: new Date().toISOString(),
            });
          } else if (res.status === 404) {
            results.push({
              operationId: op.id,
              status: 'failed',
              httpStatus: 404,
              error: `User "${op.resourceName}" does not exist in target enterprise (HTTP 404)`,
              completedAt: new Date().toISOString(),
            });
            if (!ctx.continueOnError) break;
          } else if (res.status === 422) {
            results.push({
              operationId: op.id,
              status: 'failed',
              httpStatus: 422,
              error: `Outside collaborators disallowed by target organization/enterprise policy (HTTP 422)`,
              completedAt: new Date().toISOString(),
            });
            if (!ctx.continueOnError) break;
          } else {
            results.push({
              operationId: op.id,
              status: 'failed',
              httpStatus: res.status,
              error: `GitHub API error adding collaborator (HTTP ${res.status})`,
              completedAt: new Date().toISOString(),
            });
            if (!ctx.continueOnError) break;
          }
        }
      } catch (err) {
        results.push({
          operationId: op.id,
          status: 'failed',
          error: (err as Error).message || 'Unknown network error',
          completedAt: new Date().toISOString(),
        });
        if (!ctx.continueOnError) break;
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

  /**
   * Verifies destination repository direct collaborators.
   */
  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const discrepancies: VerificationDiscrepancy[] = [];

    const targetCollaborators: MigrationCollaborator[] = [];
    try {
      const fetchResult = await ctx.targetClient.fetchAll<RawApiCollaborator>(
        {
          id: 'rest.repos.listCollaborators',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/collaborators',
          pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          queryParams: { affiliation: 'direct', per_page: 100 },
        },
        ctx.signal,
      );

      const items = Array.isArray(fetchResult?.items) ? fetchResult.items : [];
      for (const item of items) {
        targetCollaborators.push(mapApiCollaborator(item));
      }
    } catch {
      try {
        const res = await ctx.targetClient.readSingle<RawApiCollaborator[]>(
          {
            id: 'rest.repos.listCollaborators',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/collaborators',
            pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
            queryParams: { affiliation: 'direct' },
          },
          ctx.signal,
        );
        if (res.status === 200 && Array.isArray(res.data)) {
          for (const item of res.data) {
            targetCollaborators.push(mapApiCollaborator(item));
          }
        }
      } catch (err) {
        discrepancies.push({
          resourceName: targetRepo,
          expected: 'reachable',
          actual: 'unreachable',
          message: `Failed to query target repository collaborators: ${(err as Error).message}`,
        });
        return {
          moduleId: this.id,
          verified: false,
          discrepancies,
        };
      }
    }

    for (const op of plan.operations) {
      if (op.resourceType === 'collaborator' && op.operation !== 'skip') {
        const expectedUser = op.resourceName;
        const expectedPermission =
          (op.payload as AddCollaboratorPayload | undefined)?.permission ??
          (op.sourceState as MigrationCollaborator | undefined)?.permission;

        const matchingTarget = targetCollaborators.find(
          (tc) => tc.login.toLowerCase() === expectedUser.toLowerCase(),
        );

        if (!matchingTarget) {
          discrepancies.push({
            resourceName: expectedUser,
            expected: 'present',
            actual: 'missing',
            message: `Collaborator "${expectedUser}" is missing on target repository.`,
          });
        } else if (
          expectedPermission &&
          matchingTarget.permission !== expectedPermission
        ) {
          discrepancies.push({
            resourceName: expectedUser,
            expected: expectedPermission,
            actual: matchingTarget.permission,
            message: `Collaborator "${expectedUser}" permission mismatch (expected: ${expectedPermission}, actual: ${matchingTarget.permission}).`,
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
}

function mapApiCollaborator(raw: RawApiCollaborator): MigrationCollaborator {
  let permission: CollaboratorPermission = 'pull';

  if (raw.role_name) {
    const role = raw.role_name.toLowerCase();
    if (
      role === 'admin' ||
      role === 'maintain' ||
      role === 'push' ||
      role === 'triage' ||
      role === 'pull'
    ) {
      permission = role as CollaboratorPermission;
    }
  } else if (raw.permissions) {
    if (raw.permissions.admin) permission = 'admin';
    else if (raw.permissions.maintain) permission = 'maintain';
    else if (raw.permissions.push) permission = 'push';
    else if (raw.permissions.triage) permission = 'triage';
    else if (raw.permissions.pull) permission = 'pull';
  }

  return {
    id: raw.id,
    login: raw.login,
    permission,
  };
}
