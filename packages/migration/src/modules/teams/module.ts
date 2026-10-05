import {
  MIGRATION_SCHEMA_VERSION,
  type DiscoveryBundle,
  type ModuleExecutionResult,
  type ModulePlan,
  type ModuleVerificationResult,
  type OperationExecutionResult,
  type PlannedOperation,
  type VerificationDiscrepancy,
} from '@ghec/contracts';
import type { MigrationModule } from '../../core/module.js';
import type {
  MigrationContext,
  MigrationScopeLevel,
  TargetWriteOperation,
} from '../../core/types.js';
import type {
  TeamDefinition,
  TeamPrivacy,
  TeamRepoPermission,
  TeamRepositoryAccess,
  TeamsMigrationData,
} from './types.js';

interface RawGitHubTeam {
  readonly id?: number | undefined;
  readonly slug: string;
  readonly name: string;
  readonly description?: string | null | undefined;
  readonly privacy?: 'closed' | 'secret' | string | undefined;
  readonly parent?:
    | { readonly slug?: string | undefined; readonly id?: number | undefined }
    | null
    | undefined;
  readonly members_count?: number | undefined;
}

interface RawTeamRepo {
  readonly name: string;
  readonly permissions?:
    | {
        readonly admin?: boolean | undefined;
        readonly maintain?: boolean | undefined;
        readonly push?: boolean | undefined;
        readonly triage?: boolean | undefined;
        readonly pull?: boolean | undefined;
      }
    | undefined;
  readonly role_name?: string | undefined;
}

/**
 * Topologically sorts teams so that parent teams always appear before child teams.
 */
export function sortTeamsTopologically(
  teams: readonly TeamDefinition[],
): TeamDefinition[] {
  const result: TeamDefinition[] = [];
  const teamBySlug = new Map(teams.map((t) => [t.slug, t]));
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(team: TeamDefinition) {
    if (visited.has(team.slug)) return;
    if (visiting.has(team.slug)) {
      // Cycle detected, break to avoid infinite loop
      return;
    }
    visiting.add(team.slug);
    if (team.parentSlug && teamBySlug.has(team.parentSlug)) {
      visit(teamBySlug.get(team.parentSlug)!);
    }
    visiting.delete(team.slug);
    visited.add(team.slug);
    result.push(team);
  }

  for (const team of teams) {
    visit(team);
  }
  return result;
}

/**
 * Maps GitHub permission flags to a normalized permission string.
 */
export function deriveTeamRepoPermission(
  repo: RawTeamRepo,
): TeamRepoPermission {
  if (repo.role_name) {
    const role = repo.role_name.toLowerCase();
    if (role === 'admin') return 'admin';
    if (role === 'maintain') return 'maintain';
    if (role === 'write' || role === 'push') return 'push';
    if (role === 'triage') return 'triage';
    if (role === 'read' || role === 'pull') return 'pull';
  }
  const perms = repo.permissions;
  if (perms?.admin) return 'admin';
  if (perms?.maintain) return 'maintain';
  if (perms?.push) return 'push';
  if (perms?.triage) return 'triage';
  return 'pull';
}

export class TeamsMigrationModule implements MigrationModule<TeamsMigrationData> {
  readonly id = 'teams';
  readonly displayName = 'Teams, Access Permissions & IdP Sync Blueprint';
  readonly scopeLevel: MigrationScopeLevel = 'organization';
  readonly dependencies: readonly string[] = ['gei-repo'];

  async discover(
    ctx: MigrationContext,
    cachedData?: DiscoveryBundle | unknown,
  ): Promise<TeamsMigrationData> {
    const sourceOrg = ctx.scope.sourceOrg;
    const teamSlugMap: Record<string, string> = {};

    // 1. Cached discovery bundle mode
    if (
      cachedData &&
      typeof cachedData === 'object' &&
      'entities' in cachedData
    ) {
      const bundle = cachedData as DiscoveryBundle;
      const teamEntities = bundle.entities.filter((e) => e.kind === 'team');

      if (teamEntities.length > 0) {
        // Map repo ID to repo name if repositories exist in bundle
        const repoIdToName = new Map<string, string>();
        for (const entity of bundle.entities) {
          if (entity.kind === 'repository') {
            repoIdToName.set(entity.id, entity.name);
          }
        }

        // Map team ID to team slug
        const teamIdToSlug = new Map<string, string>();
        for (const entity of teamEntities) {
          if (entity.kind === 'team') {
            const slug = entity.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
            teamIdToSlug.set(entity.id, slug);
          }
        }

        const teams: TeamDefinition[] = [];
        for (const entity of teamEntities) {
          if (entity.kind === 'team') {
            const slug =
              teamIdToSlug.get(entity.id) ??
              entity.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
            teamSlugMap[slug] = slug;

            const parentSlug = entity.parentTeamId
              ? teamIdToSlug.get(entity.parentTeamId)
              : undefined;

            const repositoryAccess: TeamRepositoryAccess[] = [];
            for (const access of entity.repositoryAccess) {
              const repoName =
                repoIdToName.get(access.repositoryId) ?? access.repositoryId;
              let perm: TeamRepoPermission = 'pull';
              if (access.permission === 'admin') {
                perm = 'admin';
              } else if (access.permission === 'maintain') {
                perm = 'maintain';
              } else if (access.permission === 'write') {
                perm = 'push';
              } else if (access.permission === 'triage') {
                perm = 'triage';
              }

              repositoryAccess.push({
                repositoryName: repoName,
                permission: perm,
              });
            }

            teams.push({
              slug,
              name: entity.name,
              privacy: 'closed',
              parentSlug,
              membershipCount: entity.membershipCount.value ?? 0,
              repositoryAccess,
            });
          }
        }

        return {
          teams: sortTeamsTopologically(teams),
          teamSlugMap,
        };
      }
    }

    // 2. Live REST discovery mode
    const teams: TeamDefinition[] = [];
    try {
      const teamsRes = await ctx.sourceClient.fetchAll<RawGitHubTeam>(
        {
          id: 'rest.teams.list',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}/teams',
          pathParams: { org: sourceOrg },
          queryParams: { per_page: 100 },
        },
        ctx.signal,
      );

      for (const raw of teamsRes.items) {
        teamSlugMap[raw.slug] = raw.slug;

        // Fetch repo access for team
        let repositoryAccess: TeamRepositoryAccess[] = [];
        try {
          const reposRes = await ctx.sourceClient.fetchAll<RawTeamRepo>(
            {
              id: 'rest.teams.listRepos',
              transport: 'rest',
              verifiedReadOnly: true,
              path: '/orgs/{org}/teams/{team_slug}/repos',
              pathParams: { org: sourceOrg, team_slug: raw.slug },
              queryParams: { per_page: 100 },
            },
            ctx.signal,
          );

          repositoryAccess = reposRes.items.map((r) => ({
            repositoryName: r.name,
            permission: deriveTeamRepoPermission(r),
          }));
        } catch (err) {
          ctx.logger.warn?.(
            `Could not query repositories for team '${raw.slug}': ${String(err)}`,
          );
        }

        teams.push({
          id: raw.id,
          slug: raw.slug,
          name: raw.name,
          description: raw.description ?? undefined,
          privacy: (raw.privacy as TeamPrivacy) ?? 'closed',
          parentSlug: raw.parent?.slug ?? undefined,
          parentTeamId: raw.parent?.id ?? undefined,
          membershipCount: raw.members_count ?? 0,
          repositoryAccess,
        });
      }
    } catch (err) {
      ctx.logger.warn?.(
        `Failed to list teams for ${sourceOrg}: ${String(err)}`,
      );
    }

    // Read default repository permission
    let defaultRepositoryPermission: string | undefined;
    try {
      const orgRes = await ctx.sourceClient.readSingle<{
        default_repository_permission?: string;
      }>(
        {
          id: 'rest.orgs.get',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}',
          pathParams: { org: sourceOrg },
        },
        ctx.signal,
      );
      defaultRepositoryPermission = orgRes.data?.default_repository_permission;
    } catch {
      // Non-fatal if organization details cannot be read
    }

    return {
      teams: sortTeamsTopologically(teams),
      defaultRepositoryPermission,
      teamSlugMap,
    };
  }

  async plan(
    ctx: MigrationContext,
    data: TeamsMigrationData,
  ): Promise<ModulePlan> {
    const targetOrg = ctx.scope.targetOrg;
    const operations: PlannedOperation[] = [];

    // Query target organization teams
    const targetTeamsBySlug = new Map<string, RawGitHubTeam>();
    try {
      const targetRes = await ctx.targetClient.fetchAll<RawGitHubTeam>(
        {
          id: 'rest.teams.listTarget',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}/teams',
          pathParams: { org: targetOrg },
          queryParams: { per_page: 100 },
        },
        ctx.signal,
      );
      for (const t of targetRes.items) {
        targetTeamsBySlug.set(t.slug, t);
      }
    } catch {
      // Target may be fresh with no teams
    }

    // Topologically sort teams: parents MUST be planned/created before children
    const sortedTeams = sortTeamsTopologically(data.teams);

    for (const team of sortedTeams) {
      const targetTeam = targetTeamsBySlug.get(team.slug);

      if (!targetTeam) {
        operations.push({
          id: `op-team-create-${team.slug}`,
          resourceType: 'team',
          resourceName: team.slug,
          operation: 'create',
          sourceState: team,
          destinationCurrentState: undefined,
          reason: `Recreating team '${team.name}' (parent: ${team.parentSlug ?? 'none'})`,
        });
      } else {
        // Check for privacy or description updates
        const needsUpdate =
          (team.description && team.description !== targetTeam.description) ||
          team.privacy !== targetTeam.privacy;

        if (needsUpdate) {
          operations.push({
            id: `op-team-update-${team.slug}`,
            resourceType: 'team',
            resourceName: team.slug,
            operation: 'update',
            sourceState: team,
            destinationCurrentState: targetTeam,
            reason: `Aligning team settings for '${team.name}'`,
          });
        } else {
          operations.push({
            id: `op-team-noop-${team.slug}`,
            resourceType: 'team',
            resourceName: team.slug,
            operation: 'noop',
            sourceState: team,
            destinationCurrentState: targetTeam,
            reason: `Team '${team.name}' already configured with matching settings`,
          });
        }
      }

      // Plan repository access bindings
      for (const access of team.repositoryAccess) {
        // If scope is repository-level, filter to scoped repository only
        if (
          ctx.scope.level === 'repository' &&
          ctx.scope.sourceRepo &&
          access.repositoryName !== ctx.scope.sourceRepo
        ) {
          continue;
        }

        const targetRepo =
          ctx.scope.targetRepo && access.repositoryName === ctx.scope.sourceRepo
            ? ctx.scope.targetRepo
            : access.repositoryName;

        operations.push({
          id: `op-team-perm-${team.slug}-${targetRepo}`,
          resourceType: 'team-repo-permission',
          resourceName: `${team.slug}:${targetRepo}`,
          operation: 'update',
          sourceState: {
            teamSlug: team.slug,
            repositoryName: targetRepo,
            permission: access.permission,
          },
          destinationCurrentState: undefined,
          reason: `Binding '${access.permission}' permission for team '${team.slug}' on '${targetRepo}'`,
        });
      }
    }

    // Plan base organization default repository permission alignment if present
    if (data.defaultRepositoryPermission) {
      operations.push({
        id: 'op-org-base-permission',
        resourceType: 'org-permission',
        resourceName: targetOrg,
        operation: 'update',
        sourceState: {
          default_repository_permission: data.defaultRepositoryPermission,
        },
        destinationCurrentState: undefined,
        reason: `Aligning default repository permission to '${data.defaultRepositoryPermission}'`,
      });
    }

    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier: targetOrg,
      operations,
      warnings: [],
    };
  }

  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    const startTime = Date.now();
    const results: OperationExecutionResult[] = [];
    const targetOrg = ctx.scope.targetOrg;

    // Track created team IDs in-flight to link child teams to parent_team_id
    const teamIdBySlug = new Map<string, number>();

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
        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: 200,
          completedAt,
        });
        continue;
      }

      if (!ctx.targetWriteClient) {
        throw new Error(
          `Cannot apply operation '${op.id}' without targetWriteClient`,
        );
      }

      try {
        if (op.resourceType === 'team' && op.operation === 'create') {
          const team = op.sourceState as TeamDefinition;
          let parentTeamId = team.parentTeamId;
          if (team.parentSlug && teamIdBySlug.has(team.parentSlug)) {
            parentTeamId = teamIdBySlug.get(team.parentSlug);
          }

          const payload: Record<string, unknown> = {
            name: team.name,
            privacy: team.privacy,
            ...(team.description ? { description: team.description } : {}),
            ...(parentTeamId !== undefined
              ? { parent_team_id: parentTeamId }
              : {}),
          };

          const writeOp: TargetWriteOperation = {
            id: `mutate-${op.id}`,
            method: 'POST',
            path: '/orgs/{org}/teams',
            pathParams: { org: targetOrg },
            body: payload,
          };

          const res = await ctx.targetWriteClient.mutate<{
            id: number;
            slug: string;
          }>(writeOp, ctx.signal);

          if (res.data?.id && res.data?.slug) {
            teamIdBySlug.set(res.data.slug, res.data.id);
            teamIdBySlug.set(team.slug, res.data.id);
          }

          results.push({
            operationId: op.id,
            status: 'succeeded',
            httpStatus: res.status,
            completedAt: new Date().toISOString(),
          });
        } else if (op.resourceType === 'team' && op.operation === 'update') {
          const team = op.sourceState as TeamDefinition;
          const payload: Record<string, unknown> = {
            name: team.name,
            privacy: team.privacy,
            ...(team.description ? { description: team.description } : {}),
          };

          const writeOp: TargetWriteOperation = {
            id: `mutate-${op.id}`,
            method: 'PATCH',
            path: '/orgs/{org}/teams/{team_slug}',
            pathParams: { org: targetOrg, team_slug: team.slug },
            body: payload,
          };

          const res = await ctx.targetWriteClient.mutate(writeOp, ctx.signal);

          results.push({
            operationId: op.id,
            status: 'succeeded',
            httpStatus: res.status,
            completedAt: new Date().toISOString(),
          });
        } else if (op.resourceType === 'team-repo-permission') {
          const permState = op.sourceState as {
            teamSlug: string;
            repositoryName: string;
            permission: TeamRepoPermission;
          };

          const writeOp: TargetWriteOperation = {
            id: `mutate-${op.id}`,
            method: 'PUT',
            path: '/orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}',
            pathParams: {
              org: targetOrg,
              team_slug: permState.teamSlug,
              owner: targetOrg,
              repo: permState.repositoryName,
            },
            body: { permission: permState.permission },
          };

          try {
            const res = await ctx.targetWriteClient.mutate(writeOp, ctx.signal);

            results.push({
              operationId: op.id,
              status: 'succeeded',
              httpStatus: res.status,
              completedAt: new Date().toISOString(),
            });
          } catch (err: unknown) {
            const errMsg = (err as Error).message || String(err);
            if (errMsg.includes('404') || errMsg.includes('Not Found')) {
              ctx.logger?.warn?.(
                `Skipping team permission binding for '${permState.teamSlug}' on '${permState.repositoryName}': target repository does not exist on '${targetOrg}' yet.`,
              );
              results.push({
                operationId: op.id,
                status: 'skipped',
                httpStatus: 404,
                completedAt: new Date().toISOString(),
              });
            } else {
              throw err;
            }
          }
        } else if (op.resourceType === 'org-permission') {
          const permState = op.sourceState as {
            default_repository_permission: string;
          };

          const writeOp: TargetWriteOperation = {
            id: `mutate-${op.id}`,
            method: 'PATCH',
            path: '/orgs/{org}',
            pathParams: { org: targetOrg },
            body: {
              default_repository_permission:
                permState.default_repository_permission,
            },
          };

          const res = await ctx.targetWriteClient.mutate(writeOp, ctx.signal);

          results.push({
            operationId: op.id,
            status: 'succeeded',
            httpStatus: res.status,
            completedAt: new Date().toISOString(),
          });
        } else {
          results.push({
            operationId: op.id,
            status: 'succeeded',
            completedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        results.push({
          operationId: op.id,
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: (err as Error).message || String(err),
        });

        if (!ctx.continueOnError) {
          break;
        }
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
    const targetOrg = ctx.scope.targetOrg;
    const discrepancies: VerificationDiscrepancy[] = [];

    // Query target teams
    const targetTeamsBySlug = new Map<string, RawGitHubTeam>();
    try {
      const targetRes = await ctx.targetClient.fetchAll<RawGitHubTeam>(
        {
          id: 'rest.teams.listVerify',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}/teams',
          pathParams: { org: targetOrg },
          queryParams: { per_page: 100 },
        },
        ctx.signal,
      );
      for (const t of targetRes.items) {
        targetTeamsBySlug.set(t.slug, t);
      }
    } catch (err) {
      discrepancies.push({
        resourceName: targetOrg,
        expected: 'target teams accessible',
        actual: `Failed to query target teams: ${(err as Error).message || String(err)}`,
        message: `Failed to query target teams: ${(err as Error).message || String(err)}`,
      });
      return {
        moduleId: this.id,
        verified: false,
        discrepancies,
      };
    }

    for (const op of plan.operations) {
      if (op.operation === 'noop' || op.operation === 'skip') {
        continue;
      }

      if (op.resourceType === 'team') {
        const team = op.sourceState as TeamDefinition;
        const targetTeam = targetTeamsBySlug.get(team.slug);

        if (!targetTeam) {
          discrepancies.push({
            resourceName: team.slug,
            expected: `Team '${team.slug}' to exist in target organization`,
            actual: 'missing',
            message: `Team '${team.slug}' is missing in target organization`,
          });
        } else if (team.privacy !== targetTeam.privacy) {
          discrepancies.push({
            resourceName: team.slug,
            expected: team.privacy,
            actual: targetTeam.privacy ?? 'unknown',
            message: `Team '${team.slug}' privacy mismatch: expected ${team.privacy}, found ${targetTeam.privacy}`,
          });
        }
      } else if (op.resourceType === 'team-repo-permission') {
        const permState = op.sourceState as {
          teamSlug: string;
          repositoryName: string;
          permission: TeamRepoPermission;
        };

        try {
          const permRes = await ctx.targetClient.readSingle<RawTeamRepo>(
            {
              id: 'rest.teams.getRepoPerm',
              transport: 'rest',
              verifiedReadOnly: true,
              path: '/orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}',
              pathParams: {
                org: targetOrg,
                team_slug: permState.teamSlug,
                owner: targetOrg,
                repo: permState.repositoryName,
              },
            },
            ctx.signal,
          );

          const actualPerm = permRes.data
            ? deriveTeamRepoPermission(permRes.data)
            : null;
          if (!actualPerm || actualPerm !== permState.permission) {
            discrepancies.push({
              resourceName: `${permState.teamSlug}:${permState.repositoryName}`,
              expected: permState.permission,
              actual: actualPerm ?? 'missing',
              message: `Permission mismatch for team '${permState.teamSlug}' on '${permState.repositoryName}': expected ${permState.permission}, found ${actualPerm}`,
            });
          }
        } catch {
          discrepancies.push({
            resourceName: `${permState.teamSlug}:${permState.repositoryName}`,
            expected: permState.permission,
            actual: 'permission not found on target repository',
            message: `Permission not found on target repository '${permState.repositoryName}' for team '${permState.teamSlug}'`,
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
