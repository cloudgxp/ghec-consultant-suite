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
import {
  assertFetchAllOk,
  formatSanitizedReadError,
  isExpectedFeatureAbsentError,
} from '../../core/read-error-classifier.js';
import type {
  MigrationContext,
  MigrationScopeLevel,
  TargetWriteOperation,
} from '../../core/types.js';
import { IdentityMappingEngine } from './identity-mapper.js';
import type {
  TeamDefinition,
  TeamManagementConfig,
  TeamMember,
  TeamOrgRoleBinding,
  TeamPrivacy,
  TeamRepoPermission,
  TeamRepositoryAccess,
  TeamsMigrationData,
  TeamsModuleOptions,
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
 * Maps GitHub permission flags to a normalized permission string or preserves custom role.
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
    return repo.role_name;
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
  readonly dependencies: readonly string[] = ['gei-repo', 'custom-roles'];

  private readonly identityMapper: IdentityMappingEngine;
  private readonly hasExplicitIdentityConfig: boolean;
  private readonly teamManagement?: TeamManagementConfig | undefined;

  constructor(options: TeamsModuleOptions = {}) {
    this.hasExplicitIdentityConfig =
      options.identityMappingConfig !== undefined;
    this.identityMapper = new IdentityMappingEngine(
      options.identityMappingConfig,
    );
    this.teamManagement = options.teamManagement;
  }

  private getIdentityMapper(ctx: MigrationContext): IdentityMappingEngine {
    if (!this.hasExplicitIdentityConfig && ctx.scope.identityMapping) {
      return new IdentityMappingEngine(ctx.scope.identityMapping);
    }
    return this.identityMapper;
  }

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
    const securityManagerTeamSlugs = new Set<string>();
    const teamCustomOrgRoles = new Map<
      string,
      Array<{ roleName: string; roleId?: number }>
    >();
    try {
      const rolesRes = await ctx.sourceClient.readSingle<unknown>(
        {
          id: 'rest.orgs.listOrgRoles',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}/organization-roles',
          pathParams: { org: sourceOrg },
        },
        ctx.signal,
      );
      const roles =
        rolesRes.data &&
        typeof rolesRes.data === 'object' &&
        'roles' in rolesRes.data &&
        Array.isArray((rolesRes.data as { roles: unknown }).roles)
          ? (rolesRes.data as { roles: Array<{ id: number; name: string }> })
              .roles
          : Array.isArray(rolesRes.data)
            ? (rolesRes.data as Array<{ id: number; name: string }>)
            : [];

      for (const role of roles) {
        if (!role.id || !role.name) continue;
        try {
          const roleTeamsRes = await ctx.sourceClient.readSingle<unknown>(
            {
              id: 'rest.orgs.listOrgRoleTeams',
              transport: 'rest',
              verifiedReadOnly: true,
              path: '/orgs/{org}/organization-roles/{role_id}/teams',
              pathParams: { org: sourceOrg, role_id: String(role.id) },
            },
            ctx.signal,
          );
          const teamsInRole = Array.isArray(roleTeamsRes.data)
            ? (roleTeamsRes.data as Array<{ slug?: string }>)
            : [];
          const isSecurityManagerRole =
            role.name.toLowerCase() === 'security_manager';
          for (const t of teamsInRole) {
            if (!t.slug) continue;
            if (isSecurityManagerRole) {
              securityManagerTeamSlugs.add(t.slug);
            } else {
              const existing = teamCustomOrgRoles.get(t.slug) ?? [];
              existing.push({ roleName: role.name, roleId: role.id });
              teamCustomOrgRoles.set(t.slug, existing);
            }
          }
        } catch {
          // Non-fatal per role
        }
      }
    } catch {
      // Non-fatal if organization roles are unsupported or empty
    }

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
      assertFetchAllOk(teamsRes, `/orgs/${sourceOrg}/teams`);

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

        const isNonIdp =
          this.teamManagement?.defaultMode === 'native' ||
          this.teamManagement?.migrateMembers === true ||
          (this.teamManagement?.nonIdpTeams?.includes('*') ?? false) ||
          (this.teamManagement?.nonIdpTeams?.includes(raw.slug) ?? false);

        let members: TeamMember[] = [];
        if (isNonIdp) {
          try {
            const membersRes = await ctx.sourceClient.fetchAll<{
              login: string;
              role?: 'member' | 'maintainer';
            }>(
              {
                id: 'rest.teams.listMembers',
                transport: 'rest',
                verifiedReadOnly: true,
                path: '/orgs/{org}/teams/{team_slug}/members',
                pathParams: { org: sourceOrg, team_slug: raw.slug },
                queryParams: { per_page: 100 },
              },
              ctx.signal,
            );
            members = membersRes.items.map((m) => ({
              login: m.login,
              role: m.role ?? 'member',
            }));
          } catch (err) {
            ctx.logger.warn?.(
              `Could not query members for non-IdP team '${raw.slug}': ${String(err)}`,
            );
          }
        }

        const orgRoles: TeamOrgRoleBinding[] = [];
        if (securityManagerTeamSlugs.has(raw.slug)) {
          orgRoles.push({
            roleType: 'security_manager',
            roleName: 'security_manager',
          });
        }
        const customRoles = teamCustomOrgRoles.get(raw.slug) ?? [];
        for (const cr of customRoles) {
          orgRoles.push({
            roleType: 'custom_org_role',
            roleName: cr.roleName,
            roleId: cr.roleId,
          });
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
          orgRoles: orgRoles.length > 0 ? orgRoles : undefined,
          members: members.length > 0 ? members : undefined,
          isIdpManaged: !isNonIdp,
        });
      }
    } catch (err: unknown) {
      if (isExpectedFeatureAbsentError(err)) {
        ctx.logger.warn?.(
          `Teams not available for ${sourceOrg}: ${formatSanitizedReadError(err)}`,
        );
      } else {
        const msg = formatSanitizedReadError(
          `Failed to list teams for ${sourceOrg}`,
          err,
        );
        ctx.logger.error?.(msg);
        throw new Error(msg, { cause: err });
      }
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
    const warnings: string[] = [];

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

      // Plan team organization roles (Security Manager, Custom Org Roles)
      if (team.orgRoles && team.orgRoles.length > 0) {
        for (const orgRole of team.orgRoles) {
          if (orgRole.roleType === 'security_manager') {
            operations.push({
              id: `op-team-org-secman-${team.slug}`,
              resourceType: 'team-org-role',
              resourceName: `${team.slug}:security_manager`,
              operation: 'create',
              sourceState: {
                teamSlug: team.slug,
                roleType: 'security_manager',
              },
              destinationCurrentState: undefined,
              reason: `Granting Security Manager organization role to team '${team.slug}'`,
            });
          } else if (orgRole.roleType === 'custom_org_role') {
            operations.push({
              id: `op-team-org-custom-${team.slug}-${orgRole.roleName}`,
              resourceType: 'team-org-role',
              resourceName: `${team.slug}:${orgRole.roleName}`,
              operation: 'create',
              sourceState: {
                teamSlug: team.slug,
                roleType: 'custom_org_role',
                roleName: orgRole.roleName,
              },
              destinationCurrentState: undefined,
              reason: `Assigning custom organization role '${orgRole.roleName}' to team '${team.slug}'`,
            });
          }
        }
      }

      // Plan team memberships for non-IdP teams
      if (team.members && team.members.length > 0) {
        const activeMapper = this.getIdentityMapper(ctx);
        for (const member of team.members) {
          const mapping = activeMapper.mapLogin(member.login);
          if (mapping.warning) {
            warnings.push(mapping.warning);
          }
          const targetLogin = mapping.mappedLogin;
          operations.push({
            id: `op-team-member-${team.slug}-${targetLogin}`,
            resourceType: 'team-member',
            resourceName: `${team.slug}:${targetLogin}`,
            operation: 'create',
            sourceState: {
              teamSlug: team.slug,
              username: targetLogin,
              role: member.role,
            },
            destinationCurrentState: undefined,
            reason: `Adding mapped EMU member '${targetLogin}' to team '${team.slug}' as '${member.role}'`,
          });
        }
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
      warnings,
    };
  }

  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    const startTime = Date.now();
    const results: OperationExecutionResult[] = [];
    const targetOrg = ctx.scope.targetOrg;

    // Track created and existing target team IDs in-flight to link child teams to parent_team_id
    const teamIdBySlug = new Map<string, number>();

    for (const op of plan.operations) {
      const completedAt = new Date().toISOString();

      if (op.resourceType === 'team') {
        const destTeam = op.destinationCurrentState as
          { id?: number; slug?: string } | undefined;
        if (typeof destTeam?.id === 'number') {
          if (destTeam.slug) teamIdBySlug.set(destTeam.slug, destTeam.id);
          teamIdBySlug.set(op.resourceName, destTeam.id);
        }
      }

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
          let parentTeamId = team.parentSlug
            ? teamIdBySlug.get(team.parentSlug)
            : team.parentTeamId;

          if (team.parentSlug && parentTeamId === undefined) {
            try {
              const targetRes = await ctx.targetClient.fetchAll<RawGitHubTeam>(
                {
                  id: 'rest.teams.listTargetForParent',
                  transport: 'rest',
                  verifiedReadOnly: true,
                  path: '/orgs/{org}/teams',
                  pathParams: { org: targetOrg },
                  queryParams: { per_page: 100 },
                },
                ctx.signal,
              );
              for (const t of targetRes.items) {
                if (typeof t.id === 'number') {
                  teamIdBySlug.set(t.slug, t.id);
                }
              }
              parentTeamId = teamIdBySlug.get(team.parentSlug);
            } catch {
              // Ignore lookup failure
            }
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

          let res: {
            status: number;
            data?: { id: number; slug: string } | undefined;
          };
          try {
            res = await ctx.targetWriteClient.mutate<{
              id: number;
              slug: string;
            }>(writeOp, ctx.signal);
          } catch (createErr: unknown) {
            const createMsg =
              createErr instanceof Error
                ? createErr.message
                : String(createErr);
            if (
              createMsg.toLowerCase().includes('invalid parent team id') &&
              payload.parent_team_id !== undefined
            ) {
              ctx.logger?.warn?.(
                `[teams] Parent team ID rejected for '${team.slug}'; creating team without parent_team_id.`,
              );
              const { parent_team_id: _omitted, ...fallbackPayload } = payload;
              void _omitted;
              res = await ctx.targetWriteClient.mutate<{
                id: number;
                slug: string;
              }>(
                {
                  ...writeOp,
                  body: fallbackPayload,
                },
                ctx.signal,
              );
            } else {
              throw createErr;
            }
          }

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

          try {
            const res = await ctx.targetWriteClient.mutate(writeOp, ctx.signal);

            results.push({
              operationId: op.id,
              status: 'succeeded',
              httpStatus: res.status,
              completedAt: new Date().toISOString(),
            });
          } catch (permErr: unknown) {
            const permMsg =
              permErr instanceof Error ? permErr.message : String(permErr);
            if (
              permMsg.includes('409') ||
              permMsg.includes('default_repository_permission')
            ) {
              results.push({
                operationId: op.id,
                status: 'succeeded',
                httpStatus: 200,
                completedAt: new Date().toISOString(),
              });
            } else {
              throw permErr;
            }
          }
        } else if (op.resourceType === 'team-org-role') {
          const roleState = op.sourceState as {
            teamSlug: string;
            roleType: 'security_manager' | 'custom_org_role';
            roleName?: string;
          };

          const targetRoleName =
            roleState.roleType === 'security_manager'
              ? 'security_manager'
              : roleState.roleName;

          if (targetRoleName) {
            let roleId: number | undefined;
            try {
              const rolesRes = await ctx.targetClient.readSingle<unknown>(
                {
                  id: 'rest.orgs.getTargetOrgRoleForTeam',
                  transport: 'rest',
                  verifiedReadOnly: true,
                  path: '/orgs/{org}/organization-roles',
                  pathParams: { org: targetOrg },
                },
                ctx.signal,
              );
              const roles =
                rolesRes.data &&
                typeof rolesRes.data === 'object' &&
                'roles' in rolesRes.data &&
                Array.isArray((rolesRes.data as { roles: unknown }).roles)
                  ? (
                      rolesRes.data as {
                        roles: Array<{ id: number; name: string }>;
                      }
                    ).roles
                  : Array.isArray(rolesRes.data)
                    ? (rolesRes.data as Array<{ id: number; name: string }>)
                    : [];
              const match = roles.find(
                (r) => r.name.toLowerCase() === targetRoleName.toLowerCase(),
              );
              if (match?.id) roleId = match.id;
            } catch {
              // Could not query
            }

            if (roleId !== undefined) {
              const writeOp: TargetWriteOperation = {
                id: `mutate-${op.id}`,
                method: 'PUT',
                path: '/orgs/{org}/organization-roles/teams/{team_slug}/{role_id}',
                pathParams: {
                  org: targetOrg,
                  team_slug: roleState.teamSlug,
                  role_id: String(roleId),
                },
              };
              const res = await ctx.targetWriteClient.mutate(
                writeOp,
                ctx.signal,
              );
              results.push({
                operationId: op.id,
                status: 'succeeded',
                httpStatus: res.status,
                completedAt: new Date().toISOString(),
              });
            } else {
              throw new Error(
                `Target organization role '${targetRoleName}' not found on '${targetOrg}'`,
              );
            }
          }
        } else if (op.resourceType === 'team-member') {
          const memberState = op.sourceState as {
            teamSlug: string;
            username: string;
            role: 'member' | 'maintainer';
          };

          const writeOp: TargetWriteOperation = {
            id: `mutate-${op.id}`,
            method: 'PUT',
            path: '/orgs/{org}/teams/{team_slug}/memberships/{username}',
            pathParams: {
              org: targetOrg,
              team_slug: memberState.teamSlug,
              username: memberState.username,
            },
            body: { role: memberState.role },
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

    const targetTeamReposBySlug = new Map<string, readonly RawTeamRepo[]>();

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

          let actualPerm: TeamRepoPermission | null =
            permRes.data &&
            (permRes.data.role_name !== undefined ||
              permRes.data.permissions !== undefined)
              ? deriveTeamRepoPermission(permRes.data)
              : null;

          if (!actualPerm) {
            let teamRepos = targetTeamReposBySlug.get(permState.teamSlug);
            if (!teamRepos) {
              try {
                const teamReposRes =
                  await ctx.targetClient.fetchAll<RawTeamRepo>(
                    {
                      id: 'rest.teams.listReposVerify',
                      transport: 'rest',
                      verifiedReadOnly: true,
                      path: '/orgs/{org}/teams/{team_slug}/repos',
                      pathParams: {
                        org: targetOrg,
                        team_slug: permState.teamSlug,
                      },
                      queryParams: { per_page: 100 },
                    },
                    ctx.signal,
                  );
                teamRepos = teamReposRes.items ?? [];
              } catch {
                teamRepos = [];
              }
              targetTeamReposBySlug.set(permState.teamSlug, teamRepos);
            }
            const matchedRepo = teamRepos.find(
              (r) =>
                r.name.toLowerCase() === permState.repositoryName.toLowerCase(),
            );
            if (matchedRepo) {
              actualPerm = deriveTeamRepoPermission(matchedRepo);
            }
          }

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
      } else if (op.resourceType === 'team-org-role') {
        const roleState = op.sourceState as {
          teamSlug: string;
          roleType: 'security_manager' | 'custom_org_role';
          roleName?: string;
        };

        const targetRoleName =
          roleState.roleType === 'security_manager'
            ? 'security_manager'
            : roleState.roleName;

        if (targetRoleName) {
          try {
            const rolesRes = await ctx.targetClient.readSingle<unknown>(
              {
                id: 'rest.orgs.verifyGetTargetOrgRole',
                transport: 'rest',
                verifiedReadOnly: true,
                path: '/orgs/{org}/organization-roles',
                pathParams: { org: targetOrg },
              },
              ctx.signal,
            );
            const roles =
              rolesRes.data &&
              typeof rolesRes.data === 'object' &&
              'roles' in rolesRes.data &&
              Array.isArray((rolesRes.data as { roles: unknown }).roles)
                ? (
                    rolesRes.data as {
                      roles: Array<{ id: number; name: string }>;
                    }
                  ).roles
                : Array.isArray(rolesRes.data)
                  ? (rolesRes.data as Array<{ id: number; name: string }>)
                  : [];
            const match = roles.find(
              (r) => r.name.toLowerCase() === targetRoleName.toLowerCase(),
            );
            if (!match?.id) {
              discrepancies.push({
                resourceName: `${roleState.teamSlug}:${targetRoleName}`,
                expected: `Role '${targetRoleName}' to exist and be assigned`,
                actual: 'role_missing',
                message: `Organization role '${targetRoleName}' is missing on target organization '${targetOrg}'`,
              });
            } else {
              const roleTeamsRes = await ctx.targetClient.readSingle<unknown>(
                {
                  id: 'rest.orgs.verifyOrgRoleTeams',
                  transport: 'rest',
                  verifiedReadOnly: true,
                  path: '/orgs/{org}/organization-roles/{role_id}/teams',
                  pathParams: { org: targetOrg, role_id: String(match.id) },
                },
                ctx.signal,
              );
              const teamsInRole = Array.isArray(roleTeamsRes.data)
                ? (roleTeamsRes.data as Array<{ slug?: string }>)
                : [];
              const hasTeam = teamsInRole.some(
                (t) => t.slug === roleState.teamSlug,
              );
              if (!hasTeam) {
                discrepancies.push({
                  resourceName: `${roleState.teamSlug}:${targetRoleName}`,
                  expected: `Assigned to role '${targetRoleName}'`,
                  actual: 'not_assigned',
                  message: `Team '${roleState.teamSlug}' is not assigned to organization role '${targetRoleName}' on '${targetOrg}'`,
                });
              }
            }
          } catch (err) {
            discrepancies.push({
              resourceName: `${roleState.teamSlug}:${targetRoleName}`,
              expected: 'assigned',
              actual: 'error',
              message: `Failed to verify organization role '${targetRoleName}' for team '${roleState.teamSlug}': ${String(err)}`,
            });
          }
        }
      } else if (op.resourceType === 'team-member') {
        const memberState = op.sourceState as {
          teamSlug: string;
          username: string;
          role: 'member' | 'maintainer';
        };

        try {
          const membershipRes = await ctx.targetClient.readSingle<{
            role?: string;
          }>(
            {
              id: 'rest.teams.verifyMembership',
              transport: 'rest',
              verifiedReadOnly: true,
              path: '/orgs/{org}/teams/{team_slug}/memberships/{username}',
              pathParams: {
                org: targetOrg,
                team_slug: memberState.teamSlug,
                username: memberState.username,
              },
            },
            ctx.signal,
          );

          if (!membershipRes.data?.role) {
            discrepancies.push({
              resourceName: `${memberState.teamSlug}:${memberState.username}`,
              expected: `Member '${memberState.username}' on team '${memberState.teamSlug}' with role '${memberState.role}'`,
              actual: 'missing',
              message: `Member '${memberState.username}' is missing from team '${memberState.teamSlug}' on '${targetOrg}'`,
            });
          }
        } catch {
          discrepancies.push({
            resourceName: `${memberState.teamSlug}:${memberState.username}`,
            expected: `Member '${memberState.username}' on team '${memberState.teamSlug}'`,
            actual: 'missing',
            message: `Member '${memberState.username}' not found on team '${memberState.teamSlug}' on '${targetOrg}'`,
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
