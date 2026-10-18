import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { validateMigrationScope, type MigrationScope } from '@ghec/contracts';
import type { GitHubReadAdapter, ReadOperation } from '@ghec/github-client';
import {
  HttpTargetWriteClient,
  appendStepSummary,
  type TargetWriteClient,
} from '@ghec/migration';
import {
  createMigrationClientsFromConfig,
  loadDualConfig,
  sanitizeDiagnostics,
} from '../config/index.js';

async function fetchList<T>(
  client: GitHubReadAdapter,
  op: ReadOperation,
  signal: AbortSignal,
): Promise<T[]> {
  try {
    const all = await client.fetchAll<T>(
      {
        ...op,
        queryParams: { ...(op.queryParams ?? {}), per_page: 100 },
      },
      signal,
    );
    if (all && Array.isArray(all.items)) {
      return [...all.items];
    }
  } catch {
    // Fall back to readSingle below
  }
  try {
    const res = await client.readSingle<T[]>(op, signal);
    if (res.status < 400 && Array.isArray(res.data)) {
      return res.data;
    }
  } catch {
    // Ignore read failure and return empty list
  }
  return [];
}

export interface CutoverCommandOptions {
  readonly scopePath?: string | undefined;
  readonly sourceOrg?: string | undefined;
  readonly targetOrg?: string | undefined;
  readonly repos?: readonly string[] | undefined;
  readonly includeDeployKeys: boolean;
  readonly includePagesCname: boolean;
  readonly deactivateSourceWebhooks: boolean;
  readonly disableSourceActions: boolean;
  readonly archiveSourceRepos: boolean;
  readonly dryRun: boolean;
  readonly outputPath: string;
  readonly appendStepSummary: boolean;
  readonly sourceToken?: string | undefined;
  readonly targetToken?: string | undefined;
}

export interface CutoverActionRecord {
  readonly id: string;
  readonly category:
    | 'deploy-key'
    | 'pages-cname'
    | 'source-webhook-deactivate'
    | 'source-actions-disable'
    | 'source-repo-archive';
  readonly sourceTarget: string;
  readonly destinationTarget?: string | undefined;
  readonly resourceName: string;
  readonly status:
    'succeeded' | 'planned' | 'skipped' | 'failed' | 'rolled-back';
  readonly message: string;
  readonly error?: string | undefined;
}

export interface CutoverExecutionReport {
  readonly executedAt: string;
  readonly sourceOrg: string;
  readonly targetOrg: string;
  readonly dryRun: boolean;
  readonly summary: {
    readonly totalActions: number;
    readonly succeeded: number;
    readonly planned: number;
    readonly skipped: number;
    readonly failed: number;
    readonly rolledBack: number;
  };
  readonly actions: readonly CutoverActionRecord[];
}

export interface CutoverClientOverrides {
  readonly sourceClient?: GitHubReadAdapter | undefined;
  readonly targetClient?: GitHubReadAdapter | undefined;
  readonly sourceWriteClient?: TargetWriteClient | undefined;
  readonly targetWriteClient?: TargetWriteClient | undefined;
}

interface RawDeployKeyItem {
  readonly id: number;
  readonly key: string;
  readonly title: string;
  readonly read_only?: boolean | null | undefined;
}

interface RawPagesResponse {
  readonly cname?: string | null | undefined;
  readonly https_enforced?: boolean | null | undefined;
  readonly build_type?: 'legacy' | 'workflow' | null | undefined;
  readonly source?:
    | {
        readonly branch: string;
        readonly path: '/' | '/docs';
      }
    | null
    | undefined;
}

interface RawWebhookItem {
  readonly id: number;
  readonly active?: boolean | null | undefined;
  readonly config?:
    | {
        readonly url?: string | null | undefined;
      }
    | null
    | undefined;
}

export function parseCutoverOptions(args: string[]): CutoverCommandOptions {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    allowNegative: true,
    options: {
      scope: { type: 'string' },
      'source-org': { type: 'string' },
      'target-org': { type: 'string' },
      repos: { type: 'string' },
      'include-deploy-keys': { type: 'boolean', default: true },
      'include-pages-cname': { type: 'boolean', default: true },
      'deactivate-source-webhooks': { type: 'boolean', default: false },
      'disable-source-actions': { type: 'boolean', default: false },
      'archive-source-repos': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      output: { type: 'string', default: './scans/cutover-report.json' },
      'append-step-summary': { type: 'boolean', default: false },
      'source-token': { type: 'string' },
      'target-token': { type: 'string' },
    },
  });

  if (!values.scope && (!values['source-org'] || !values['target-org'])) {
    throw new Error(
      'Either --scope <file> or both --source-org <org> and --target-org <org> are required.',
    );
  }

  const parsedRepos = values.repos
    ? values.repos
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
    : undefined;

  return {
    scopePath: values.scope,
    sourceOrg: values['source-org'],
    targetOrg: values['target-org'],
    repos: parsedRepos,
    includeDeployKeys: values['include-deploy-keys'],
    includePagesCname: values['include-pages-cname'],
    deactivateSourceWebhooks: values['deactivate-source-webhooks'],
    disableSourceActions: values['disable-source-actions'],
    archiveSourceRepos: values['archive-source-repos'],
    dryRun: values['dry-run'],
    outputPath: values.output,
    appendStepSummary: values['append-step-summary'],
    sourceToken: values['source-token'],
    targetToken: values['target-token'],
  };
}

export async function executeCutoverCommand(
  options: CutoverCommandOptions,
  overrides?: CutoverClientOverrides,
  signal: AbortSignal = new AbortController().signal,
): Promise<{ report: CutoverExecutionReport; filePath: string }> {
  let scope: MigrationScope | undefined;
  if (options.scopePath) {
    if (!existsSync(options.scopePath)) {
      throw new Error(`Scope file not found: ${options.scopePath}`);
    }
    const rawJson: unknown = JSON.parse(
      readFileSync(options.scopePath, 'utf-8'),
    );
    const validated = validateMigrationScope(rawJson);
    if (!validated.success) {
      throw new Error(
        `Invalid MigrationScope in ${options.scopePath}: ${validated.error.message}`,
      );
    }
    scope = validated.data;
  }

  const sourceOrg =
    options.sourceOrg ??
    scope?.organizations?.[0]?.source ??
    scope?.repositories[0]?.sourceOrg ??
    '';
  const targetOrg =
    options.targetOrg ??
    scope?.organizations?.[0]?.target ??
    scope?.repositories[0]?.targetOrg ??
    '';

  if (!sourceOrg || !targetOrg) {
    throw new Error(
      'Could not resolve sourceOrg and targetOrg from options or scope file.',
    );
  }

  let sourceClient = overrides?.sourceClient;
  let targetClient = overrides?.targetClient;
  let sourceWriteClient = overrides?.sourceWriteClient;
  let targetWriteClient = overrides?.targetWriteClient;

  if (
    !sourceClient ||
    !targetClient ||
    (!options.dryRun && (!sourceWriteClient || !targetWriteClient))
  ) {
    const dualConfig = loadDualConfig({
      sourceToken: options.sourceToken,
      targetToken: options.targetToken,
    });
    const clients = createMigrationClientsFromConfig(dualConfig);
    sourceClient = sourceClient ?? clients.sourceClient;
    targetClient = targetClient ?? clients.targetClient;
    targetWriteClient = targetWriteClient ?? clients.targetWriteClient;
    if (!sourceWriteClient && dualConfig.source.token) {
      sourceWriteClient = new HttpTargetWriteClient({
        token: dualConfig.source.token,
        baseUrl: dualConfig.source.baseUrl,
        apiVersion: dualConfig.source.apiVersion,
      });
    }
  }

  if (!options.dryRun && (!sourceWriteClient || !targetWriteClient)) {
    throw new Error(
      'Live cutover requires both source and target write credentials (GHEC_SOURCE_TOKEN and GHEC_TARGET_TOKEN).',
    );
  }

  // Determine repository pairs
  let repoPairs: { sourceRepo: string; targetRepo: string }[];
  if (options.repos && options.repos.length > 0) {
    const scopeMap = new Map<string, string>();
    for (const r of scope?.repositories ?? []) {
      scopeMap.set(r.sourceRepo.toLowerCase(), r.targetRepo);
      scopeMap.set(r.targetRepo.toLowerCase(), r.targetRepo);
    }
    repoPairs = options.repos.map((name) => ({
      sourceRepo: name,
      targetRepo: scopeMap.get(name.toLowerCase()) ?? name,
    }));
  } else if (scope?.repositories && scope.repositories.length > 0) {
    repoPairs = scope.repositories.map((r) => ({
      sourceRepo: r.sourceRepo,
      targetRepo: r.targetRepo,
    }));
  } else {
    // Discover repositories from sourceOrg
    const items = await fetchList<{ name?: string }>(
      sourceClient,
      {
        id: 'rest.repos.listForOrg',
        transport: 'rest',
        verifiedReadOnly: true,
        path: '/orgs/{org}/repos',
        pathParams: { org: sourceOrg },
      },
      signal,
    );
    repoPairs = items
      .filter(
        (item): item is { name: string } =>
          typeof item?.name === 'string' && item.name.length > 0,
      )
      .map((item) => ({ sourceRepo: item.name, targetRepo: item.name }));
  }

  const actions: CutoverActionRecord[] = [];

  for (const { sourceRepo, targetRepo } of repoPairs) {
    // 1. SSH Deploy Keys (detach from source -> create on target, with automatic rollback)
    if (options.includeDeployKeys) {
      const sourceKeys = await fetchList<RawDeployKeyItem>(
        sourceClient,
        {
          id: 'rest.repos.listDeployKeys',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/keys',
          pathParams: { owner: sourceOrg, repo: sourceRepo },
        },
        signal,
      );

      const targetKeys = await fetchList<RawDeployKeyItem>(
        targetClient,
        {
          id: 'rest.repos.listDeployKeys',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/keys',
          pathParams: { owner: targetOrg, repo: targetRepo },
        },
        signal,
      );

      const targetKeySet = new Set(targetKeys.map((k) => k.key.trim()));

      for (const keyItem of sourceKeys) {
        if (targetKeySet.has(keyItem.key.trim())) {
          actions.push({
            id: `cutover:deploy-key:${sourceRepo}:${keyItem.title}`,
            category: 'deploy-key',
            sourceTarget: `${sourceOrg}/${sourceRepo}`,
            destinationTarget: `${targetOrg}/${targetRepo}`,
            resourceName: keyItem.title,
            status: 'skipped',
            message: `Deploy key "${keyItem.title}" is already present on ${targetOrg}/${targetRepo}.`,
          });
          continue;
        }

        if (options.dryRun) {
          actions.push({
            id: `cutover:deploy-key:${sourceRepo}:${keyItem.title}`,
            category: 'deploy-key',
            sourceTarget: `${sourceOrg}/${sourceRepo}`,
            destinationTarget: `${targetOrg}/${targetRepo}`,
            resourceName: keyItem.title,
            status: 'planned',
            message: `[Dry-Run] Would delete SSH deploy key "${keyItem.title}" (ID: ${keyItem.id}) from ${sourceOrg}/${sourceRepo} and recreate on ${targetOrg}/${targetRepo}.`,
          });
          continue;
        }

        try {
          await sourceWriteClient!.mutate(
            {
              id: 'rest.repos.deleteDeployKey',
              method: 'DELETE',
              path: '/repos/{owner}/{repo}/keys/{key_id}',
              pathParams: {
                owner: sourceOrg,
                repo: sourceRepo,
                key_id: String(keyItem.id),
              },
            },
            signal,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          actions.push({
            id: `cutover:deploy-key:${sourceRepo}:${keyItem.title}`,
            category: 'deploy-key',
            sourceTarget: `${sourceOrg}/${sourceRepo}`,
            destinationTarget: `${targetOrg}/${targetRepo}`,
            resourceName: keyItem.title,
            status: 'failed',
            message: `Failed to detach deploy key "${keyItem.title}" from ${sourceOrg}/${sourceRepo}.`,
            error: sanitizeDiagnostics(msg),
          });
          continue;
        }

        try {
          await targetWriteClient!.mutate(
            {
              id: 'rest.repos.createDeployKey',
              method: 'POST',
              path: '/repos/{owner}/{repo}/keys',
              pathParams: { owner: targetOrg, repo: targetRepo },
              body: {
                title: keyItem.title,
                key: keyItem.key,
                read_only: keyItem.read_only ?? true,
              },
            },
            signal,
          );
          actions.push({
            id: `cutover:deploy-key:${sourceRepo}:${keyItem.title}`,
            category: 'deploy-key',
            sourceTarget: `${sourceOrg}/${sourceRepo}`,
            destinationTarget: `${targetOrg}/${targetRepo}`,
            resourceName: keyItem.title,
            status: 'succeeded',
            message: `Detached SSH deploy key "${keyItem.title}" from ${sourceOrg}/${sourceRepo} and migrated to ${targetOrg}/${targetRepo}.`,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          // Automatic rollback to source repository
          let rollbackSucceeded: boolean;
          try {
            await sourceWriteClient!.mutate(
              {
                id: 'rest.repos.createDeployKey',
                method: 'POST',
                path: '/repos/{owner}/{repo}/keys',
                pathParams: { owner: sourceOrg, repo: sourceRepo },
                body: {
                  title: keyItem.title,
                  key: keyItem.key,
                  read_only: keyItem.read_only ?? true,
                },
              },
              signal,
            );
            rollbackSucceeded = true;
          } catch {
            rollbackSucceeded = false;
          }

          actions.push({
            id: `cutover:deploy-key:${sourceRepo}:${keyItem.title}`,
            category: 'deploy-key',
            sourceTarget: `${sourceOrg}/${sourceRepo}`,
            destinationTarget: `${targetOrg}/${targetRepo}`,
            resourceName: keyItem.title,
            status: rollbackSucceeded ? 'rolled-back' : 'failed',
            message: rollbackSucceeded
              ? `Failed to create deploy key "${keyItem.title}" on ${targetOrg}/${targetRepo}; automatically restored deploy key on ${sourceOrg}/${sourceRepo}.`
              : `Failed to create deploy key "${keyItem.title}" on ${targetOrg}/${targetRepo} and rollback to ${sourceOrg}/${sourceRepo} failed.`,
            error: sanitizeDiagnostics(msg),
          });
        }
      }
    }

    // 2. GitHub Pages Custom CNAME Domain (detach from source -> bind on target, with automatic rollback)
    if (options.includePagesCname) {
      let sourcePages: RawPagesResponse | null;
      try {
        const res = await sourceClient.readSingle<RawPagesResponse>(
          {
            id: 'rest.repos.getPages',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/pages',
            pathParams: { owner: sourceOrg, repo: sourceRepo },
          },
          signal,
        );
        sourcePages = res.data;
      } catch {
        sourcePages = null;
      }

      const cname = sourcePages?.cname?.trim();
      if (cname) {
        if (options.dryRun) {
          actions.push({
            id: `cutover:pages-cname:${sourceRepo}:${cname}`,
            category: 'pages-cname',
            sourceTarget: `${sourceOrg}/${sourceRepo}`,
            destinationTarget: `${targetOrg}/${targetRepo}`,
            resourceName: cname,
            status: 'planned',
            message: `[Dry-Run] Would detach GitHub Pages custom domain "${cname}" from ${sourceOrg}/${sourceRepo} and bind to ${targetOrg}/${targetRepo}.`,
          });
        } else {
          try {
            await sourceWriteClient!.mutate(
              {
                id: 'rest.repos.updateInformationAboutPagesSite',
                method: 'PUT',
                path: '/repos/{owner}/{repo}/pages',
                pathParams: { owner: sourceOrg, repo: sourceRepo },
                body: {
                  cname: null,
                  ...(sourcePages?.source
                    ? { source: sourcePages.source }
                    : {}),
                },
              },
              signal,
            );

            try {
              await targetWriteClient!.mutate(
                {
                  id: 'rest.repos.updateInformationAboutPagesSite',
                  method: 'PUT',
                  path: '/repos/{owner}/{repo}/pages',
                  pathParams: { owner: targetOrg, repo: targetRepo },
                  body: {
                    cname,
                    ...(typeof sourcePages?.https_enforced === 'boolean'
                      ? { https_enforced: sourcePages.https_enforced }
                      : {}),
                    ...(sourcePages?.source
                      ? { source: sourcePages.source }
                      : {}),
                  },
                },
                signal,
              );

              actions.push({
                id: `cutover:pages-cname:${sourceRepo}:${cname}`,
                category: 'pages-cname',
                sourceTarget: `${sourceOrg}/${sourceRepo}`,
                destinationTarget: `${targetOrg}/${targetRepo}`,
                resourceName: cname,
                status: 'succeeded',
                message: `Detached GitHub Pages custom domain "${cname}" from ${sourceOrg}/${sourceRepo} and bound to ${targetOrg}/${targetRepo}.`,
              });
            } catch (targetErr: unknown) {
              const msg =
                targetErr instanceof Error
                  ? targetErr.message
                  : String(targetErr);
              let rollbackSucceeded: boolean;
              try {
                await sourceWriteClient!.mutate(
                  {
                    id: 'rest.repos.updateInformationAboutPagesSite',
                    method: 'PUT',
                    path: '/repos/{owner}/{repo}/pages',
                    pathParams: { owner: sourceOrg, repo: sourceRepo },
                    body: {
                      cname,
                      ...(sourcePages?.source
                        ? { source: sourcePages.source }
                        : {}),
                    },
                  },
                  signal,
                );
                rollbackSucceeded = true;
              } catch {
                rollbackSucceeded = false;
              }

              actions.push({
                id: `cutover:pages-cname:${sourceRepo}:${cname}`,
                category: 'pages-cname',
                sourceTarget: `${sourceOrg}/${sourceRepo}`,
                destinationTarget: `${targetOrg}/${targetRepo}`,
                resourceName: cname,
                status: rollbackSucceeded ? 'rolled-back' : 'failed',
                message: rollbackSucceeded
                  ? `Failed to bind GitHub Pages custom domain "${cname}" on ${targetOrg}/${targetRepo}; automatically restored custom domain on ${sourceOrg}/${sourceRepo}.`
                  : `Failed to bind GitHub Pages custom domain "${cname}" on ${targetOrg}/${targetRepo} and rollback failed.`,
                error: sanitizeDiagnostics(msg),
              });
            }
          } catch (sourceErr: unknown) {
            const msg =
              sourceErr instanceof Error
                ? sourceErr.message
                : String(sourceErr);
            actions.push({
              id: `cutover:pages-cname:${sourceRepo}:${cname}`,
              category: 'pages-cname',
              sourceTarget: `${sourceOrg}/${sourceRepo}`,
              destinationTarget: `${targetOrg}/${targetRepo}`,
              resourceName: cname,
              status: 'failed',
              message: `Failed to detach GitHub Pages custom domain "${cname}" from ${sourceOrg}/${sourceRepo}.`,
              error: sanitizeDiagnostics(msg),
            });
          }
        }
      }
    }

    // 3. Optional: Deactivate Source Repository Webhooks
    if (options.deactivateSourceWebhooks) {
      const hooks = await fetchList<RawWebhookItem>(
        sourceClient,
        {
          id: 'rest.repos.listWebhooks',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/hooks',
          pathParams: { owner: sourceOrg, repo: sourceRepo },
        },
        signal,
      );

      for (const hook of hooks) {
        if (!hook.active) continue;
        const hookUrl = hook.config?.url ?? `hook-${hook.id}`;
        if (options.dryRun) {
          actions.push({
            id: `cutover:source-webhook:${sourceRepo}:${hook.id}`,
            category: 'source-webhook-deactivate',
            sourceTarget: `${sourceOrg}/${sourceRepo}`,
            resourceName: hookUrl,
            status: 'planned',
            message: `[Dry-Run] Would deactivate active source webhook "${hookUrl}" on ${sourceOrg}/${sourceRepo}.`,
          });
        } else {
          try {
            await sourceWriteClient!.mutate(
              {
                id: 'rest.repos.updateWebhook',
                method: 'PATCH',
                path: '/repos/{owner}/{repo}/hooks/{hook_id}',
                pathParams: {
                  owner: sourceOrg,
                  repo: sourceRepo,
                  hook_id: String(hook.id),
                },
                body: { active: false },
              },
              signal,
            );
            actions.push({
              id: `cutover:source-webhook:${sourceRepo}:${hook.id}`,
              category: 'source-webhook-deactivate',
              sourceTarget: `${sourceOrg}/${sourceRepo}`,
              resourceName: hookUrl,
              status: 'succeeded',
              message: `Deactivated source webhook "${hookUrl}" on ${sourceOrg}/${sourceRepo}.`,
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            actions.push({
              id: `cutover:source-webhook:${sourceRepo}:${hook.id}`,
              category: 'source-webhook-deactivate',
              sourceTarget: `${sourceOrg}/${sourceRepo}`,
              resourceName: hookUrl,
              status: 'failed',
              message: `Failed to deactivate source webhook "${hookUrl}" on ${sourceOrg}/${sourceRepo}.`,
              error: sanitizeDiagnostics(msg),
            });
          }
        }
      }
    }

    // 4. Optional: Disable Source Repository GitHub Actions
    if (options.disableSourceActions) {
      if (options.dryRun) {
        actions.push({
          id: `cutover:source-actions:${sourceRepo}`,
          category: 'source-actions-disable',
          sourceTarget: `${sourceOrg}/${sourceRepo}`,
          resourceName: sourceRepo,
          status: 'planned',
          message: `[Dry-Run] Would disable GitHub Actions on source repository ${sourceOrg}/${sourceRepo}.`,
        });
      } else {
        try {
          await sourceWriteClient!.mutate(
            {
              id: 'rest.actions.setGithubActionsPermissionsRepository',
              method: 'PUT',
              path: '/repos/{owner}/{repo}/actions/permissions',
              pathParams: { owner: sourceOrg, repo: sourceRepo },
              body: { enabled: false },
            },
            signal,
          );
          actions.push({
            id: `cutover:source-actions:${sourceRepo}`,
            category: 'source-actions-disable',
            sourceTarget: `${sourceOrg}/${sourceRepo}`,
            resourceName: sourceRepo,
            status: 'succeeded',
            message: `Disabled GitHub Actions on source repository ${sourceOrg}/${sourceRepo}.`,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          actions.push({
            id: `cutover:source-actions:${sourceRepo}`,
            category: 'source-actions-disable',
            sourceTarget: `${sourceOrg}/${sourceRepo}`,
            resourceName: sourceRepo,
            status: 'failed',
            message: `Failed to disable GitHub Actions on ${sourceOrg}/${sourceRepo}.`,
            error: sanitizeDiagnostics(msg),
          });
        }
      }
    }

    // 5. Optional: Archive Source Repository (runs last so prior mutations succeed)
    if (options.archiveSourceRepos) {
      if (options.dryRun) {
        actions.push({
          id: `cutover:source-archive:${sourceRepo}`,
          category: 'source-repo-archive',
          sourceTarget: `${sourceOrg}/${sourceRepo}`,
          resourceName: sourceRepo,
          status: 'planned',
          message: `[Dry-Run] Would archive source repository ${sourceOrg}/${sourceRepo} (read-only).`,
        });
      } else {
        try {
          await sourceWriteClient!.mutate(
            {
              id: 'rest.repos.update',
              method: 'PATCH',
              path: '/repos/{owner}/{repo}',
              pathParams: { owner: sourceOrg, repo: sourceRepo },
              body: { archived: true },
            },
            signal,
          );
          actions.push({
            id: `cutover:source-archive:${sourceRepo}`,
            category: 'source-repo-archive',
            sourceTarget: `${sourceOrg}/${sourceRepo}`,
            resourceName: sourceRepo,
            status: 'succeeded',
            message: `Archived source repository ${sourceOrg}/${sourceRepo} (read-only).`,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          actions.push({
            id: `cutover:source-archive:${sourceRepo}`,
            category: 'source-repo-archive',
            sourceTarget: `${sourceOrg}/${sourceRepo}`,
            resourceName: sourceRepo,
            status: 'failed',
            message: `Failed to archive source repository ${sourceOrg}/${sourceRepo}.`,
            error: sanitizeDiagnostics(msg),
          });
        }
      }
    }
  }

  // Optional: Deactivate Source Organization Webhooks
  if (options.deactivateSourceWebhooks) {
    const orgHooks = await fetchList<RawWebhookItem>(
      sourceClient,
      {
        id: 'rest.orgs.listWebhooks',
        transport: 'rest',
        verifiedReadOnly: true,
        path: '/orgs/{org}/hooks',
        pathParams: { org: sourceOrg },
      },
      signal,
    );

    for (const hook of orgHooks) {
      if (!hook.active) continue;
      const hookUrl = hook.config?.url ?? `org-hook-${hook.id}`;
      if (options.dryRun) {
        actions.push({
          id: `cutover:source-org-webhook:${hook.id}`,
          category: 'source-webhook-deactivate',
          sourceTarget: sourceOrg,
          resourceName: hookUrl,
          status: 'planned',
          message: `[Dry-Run] Would deactivate active source organization webhook "${hookUrl}" on ${sourceOrg}.`,
        });
      } else {
        try {
          await sourceWriteClient!.mutate(
            {
              id: 'rest.orgs.updateWebhook',
              method: 'PATCH',
              path: '/orgs/{org}/hooks/{hook_id}',
              pathParams: { org: sourceOrg, hook_id: String(hook.id) },
              body: { active: false },
            },
            signal,
          );
          actions.push({
            id: `cutover:source-org-webhook:${hook.id}`,
            category: 'source-webhook-deactivate',
            sourceTarget: sourceOrg,
            resourceName: hookUrl,
            status: 'succeeded',
            message: `Deactivated source organization webhook "${hookUrl}" on ${sourceOrg}.`,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          actions.push({
            id: `cutover:source-org-webhook:${hook.id}`,
            category: 'source-webhook-deactivate',
            sourceTarget: sourceOrg,
            resourceName: hookUrl,
            status: 'failed',
            message: `Failed to deactivate source organization webhook "${hookUrl}" on ${sourceOrg}.`,
            error: sanitizeDiagnostics(msg),
          });
        }
      }
    }
  }

  const report: CutoverExecutionReport = {
    executedAt: new Date().toISOString(),
    sourceOrg,
    targetOrg,
    dryRun: options.dryRun,
    summary: {
      totalActions: actions.length,
      succeeded: actions.filter((a) => a.status === 'succeeded').length,
      planned: actions.filter((a) => a.status === 'planned').length,
      skipped: actions.filter((a) => a.status === 'skipped').length,
      failed: actions.filter((a) => a.status === 'failed').length,
      rolledBack: actions.filter((a) => a.status === 'rolled-back').length,
    },
    actions,
  };

  mkdirSync(dirname(options.outputPath), { recursive: true });
  writeFileSync(options.outputPath, JSON.stringify(report, null, 2), 'utf-8');

  if (options.appendStepSummary) {
    const mdLines = [
      `## ✂️ Post-Migration Source-Detach Cutover: \`${sourceOrg}\` ➔ \`${targetOrg}\``,
      '',
      `- **Mode:** \`${options.dryRun ? 'Dry-Run (Simulation)' : 'Live Cutover'}\``,
      `- **Total Actions:** ${report.summary.totalActions} (${report.summary.succeeded} succeeded, ${report.summary.planned} planned, ${report.summary.skipped} skipped, ${report.summary.rolledBack} rolled back, ${report.summary.failed} failed)`,
      '',
      '| Category | Source | Destination | Resource | Status | Details |',
      '| :--- | :--- | :--- | :--- | :--- | :--- |',
      ...actions.map(
        (a) =>
          `| \`${a.category}\` | \`${a.sourceTarget}\` | \`${a.destinationTarget ?? '-'}\` | \`${a.resourceName}\` | \`${a.status}\` | ${a.message}${a.error ? ` (${a.error})` : ''} |`,
      ),
      '',
    ];
    appendStepSummary(mdLines.join('\n'));
  }

  return { report, filePath: options.outputPath };
}
