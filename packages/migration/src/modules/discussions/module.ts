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
  DiscussionCategory,
  DiscussionPost,
  DiscussionsData,
  RawGraphQLRepoDiscussionsResponse,
} from './types.js';

export const GET_REPO_DISCUSSIONS_QUERY = `
  query GetRepoDiscussions($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      id
      hasDiscussionsEnabled
      discussionCategories(first: 50) {
        nodes {
          id
          name
          slug
          description
          isAnswerable
        }
      }
      discussions(first: 100) {
        nodes {
          id
          number
          title
          body
          category {
            id
            name
            slug
          }
          author {
            login
          }
          createdAt
        }
      }
    }
  }
`;

export const CREATE_DISCUSSION_MUTATION = `
  mutation CreateDiscussion($input: CreateDiscussionInput!) {
    createDiscussion(input: $input) {
      discussion {
        id
        title
        url
      }
    }
  }
`;

function parseRepoDiscussions(
  owner: string,
  repo: string,
  res?: RawGraphQLRepoDiscussionsResponse | null | undefined,
): DiscussionsData {
  const repository = res?.repository;
  const repositoryId =
    typeof repository?.id === 'string' ? repository.id : undefined;
  const hasDiscussionsEnabled = repository?.hasDiscussionsEnabled ?? false;

  const rawCats = repository?.discussionCategories?.nodes;
  const categories: DiscussionCategory[] = [];
  if (Array.isArray(rawCats)) {
    for (const c of rawCats) {
      if (c && typeof c.id === 'string' && typeof c.name === 'string') {
        categories.push({
          id: c.id,
          name: c.name,
          slug: c.slug,
          description:
            typeof c.description === 'string' ? c.description : undefined,
          isAnswerable: c.isAnswerable ?? false,
        });
      }
    }
  }

  const rawDiscs = repository?.discussions?.nodes;
  const discussions: DiscussionPost[] = [];
  if (Array.isArray(rawDiscs)) {
    for (const d of rawDiscs) {
      if (d && typeof d.id === 'string' && typeof d.title === 'string') {
        discussions.push({
          id: d.id,
          number: typeof d.number === 'number' ? d.number : undefined,
          title: d.title,
          body: d.body ?? '',
          categoryName: d.category?.name ?? 'General',
          author: d.author?.login,
          createdAt: typeof d.createdAt === 'string' ? d.createdAt : undefined,
        });
      }
    }
  }

  return {
    owner,
    repo,
    repositoryId,
    hasDiscussionsEnabled,
    categories,
    discussions,
  };
}

function formatDiscussionBody(
  body: string,
  author?: string,
  createdAt?: string,
): string {
  if (!author) return body;
  const dateStr = createdAt ? ` on ${createdAt}` : '';
  const attribution = `> **Originally posted by @${author}${dateStr} (migrated from source enterprise)**\n\n`;
  return `${attribution}${body}`;
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .slice(0, 50);
}

export class DiscussionsMigrationModule implements MigrationModule<DiscussionsData> {
  readonly id = 'discussions';
  readonly displayName = 'Repository Discussions';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['repo-settings'];

  async discover(ctx: MigrationContext): Promise<DiscussionsData> {
    const sourceOrg = ctx.scope.sourceOrg;
    const sourceRepo = ctx.scope.sourceRepo ?? '';

    if (!sourceRepo) {
      return {
        owner: sourceOrg,
        repo: '',
        hasDiscussionsEnabled: false,
        categories: [],
        discussions: [],
      };
    }

    try {
      const res =
        await ctx.sourceClient.queryGraphQL<RawGraphQLRepoDiscussionsResponse>(
          GET_REPO_DISCUSSIONS_QUERY,
          { owner: sourceOrg, name: sourceRepo },
          ctx.signal,
        );

      return parseRepoDiscussions(sourceOrg, sourceRepo, res.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to discover discussions for ${sourceOrg}/${sourceRepo}: ${message}`,
        { cause: err },
      );
    }
  }

  async plan(
    ctx: MigrationContext,
    source: DiscussionsData,
  ): Promise<ModulePlan> {
    const targetOrg = ctx.scope.targetOrg;
    const targetRepo = ctx.scope.targetRepo ?? source.repo;
    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    let targetDiscussionsData: DiscussionsData = {
      owner: targetOrg,
      repo: targetRepo,
      hasDiscussionsEnabled: false,
      categories: [],
      discussions: [],
    };

    try {
      const res =
        await ctx.targetClient.queryGraphQL<RawGraphQLRepoDiscussionsResponse>(
          GET_REPO_DISCUSSIONS_QUERY,
          { owner: targetOrg, name: targetRepo },
          ctx.signal,
        );
      targetDiscussionsData = parseRepoDiscussions(
        targetOrg,
        targetRepo,
        res.data,
      );
    } catch (err: unknown) {
      ctx.logger.warn(
        `Could not query target discussions for ${targetOrg}/${targetRepo}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (
      source.discussions.length > 0 &&
      !targetDiscussionsData.hasDiscussionsEnabled
    ) {
      warnings.push(
        `Target repository ${targetOrg}/${targetRepo} does not have Discussions enabled. Discussions will be created once enabled.`,
      );
    }

    const targetCategoriesMap = new Map<string, DiscussionCategory>();
    for (const cat of targetDiscussionsData.categories) {
      targetCategoriesMap.set(cat.name.toLowerCase(), cat);
    }

    const targetDiscussionsMap = new Map<string, DiscussionPost>();
    for (const d of targetDiscussionsData.discussions) {
      targetDiscussionsMap.set(d.title.toLowerCase(), d);
    }

    const defaultCategoryId =
      targetDiscussionsData.categories[0]?.id ?? 'category-general';

    for (const disc of source.discussions) {
      const key = disc.title.toLowerCase();
      const existing = targetDiscussionsMap.get(key);

      if (existing) {
        operations.push({
          id: `op-noop-discussion-${slugifyTitle(disc.title)}`,
          resourceType: 'repository_discussion',
          resourceName: disc.title,
          operation: 'noop',
          sourceState: disc as unknown as Record<string, unknown>,
          destinationCurrentState: existing as unknown as Record<
            string,
            unknown
          >,
          reason: `Discussion "${disc.title}" already exists on target`,
        });
      } else {
        const catKey = disc.categoryName.toLowerCase();
        const matchedCategory = targetCategoriesMap.get(catKey);
        const categoryId = matchedCategory?.id ?? defaultCategoryId;
        const formattedBody = formatDiscussionBody(
          disc.body,
          disc.author,
          disc.createdAt,
        );

        operations.push({
          id: `op-create-discussion-${slugifyTitle(disc.title)}`,
          resourceType: 'repository_discussion',
          resourceName: disc.title,
          operation: 'create',
          sourceState: disc as unknown as Record<string, unknown>,
          payload: {
            repositoryId: targetDiscussionsData.repositoryId,
            categoryId,
            title: disc.title,
            body: formattedBody,
            categoryName: disc.categoryName,
          },
          reason: `Rehydrating discussion "${disc.title}" under category "${disc.categoryName}"`,
        });
      }
    }

    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier: `${targetOrg}/${targetRepo}`,
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
          `[dry-run] Would execute ${op.operation} for discussion "${op.resourceName}"`,
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
            repositoryId?: string | undefined;
            categoryId: string;
            title: string;
            body: string;
          }
        | undefined;

      try {
        const input: Record<string, unknown> = {
          categoryId: payload?.categoryId,
          title: payload?.title ?? op.resourceName,
          body: payload?.body ?? '',
        };
        if (payload?.repositoryId) {
          input.repositoryId = payload.repositoryId;
        }

        const writeOp: TargetWriteOperation = {
          id: `mutate-${op.id}`,
          method: 'POST',
          path: '/graphql',
          body: {
            query: CREATE_DISCUSSION_MUTATION,
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
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        ctx.logger.error(
          `Failed to apply operation ${op.id} for discussion "${op.resourceName}": ${errorMsg}`,
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
    const targetRepo = ctx.scope.targetRepo ?? '';
    const discrepancies: VerificationDiscrepancy[] = [];

    let targetDiscussionsData: DiscussionsData;
    try {
      const res =
        await ctx.targetClient.queryGraphQL<RawGraphQLRepoDiscussionsResponse>(
          GET_REPO_DISCUSSIONS_QUERY,
          { owner: targetOrg, name: targetRepo },
          ctx.signal,
        );
      targetDiscussionsData = parseRepoDiscussions(
        targetOrg,
        targetRepo,
        res.data,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      discrepancies.push({
        resourceName: `${targetOrg}/${targetRepo}:discussions`,
        expected: 'accessible',
        actual: `Failed to query: ${message}`,
        message: `Failed to query target discussions on ${targetOrg}/${targetRepo}: ${message}`,
      });
      return {
        moduleId: this.id,
        verified: false,
        discrepancies,
      };
    }

    const targetMap = new Map<string, DiscussionPost>();
    for (const d of targetDiscussionsData.discussions) {
      targetMap.set(d.title.toLowerCase(), d);
    }

    for (const op of plan.operations) {
      if (op.operation === 'noop' || op.operation === 'create') {
        const title = op.resourceName;
        const act = targetMap.get(title.toLowerCase());

        if (!act) {
          discrepancies.push({
            resourceName: `${targetOrg}/${targetRepo} (discussions.${title})`,
            expected: title,
            actual: null,
            message: `Discussion "${title}" is missing on target repository ${targetOrg}/${targetRepo}.`,
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
