import {
  MIGRATION_SCHEMA_VERSION,
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
} from '../../core/types.js';
import type {
  AppInstallationState,
  AppsInventoryData,
  RawAppInstallationResponse,
  RawAppInstallationsListResponse,
  RawGitHubAppDetailsResponse,
  RawInstallationRepositoriesResponse,
} from './types.js';
import {
  buildGitHubAppManifest,
  buildGitHubAppUrlParametersLink,
  buildRecreatedAppSlug,
  classifyGitHubApp,
  getCandidateTargetAppSlugs,
} from './manifest.js';

function parseInstallations(
  data: RawAppInstallationsListResponse | unknown,
): AppInstallationState[] {
  if (!data || typeof data !== 'object') return [];
  const list = data as RawAppInstallationsListResponse;
  const items = Array.isArray(list.installations) ? list.installations : [];

  return items.map((inst: RawAppInstallationResponse) => ({
    id: inst.id,
    app_id: inst.app_id,
    app_slug: inst.app_slug ?? `app-${inst.app_id}`,
    repository_selection:
      inst.repository_selection?.toLowerCase() === 'selected'
        ? 'selected'
        : 'all',
    permissions: inst.permissions ?? {},
    events: Array.isArray(inst.events) ? [...inst.events] : [],
    html_url: inst.html_url ?? undefined,
  }));
}

function parseInstallationRepositories(
  data: RawInstallationRepositoriesResponse | unknown,
): string[] {
  if (!data || typeof data !== 'object') return [];
  const list = data as RawInstallationRepositoriesResponse;
  const repos = Array.isArray(list.repositories) ? list.repositories : [];
  const names: string[] = [];
  for (const repo of repos) {
    if (typeof repo?.name === 'string' && repo.name.trim().length > 0) {
      names.push(repo.name.trim());
    }
  }
  return names;
}

function comparePermissions(
  source: Readonly<Record<string, string>>,
  target: Readonly<Record<string, string>>,
): { matches: boolean; diffs: string[] } {
  const diffs: string[] = [];
  for (const [key, val] of Object.entries(source)) {
    if (target[key] !== val) {
      diffs.push(`${key}: expected "${val}", got "${target[key] ?? 'none'}"`);
    }
  }
  return { matches: diffs.length === 0, diffs };
}

export class AppsInventoryMigrationModule implements MigrationModule<AppsInventoryData> {
  readonly id = 'apps-inventory';
  readonly displayName = 'GitHub Apps & Integrations Inventory';
  readonly scopeLevel: MigrationScopeLevel = 'organization';
  readonly dependencies: readonly string[] = ['org-settings'];

  async discover(ctx: MigrationContext): Promise<AppsInventoryData> {
    const sourceOrg = ctx.scope.sourceOrg;
    let rawInstallations: AppInstallationState[];

    try {
      const res =
        await ctx.sourceClient.readSingle<RawAppInstallationsListResponse>(
          {
            id: 'rest.apps.listInstallations',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/installations',
            pathParams: { org: sourceOrg },
          },
          ctx.signal,
        );

      rawInstallations = parseInstallations(res.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to discover GitHub Apps inventory for ${sourceOrg}: ${message}`,
        { cause: err },
      );
    }

    const installations: AppInstallationState[] = [];
    for (const inst of rawInstallations) {
      let status: number | null;
      let details: RawGitHubAppDetailsResponse | null;

      try {
        const appRes =
          await ctx.sourceClient.readSingle<RawGitHubAppDetailsResponse>(
            {
              id: 'rest.apps.getBySlug',
              transport: 'rest',
              verifiedReadOnly: true,
              unauthenticated: true,
              path: '/apps/{app_slug}',
              pathParams: { app_slug: inst.app_slug },
            },
            ctx.signal,
          );
        status = appRes.status;
        details = appRes.data;
      } catch {
        status = 404;
        details = null;
      }

      if (status !== 200) {
        try {
          const authAppRes =
            await ctx.sourceClient.readSingle<RawGitHubAppDetailsResponse>(
              {
                id: 'rest.apps.getBySlugAuthenticated',
                transport: 'rest',
                verifiedReadOnly: true,
                path: '/apps/{app_slug}',
                pathParams: { app_slug: inst.app_slug },
              },
              ctx.signal,
            );
          if (authAppRes.status === 200 && authAppRes.data) {
            details = authAppRes.data;
            if (status === 403 || status === 429) {
              status = 200;
            }
          }
        } catch {
          // Ignore authenticated metadata enrichment errors
        }
      }

      let selectedRepositories: string[] = [];
      if (inst.repository_selection === 'selected') {
        try {
          const reposRes =
            await ctx.sourceClient.readSingle<RawInstallationRepositoriesResponse>(
              {
                id: 'rest.apps.listInstallationReposForAuthenticatedUser',
                transport: 'rest',
                verifiedReadOnly: true,
                path: '/user/installations/{installation_id}/repositories',
                pathParams: { installation_id: String(inst.id) },
              },
              ctx.signal,
            );
          selectedRepositories = parseInstallationRepositories(reposRes.data);
        } catch {
          // Endpoint requires user-to-server token or specific permissions; gracefully ignore 403/404.
        }
      }

      const classified = classifyGitHubApp({
        sourceOrg,
        status,
        details,
      });

      installations.push({
        ...inst,
        ...(classified.appName ? { app_name: classified.appName } : {}),
        ...(classified.description
          ? { description: classified.description }
          : {}),
        ...(classified.externalUrl
          ? { external_url: classified.externalUrl }
          : {}),
        ...(classified.ownerLogin
          ? { owner_login: classified.ownerLogin }
          : {}),
        classification: classified.classification,
        recommended_strategy: classified.recommendedStrategy,
        ...(selectedRepositories.length > 0
          ? { selected_repositories: selectedRepositories }
          : {}),
      });
    }

    return {
      organization: sourceOrg,
      installations,
    };
  }

  async plan(
    ctx: MigrationContext,
    source: AppsInventoryData,
  ): Promise<ModulePlan> {
    const targetOrg = ctx.scope.targetOrg;
    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    let targetInstallations: AppInstallationState[] = [];
    try {
      const res =
        await ctx.targetClient.readSingle<RawAppInstallationsListResponse>(
          {
            id: 'rest.apps.listInstallations',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/installations',
            pathParams: { org: targetOrg },
          },
          ctx.signal,
        );
      targetInstallations = parseInstallations(res.data);
    } catch (err: unknown) {
      ctx.logger.warn(
        `Could not query target installations for ${targetOrg}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const targetMap = new Map<string, AppInstallationState>();
    for (const inst of targetInstallations) {
      targetMap.set(inst.app_slug.toLowerCase(), inst);
    }

    const emuSuffix = ctx.scope.identityMapping?.suffix;

    for (const app of source.installations) {
      const slugKey = app.app_slug.toLowerCase();
      const recreatedSlug = buildRecreatedAppSlug(app.app_slug, targetOrg);
      const candidateSlugs = getCandidateTargetAppSlugs(
        app.app_slug,
        targetOrg,
        emuSuffix,
      );
      const existing = candidateSlugs
        .map((candidate) => targetMap.get(candidate))
        .find((inst): inst is AppInstallationState => inst !== undefined);

      if (existing) {
        const { diffs: permDiffs } = comparePermissions(
          app.permissions,
          existing.permissions,
        );
        const installSettingsUrl =
          existing.html_url ??
          `https://github.com/organizations/${encodeURIComponent(targetOrg)}/settings/installations/${existing.id}`;
        const allDiffs = [...permDiffs];

        if (app.repository_selection !== existing.repository_selection) {
          if (app.repository_selection === 'selected') {
            const reposList =
              app.selected_repositories && app.selected_repositories.length > 0
                ? ` (${app.selected_repositories.join(', ')})`
                : '';
            allDiffs.push(
              `repository_selection: expected "selected"${reposList}, got "all" — switch Repository access to "Only select repositories" (pick any 1 repo) at ${installSettingsUrl} and re-run apps-inventory to auto-sync the selected repositories`,
            );
          } else {
            allDiffs.push(
              `repository_selection: expected "all", got "selected" — switch Repository access to "All repositories" at ${installSettingsUrl}`,
            );
          }
        }

        if (allDiffs.length === 0) {
          operations.push({
            id: `op-noop-app-${slugKey}`,
            resourceType: 'github_app_installation',
            resourceName: app.app_slug,
            operation: 'noop',
            sourceState: app as unknown as Record<string, unknown>,
            destinationCurrentState: existing as unknown as Record<
              string,
              unknown
            >,
            reason: `GitHub App "${app.app_slug}" already installed with matching permissions on target`,
          });
        } else {
          const label =
            permDiffs.length > 0 &&
            app.repository_selection === existing.repository_selection
              ? 'permission differences'
              : 'configuration differences';
          const warnMsg = `GitHub App "${app.app_slug}" is installed on target but has ${label}: ${allDiffs.join('; ')}`;
          warnings.push(warnMsg);
          operations.push({
            id: `op-advisory-app-perms-${slugKey}`,
            resourceType: 'github_app_installation',
            resourceName: app.app_slug,
            operation: 'warn',
            sourceState: app as unknown as Record<string, unknown>,
            destinationCurrentState: existing as unknown as Record<
              string,
              unknown
            >,
            payload: {
              app_slug: app.app_slug,
              recreated_app_slug: recreatedSlug,
              classification: app.classification ?? 'third_party',
              diffs: allDiffs,
              expectedPermissions: app.permissions,
              actualPermissions: existing.permissions,
              expectedRepositorySelection: app.repository_selection,
              actualRepositorySelection: existing.repository_selection,
              install_settings_url: installSettingsUrl,
              advisory: warnMsg,
            },
            reason: warnMsg,
          });
        }

        if (
          app.repository_selection === 'selected' &&
          app.selected_repositories &&
          app.selected_repositories.length > 0 &&
          existing.repository_selection === 'selected'
        ) {
          operations.push({
            id: `op-bind-app-repos-${slugKey}`,
            resourceType: 'github_app_repository_binding',
            resourceName: app.app_slug,
            operation: 'update',
            sourceState: app as unknown as Record<string, unknown>,
            destinationCurrentState: existing as unknown as Record<
              string,
              unknown
            >,
            payload: {
              app_slug: app.app_slug,
              target_installation_id: existing.id,
              selected_repositories: app.selected_repositories,
              prune_unselected: true,
            },
            reason: `Bind selected repositories (${app.selected_repositories.join(', ')}) to GitHub App "${app.app_slug}" installation on ${targetOrg}`,
          });
        } else if (
          app.repository_selection === 'all' &&
          existing.repository_selection === 'selected'
        ) {
          operations.push({
            id: `op-bind-app-repos-${slugKey}`,
            resourceType: 'github_app_repository_binding',
            resourceName: app.app_slug,
            operation: 'update',
            sourceState: app as unknown as Record<string, unknown>,
            destinationCurrentState: existing as unknown as Record<
              string,
              unknown
            >,
            payload: {
              app_slug: app.app_slug,
              target_installation_id: existing.id,
              bind_all_org_repos: true,
            },
            reason: `Bind all existing repositories in ${targetOrg} to GitHub App "${app.app_slug}" installation (currently in "selected" mode; switch to "All repositories" at ${installSettingsUrl} for future repos)`,
          });
        }
      } else {
        const classification = app.classification ?? 'third_party';
        const recommendedStrategy =
          app.recommended_strategy ?? 'install_existing';
        const destinationInstallUrl = `https://github.com/apps/${encodeURIComponent(app.app_slug)}/installations/new`;
        const recreateAppUrl = buildGitHubAppUrlParametersLink(app, targetOrg);
        const manifest = buildGitHubAppManifest(app, targetOrg);
        const selectedReposSuffix =
          app.selected_repositories && app.selected_repositories.length > 0
            ? ` (Selected repositories: ${app.selected_repositories.join(', ')})`
            : '';

        const advisory =
          classification === 'custom_private'
            ? `GitHub Apps cannot be installed programmatically via API. "${app.app_slug}" (ID: ${app.app_id}) is a private custom app and must be recreated on ${targetOrg} as "${recreatedSlug}"${selectedReposSuffix}. Recreate URL: ${recreateAppUrl}`
            : classification === 'custom_public'
              ? `GitHub Apps cannot be installed programmatically via API. "${app.app_slug}" (ID: ${app.app_id}) is a public organization-owned app; install the existing app on ${targetOrg} or recreate it as "${recreatedSlug}"${selectedReposSuffix}. Install URL: ${destinationInstallUrl} | Recreate URL: ${recreateAppUrl}`
              : `GitHub Apps cannot be installed programmatically via API. An organization administrator must authorize and install "${app.app_slug}" (ID: ${app.app_id}) on ${targetOrg}${selectedReposSuffix}.`;
        warnings.push(
          `Manual reinstallation advisory: GitHub App "${app.app_slug}" must be installed on ${targetOrg} manually.`,
        );

        operations.push({
          id: `op-advisory-app-${slugKey}`,
          resourceType: 'github_app_installation',
          resourceName: app.app_slug,
          operation: 'warn',
          sourceState: app as unknown as Record<string, unknown>,
          payload: {
            app_id: app.app_id,
            app_slug: app.app_slug,
            recreated_app_slug: recreatedSlug,
            classification,
            recommended_strategy: recommendedStrategy,
            destination_install_url: destinationInstallUrl,
            recreate_app_url: recreateAppUrl,
            manifest,
            html_url: app.html_url,
            permissions: app.permissions,
            events: app.events,
            repository_selection: app.repository_selection,
            ...(app.selected_repositories &&
            app.selected_repositories.length > 0
              ? { selected_repositories: app.selected_repositories }
              : {}),
            advisory,
          },
          reason: advisory,
        });
      }
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
    const targetOrg = ctx.scope.targetOrg;
    const results: OperationExecutionResult[] = [];

    for (const op of plan.operations) {
      const completedAt = new Date().toISOString();

      if (
        op.resourceType === 'github_app_repository_binding' &&
        op.operation === 'update'
      ) {
        if (ctx.dryRun) {
          results.push({
            operationId: op.id,
            status: 'skipped',
            completedAt,
          });
          continue;
        }

        const payload = op.payload as
          | {
              target_installation_id?: number;
              selected_repositories?: readonly string[];
              prune_unselected?: boolean;
              bind_all_org_repos?: boolean;
            }
          | undefined;
        const installationId = payload?.target_installation_id;
        const selectedRepos = payload?.selected_repositories ?? [];
        const bindAllOrgRepos = payload?.bind_all_org_repos === true;

        if (
          !installationId ||
          (!bindAllOrgRepos && selectedRepos.length === 0) ||
          !ctx.targetWriteClient
        ) {
          results.push({
            operationId: op.id,
            status: 'skipped',
            completedAt,
          });
          continue;
        }

        let boundCount = 0;
        let failedReason: string | undefined;

        if (bindAllOrgRepos) {
          try {
            const orgReposRes = await ctx.targetClient.readSingle<
              readonly { id?: number; name?: string }[]
            >(
              {
                id: 'rest.repos.listForOrg',
                transport: 'rest',
                verifiedReadOnly: true,
                path: '/orgs/{org}/repos',
                pathParams: { org: targetOrg },
                queryParams: { per_page: 100 },
              },
              ctx.signal,
            );
            const orgRepos = Array.isArray(orgReposRes.data)
              ? orgReposRes.data
              : [];
            for (const repo of orgRepos) {
              if (typeof repo?.id !== 'number') {
                continue;
              }
              try {
                await ctx.targetWriteClient.mutate(
                  {
                    id: 'rest.apps.addRepoToInstallationForAuthenticatedUser',
                    method: 'PUT',
                    path: '/user/installations/{installation_id}/repositories/{repository_id}',
                    pathParams: {
                      installation_id: String(installationId),
                      repository_id: String(repo.id),
                    },
                  },
                  ctx.signal,
                );
                boundCount += 1;
              } catch (err: unknown) {
                failedReason = err instanceof Error ? err.message : String(err);
              }
            }
          } catch (err: unknown) {
            failedReason = err instanceof Error ? err.message : String(err);
          }
        } else {
          for (const repoName of selectedRepos) {
            try {
              const repoRes = await ctx.targetClient.readSingle<{
                id?: number;
              }>(
                {
                  id: 'rest.repos.get',
                  transport: 'rest',
                  verifiedReadOnly: true,
                  path: '/repos/{owner}/{repo}',
                  pathParams: { owner: targetOrg, repo: repoName },
                },
                ctx.signal,
              );
              const repoId = repoRes.data?.id;
              if (typeof repoId !== 'number') {
                continue;
              }
              await ctx.targetWriteClient.mutate(
                {
                  id: 'rest.apps.addRepoToInstallationForAuthenticatedUser',
                  method: 'PUT',
                  path: '/user/installations/{installation_id}/repositories/{repository_id}',
                  pathParams: {
                    installation_id: String(installationId),
                    repository_id: String(repoId),
                  },
                },
                ctx.signal,
              );
              boundCount += 1;
            } catch (err: unknown) {
              failedReason = err instanceof Error ? err.message : String(err);
            }
          }

          if (boundCount > 0 && payload?.prune_unselected !== false) {
            const desiredLowerSet = new Set(
              selectedRepos.map((r) => r.trim().toLowerCase()),
            );
            try {
              const currentReposRes =
                await ctx.targetClient.readSingle<RawInstallationRepositoriesResponse>(
                  {
                    id: 'rest.apps.listInstallationReposForAuthenticatedUser',
                    transport: 'rest',
                    verifiedReadOnly: true,
                    path: '/user/installations/{installation_id}/repositories',
                    pathParams: { installation_id: String(installationId) },
                  },
                  ctx.signal,
                );
              const currentRepos = Array.isArray(
                currentReposRes.data?.repositories,
              )
                ? currentReposRes.data.repositories
                : [];
              for (const item of currentRepos) {
                const itemName =
                  typeof item?.name === 'string' ? item.name.trim() : '';
                const itemId = item?.id;
                if (
                  itemName.length > 0 &&
                  !desiredLowerSet.has(itemName.toLowerCase()) &&
                  typeof itemId === 'number'
                ) {
                  try {
                    await ctx.targetWriteClient.mutate(
                      {
                        id: 'rest.apps.removeRepoFromInstallationForAuthenticatedUser',
                        method: 'DELETE',
                        path: '/user/installations/{installation_id}/repositories/{repository_id}',
                        pathParams: {
                          installation_id: String(installationId),
                          repository_id: String(itemId),
                        },
                      },
                      ctx.signal,
                    );
                  } catch {
                    // Ignore removal errors (e.g. if last repo or insufficient permissions)
                  }
                }
              }
            } catch {
              // Ignore read errors when listing current installation repositories
            }
          }
        }

        results.push({
          operationId: op.id,
          status: boundCount > 0 ? 'succeeded' : 'skipped',
          ...(boundCount === 0 && failedReason ? { reason: failedReason } : {}),
          completedAt,
        });
        continue;
      }

      if (op.operation === 'warn') {
        const payload = op.payload as { advisory?: string } | undefined;
        ctx.logger.info(
          `[Advisory] ${op.reason ?? op.resourceName}${payload?.advisory ? `: ${payload.advisory}` : ''}`,
        );
      }

      results.push({
        operationId: op.id,
        status: 'succeeded',
        completedAt,
      });
    }

    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status: 'complete',
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

    let targetInstallations: AppInstallationState[];
    try {
      const res =
        await ctx.targetClient.readSingle<RawAppInstallationsListResponse>(
          {
            id: 'rest.apps.listInstallations',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/installations',
            pathParams: { org: targetOrg },
          },
          ctx.signal,
        );
      targetInstallations = parseInstallations(res.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      discrepancies.push({
        resourceName: `${targetOrg}:apps-inventory`,
        expected: 'accessible',
        actual: `Failed to query: ${message}`,
        message: `Failed to query target app installations on ${targetOrg}: ${message}`,
      });
      return {
        moduleId: this.id,
        verified: false,
        discrepancies,
      };
    }

    const targetMap = new Map<string, AppInstallationState>();
    for (const inst of targetInstallations) {
      targetMap.set(inst.app_slug.toLowerCase(), inst);
    }

    const emuSuffix = ctx.scope.identityMapping?.suffix;

    for (const op of plan.operations) {
      if (op.operation === 'warn' || op.operation === 'noop') {
        const appSlug = op.resourceName;
        const payloadRecreatedSlug = (
          op.payload as { recreated_app_slug?: string } | undefined
        )?.recreated_app_slug;
        const candidateSlugs = getCandidateTargetAppSlugs(
          appSlug,
          targetOrg,
          emuSuffix,
        );
        if (payloadRecreatedSlug) {
          candidateSlugs.push(payloadRecreatedSlug.toLowerCase());
        }
        const act = candidateSlugs
          .map((candidate) => targetMap.get(candidate))
          .find((inst): inst is AppInstallationState => inst !== undefined);

        if (!act) {
          const isManualInstallAdvisory =
            op.operation === 'warn' &&
            typeof (op.payload as { advisory?: unknown } | undefined)
              ?.advisory === 'string';
          if (isManualInstallAdvisory && ctx.continueOnError) {
            ctx.logger.warn(
              `[Advisory] GitHub App "${appSlug}" requires manual administrator installation on ${targetOrg}.`,
            );
            continue;
          }
          discrepancies.push({
            resourceName: `${targetOrg} (installations.${appSlug})`,
            expected: appSlug,
            actual: null,
            message: `GitHub App "${appSlug}" is not installed on target organization ${targetOrg}.`,
          });
          continue;
        }

        const expectedPermissions =
          (
            op.payload as
              | {
                  permissions?: Readonly<Record<string, string>>;
                  expectedPermissions?: Readonly<Record<string, string>>;
                }
              | undefined
          )?.permissions ??
          (
            op.payload as
              | {
                  permissions?: Readonly<Record<string, string>>;
                  expectedPermissions?: Readonly<Record<string, string>>;
                }
              | undefined
          )?.expectedPermissions ??
          (
            op.sourceState as
              { permissions?: Readonly<Record<string, string>> } | undefined
          )?.permissions;

        if (expectedPermissions) {
          const { matches, diffs } = comparePermissions(
            expectedPermissions,
            act.permissions,
          );
          if (!matches) {
            discrepancies.push({
              resourceName: `${targetOrg} (installations.${appSlug}.permissions)`,
              expected: expectedPermissions,
              actual: act.permissions,
              message: `GitHub App "${appSlug}" permissions mismatch: ${diffs.join('; ')}`,
            });
          }
        }

        const expectedRepoSelection =
          (
            op.payload as
              | {
                  repository_selection?: 'all' | 'selected';
                  expectedRepositorySelection?: 'all' | 'selected';
                }
              | undefined
          )?.expectedRepositorySelection ??
          (
            op.payload as
              | {
                  repository_selection?: 'all' | 'selected';
                  expectedRepositorySelection?: 'all' | 'selected';
                }
              | undefined
          )?.repository_selection ??
          (
            op.sourceState as
              { repository_selection?: 'all' | 'selected' } | undefined
          )?.repository_selection;

        if (
          expectedRepoSelection &&
          act.repository_selection !== expectedRepoSelection
        ) {
          const isManualConfigAdvisory =
            op.operation === 'warn' &&
            typeof (op.payload as { advisory?: unknown } | undefined)
              ?.advisory === 'string';
          if (isManualConfigAdvisory && ctx.continueOnError) {
            ctx.logger.warn(
              `[Advisory] GitHub App "${appSlug}" repository_selection is "${act.repository_selection}" on ${targetOrg} (expected "${expectedRepoSelection}").`,
            );
          } else {
            discrepancies.push({
              resourceName: `${targetOrg} (installations.${appSlug}.repository_selection)`,
              expected: expectedRepoSelection,
              actual: act.repository_selection,
              message: `GitHub App "${appSlug}" repository_selection mismatch: expected "${expectedRepoSelection}", got "${act.repository_selection}"`,
            });
          }
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
