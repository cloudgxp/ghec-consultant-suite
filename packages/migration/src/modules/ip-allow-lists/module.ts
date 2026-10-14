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
  TargetWriteOperation,
} from '../../core/types.js';
import type {
  IpAllowListEntry,
  IpAllowListsData,
  RawGraphQLIpAllowListResponse,
} from './types.js';

export const GET_ORG_IP_ALLOW_LIST_QUERY = `
  query GetOrgIpAllowListEntries($org: String!) {
    organization(login: $org) {
      id
      ipAllowListEntries(first: 100) {
        nodes {
          id
          name
          cidr
          isActive
        }
      }
    }
  }
`;

export const CREATE_IP_ALLOW_LIST_ENTRY_MUTATION = `
  mutation CreateIpAllowListEntry($input: CreateIpAllowListEntryInput!) {
    createIpAllowListEntry(input: $input) {
      ipAllowListEntry {
        id
        name
        cidr
        isActive
      }
    }
  }
`;

export const UPDATE_IP_ALLOW_LIST_ENTRY_MUTATION = `
  mutation UpdateIpAllowListEntry($input: UpdateIpAllowListEntryInput!) {
    updateIpAllowListEntry(input: $input) {
      ipAllowListEntry {
        id
        name
        cidr
        isActive
      }
    }
  }
`;

function parseEntries(res?: RawGraphQLIpAllowListResponse | null | undefined): {
  ownerId?: string | undefined;
  entries: IpAllowListEntry[];
} {
  const org = res?.organization;
  const ownerId = typeof org?.id === 'string' ? org.id : undefined;
  const nodes = org?.ipAllowListEntries?.nodes;
  if (!Array.isArray(nodes)) {
    return { ownerId, entries: [] };
  }

  const entries: IpAllowListEntry[] = [];
  for (const node of nodes) {
    if (node && typeof node.cidr === 'string') {
      entries.push({
        id: typeof node.id === 'string' ? node.id : undefined,
        name: typeof node.name === 'string' ? node.name : undefined,
        cidr: node.cidr.trim(),
        isActive: node.isActive ?? true,
      });
    }
  }

  return { ownerId, entries };
}

function normalizeCidrKey(cidr: string): string {
  return cidr.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

export class IpAllowListsMigrationModule implements MigrationModule<IpAllowListsData> {
  readonly id = 'ip-allow-lists';
  readonly displayName = 'IP Allow Lists';
  readonly scopeLevel: MigrationScopeLevel = 'organization';
  readonly dependencies: readonly string[] = ['org-settings'];

  async discover(ctx: MigrationContext): Promise<IpAllowListsData> {
    const sourceOrg = ctx.scope.sourceOrg;

    try {
      const res =
        await ctx.sourceClient.queryGraphQL<RawGraphQLIpAllowListResponse>(
          GET_ORG_IP_ALLOW_LIST_QUERY,
          { org: sourceOrg },
          ctx.signal,
        );

      const parsed = parseEntries(res.data);
      return {
        organization: sourceOrg,
        ownerId: parsed.ownerId,
        entries: parsed.entries,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to discover IP allow list entries for ${sourceOrg}: ${message}`,
        { cause: err },
      );
    }
  }

  async plan(
    ctx: MigrationContext,
    source: IpAllowListsData,
  ): Promise<ModulePlan> {
    const targetOrg = ctx.scope.targetOrg;
    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    let targetOwnerId: string | undefined = undefined;
    let targetEntries: IpAllowListEntry[] = [];

    try {
      const res =
        await ctx.targetClient.queryGraphQL<RawGraphQLIpAllowListResponse>(
          GET_ORG_IP_ALLOW_LIST_QUERY,
          { org: targetOrg },
          ctx.signal,
        );
      const parsed = parseEntries(res.data);
      targetOwnerId = parsed.ownerId;
      targetEntries = parsed.entries;
    } catch (err: unknown) {
      ctx.logger.warn(
        `Could not query target IP allow list for ${targetOrg}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (source.entries.length > 0) {
      warnings.push(
        `IP allow lists are configured for source organization ${source.organization}. Ensure destination IP allow list permits GitHub migration and webhook infrastructure IP ranges.`,
      );
    }

    const targetMap = new Map<string, IpAllowListEntry>();
    for (const te of targetEntries) {
      targetMap.set(te.cidr.toLowerCase(), te);
    }

    for (const entry of source.entries) {
      const key = entry.cidr.toLowerCase();
      const existing = targetMap.get(key);

      if (existing) {
        const needsUpdate =
          existing.isActive !== entry.isActive ||
          (entry.name !== undefined && existing.name !== entry.name);

        if (needsUpdate) {
          operations.push({
            id: `op-update-ip-allow-${normalizeCidrKey(entry.cidr)}`,
            resourceType: 'ip_allow_list_entry',
            resourceName: entry.cidr,
            operation: 'update',
            sourceState: entry as unknown as Record<string, unknown>,
            destinationCurrentState: existing as unknown as Record<
              string,
              unknown
            >,
            payload: {
              ipAllowListEntryId: existing.id,
              cidr: entry.cidr,
              name: entry.name,
              isActive: entry.isActive,
            },
            reason: `Reconciling IP allow list entry for "${entry.cidr}"`,
          });
        } else {
          operations.push({
            id: `op-noop-ip-allow-${normalizeCidrKey(entry.cidr)}`,
            resourceType: 'ip_allow_list_entry',
            resourceName: entry.cidr,
            operation: 'noop',
            sourceState: entry as unknown as Record<string, unknown>,
            destinationCurrentState: existing as unknown as Record<
              string,
              unknown
            >,
            reason: `IP allow list entry for "${entry.cidr}" already matches on target`,
          });
        }
      } else {
        operations.push({
          id: `op-create-ip-allow-${normalizeCidrKey(entry.cidr)}`,
          resourceType: 'ip_allow_list_entry',
          resourceName: entry.cidr,
          operation: 'create',
          sourceState: entry as unknown as Record<string, unknown>,
          payload: {
            ownerId: targetOwnerId,
            cidr: entry.cidr,
            name: entry.name,
            isActive: entry.isActive,
          },
          reason: `Creating IP allow list entry for "${entry.cidr}" on target`,
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
    const results: OperationExecutionResult[] = [];

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
          `[dry-run] Would execute ${op.operation} for IP allow list entry "${op.resourceName}"`,
        );
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

      const client = ctx.targetWriteClient;
      const payload = op.payload as
        | {
            ownerId?: string | undefined;
            ipAllowListEntryId?: string | undefined;
            cidr: string;
            name?: string | undefined;
            isActive: boolean;
          }
        | undefined;

      try {
        if (op.operation === 'create') {
          const input: Record<string, unknown> = {
            cidr: payload?.cidr ?? op.resourceName,
            isActive: payload?.isActive ?? true,
          };
          if (payload?.ownerId) {
            input.ownerId = payload.ownerId;
          }
          if (payload?.name) {
            input.name = payload.name;
          }

          const writeOp: TargetWriteOperation = {
            id: `mutate-${op.id}`,
            method: 'POST',
            path: '/graphql',
            body: {
              query: CREATE_IP_ALLOW_LIST_ENTRY_MUTATION,
              variables: { input },
            },
          };
          const res = await client.mutate(writeOp, ctx.signal);
          results.push({
            operationId: op.id,
            status: 'succeeded',
            httpStatus: res.status,
            completedAt: new Date().toISOString(),
          });
        } else if (op.operation === 'update') {
          const input: Record<string, unknown> = {
            ipAllowListEntryId: payload?.ipAllowListEntryId,
            cidr: payload?.cidr ?? op.resourceName,
            isActive: payload?.isActive ?? true,
          };
          if (payload?.name) {
            input.name = payload.name;
          }

          const writeOp: TargetWriteOperation = {
            id: `mutate-${op.id}`,
            method: 'POST',
            path: '/graphql',
            body: {
              query: UPDATE_IP_ALLOW_LIST_ENTRY_MUTATION,
              variables: { input },
            },
          };
          const res = await client.mutate(writeOp, ctx.signal);
          results.push({
            operationId: op.id,
            status: 'succeeded',
            httpStatus: res.status,
            completedAt: new Date().toISOString(),
          });
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        ctx.logger.error(
          `Failed to apply operation ${op.id} for IP allow list entry "${op.resourceName}": ${errorMsg}`,
        );
        results.push({
          operationId: op.id,
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: errorMsg,
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

    let targetEntries: IpAllowListEntry[];
    try {
      const res =
        await ctx.targetClient.queryGraphQL<RawGraphQLIpAllowListResponse>(
          GET_ORG_IP_ALLOW_LIST_QUERY,
          { org: targetOrg },
          ctx.signal,
        );
      targetEntries = parseEntries(res.data).entries;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      discrepancies.push({
        resourceName: `${targetOrg}:ip_allow_lists`,
        expected: 'accessible',
        actual: `Failed to query: ${message}`,
        message: `Failed to query target IP allow list on ${targetOrg}: ${message}`,
      });
      return {
        moduleId: this.id,
        verified: false,
        discrepancies,
      };
    }

    const targetMap = new Map<string, IpAllowListEntry>();
    for (const te of targetEntries) {
      targetMap.set(te.cidr.toLowerCase(), te);
    }

    for (const op of plan.operations) {
      if (
        op.operation === 'noop' ||
        op.operation === 'update' ||
        op.operation === 'create'
      ) {
        const payload =
          (op.payload as IpAllowListEntry | undefined) ??
          (op.sourceState as IpAllowListEntry | undefined);
        const cidr = op.resourceName;
        const act = targetMap.get(cidr.toLowerCase());

        if (!act) {
          discrepancies.push({
            resourceName: `${targetOrg} (ip_allow_list_entries.${cidr})`,
            expected: cidr,
            actual: null,
            message: `Expected IP allow list entry for CIDR "${cidr}" is missing on target organization ${targetOrg}.`,
          });
          continue;
        }

        if (
          payload?.isActive !== undefined &&
          act.isActive !== payload.isActive
        ) {
          discrepancies.push({
            resourceName: `${targetOrg} (ip_allow_list_entries.${cidr}.isActive)`,
            expected: payload.isActive,
            actual: act.isActive,
            message: `IP allow list entry "${cidr}" isActive mismatch: expected ${payload.isActive}, got ${act.isActive}.`,
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
