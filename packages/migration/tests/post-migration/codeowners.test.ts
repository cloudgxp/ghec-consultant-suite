import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CodeownersRepairModule,
  rewriteTeamReferences,
  scanCodeownersCandidates,
  applyFileRepair,
  type CodeownersFileCandidate,
} from '../../src/post-migration/codeowners/index.js';
import {
  createDefaultModuleRegistry,
  type MigrationContext,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';
import type {
  GitHubReadAdapter,
  GraphQLResponse,
  ReadOperation,
  ReadPage,
} from '@ghec/github-client';

class MockReadAdapter implements GitHubReadAdapter {
  readonly isMock = true;
  private readonly files: Map<string, { sha: string; content: string }>;

  constructor(files: Record<string, string> = {}) {
    this.files = new Map();
    for (const [path, content] of Object.entries(files)) {
      this.files.set(path, {
        sha: `sha-${path.replace(/[^a-zA-Z0-9]/g, '-')}`,
        content: Buffer.from(content, 'utf8').toString('base64'),
      });
    }
  }

  async readSingle<T>(
    operation: ReadOperation,
  ): Promise<{ data: T; status: number; observedAt: string }> {
    const pathParam = operation.pathParams?.path;
    if (operation.path.includes('/contents/')) {
      if (pathParam && this.files.has(pathParam)) {
        const item = this.files.get(pathParam)!;
        return {
          data: {
            type: 'file',
            path: pathParam,
            sha: item.sha,
            content: item.content,
          } as unknown as T,
          status: 200,
          observedAt: new Date().toISOString(),
        };
      }
      if (pathParam === '.github/ISSUE_TEMPLATE') {
        const matching: Array<{ type: string; path: string; name: string }> =
          [];
        for (const filePath of this.files.keys()) {
          if (filePath.startsWith('.github/ISSUE_TEMPLATE/')) {
            matching.push({
              type: 'file',
              path: filePath,
              name: filePath.split('/').pop()!,
            });
          }
        }
        return {
          data: matching as unknown as T,
          status: 200,
          observedAt: new Date().toISOString(),
        };
      }
      if (pathParam === '.github/workflows') {
        const matching: Array<{ type: string; path: string; name: string }> =
          [];
        for (const filePath of this.files.keys()) {
          if (filePath.startsWith('.github/workflows/')) {
            matching.push({
              type: 'file',
              path: filePath,
              name: filePath.split('/').pop()!,
            });
          }
        }
        return {
          data: matching as unknown as T,
          status: 200,
          observedAt: new Date().toISOString(),
        };
      }
      return {
        data: null as unknown as T,
        status: 404,
        observedAt: new Date().toISOString(),
      };
    }
    return {
      data: {} as T,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async readPage<T>(): Promise<ReadPage<T>> {
    return {
      items: [],
      nextCursor: null,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async fetchAll<T>(): Promise<{
    items: readonly T[];
    observedAt: string;
    complete: boolean;
  }> {
    return { items: [], observedAt: new Date().toISOString(), complete: true };
  }

  async queryGraphQL<T>(): Promise<GraphQLResponse<T>> {
    return { data: {} as T, observedAt: new Date().toISOString() };
  }

  async readEndpoint<T>(): Promise<{ data: T; status: number }> {
    return { data: {} as T, status: 200 };
  }
}

class MockWriteClient implements TargetWriteClient {
  readonly operations: TargetWriteOperation[] = [];
  failDirectCommit = false;

  async mutate<T = unknown>(
    op: TargetWriteOperation,
  ): Promise<{ status: number; data?: T | undefined }> {
    this.operations.push(op);
    if (
      this.failDirectCommit &&
      op.id === 'rest.repos.createOrUpdateFileContents'
    ) {
      return { status: 403, data: undefined };
    }
    if (op.id === 'rest.repos.createPullRequest') {
      return {
        status: 201,
        data: {
          html_url: 'https://github.com/target-org/target-repo/pull/123',
        } as unknown as T,
      };
    }
    return { status: 200, data: undefined };
  }
}

function createMockContext(options: {
  sourceOrg?: string;
  targetOrg?: string;
  sourceRepo?: string;
  targetRepo?: string;
  sourceFiles?: Record<string, string>;
  targetFiles?: Record<string, string>;
  writeClient?: TargetWriteClient;
  dryRun?: boolean;
}): MigrationContext {
  return {
    runId: 'test-run-codeowners',
    scope: {
      level: 'repository',
      sourceOrg: options.sourceOrg ?? 'source-org',
      targetOrg: options.targetOrg ?? 'target-org',
      sourceRepo: options.sourceRepo ?? 'sample-repo',
      targetRepo: options.targetRepo ?? 'sample-repo',
    },
    sourceClient: new MockReadAdapter(options.sourceFiles ?? {}),
    targetClient: new MockReadAdapter(options.targetFiles ?? {}),
    targetWriteClient: options.writeClient,
    signal: new AbortController().signal,
    dryRun: options.dryRun ?? false,
    continueOnError: false,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  };
}

test('rewriteTeamReferences replaces source organization and team slugs', () => {
  const file: CodeownersFileCandidate = {
    path: '.github/CODEOWNERS',
    sha: 'sha-123',
    rawContent: '',
    decodedContent: [
      '# Global owners',
      '* @source-org/core-infra @external-org/partners',
      '/docs/ @source-org/docs-team',
      '/src/backend/ @source-org/backend-team',
    ].join('\n'),
  };

  const teamSlugMap = {
    'core-infra': 'infra-core',
    'backend-team': 'backend-engineers',
  };

  const diff = rewriteTeamReferences(
    file,
    'source-org',
    'target-org',
    teamSlugMap,
  );

  assert.equal(diff.hasChanges, true);
  assert.equal(diff.matches.length, 3);

  // Assert external-org is untouched
  assert.ok(diff.updatedContent.includes('@external-org/partners'));

  // Assert source-org references translated
  assert.ok(
    diff.updatedContent.includes(
      '* @target-org/infra-core @external-org/partners',
    ),
  );
  assert.ok(diff.updatedContent.includes('/docs/ @target-org/docs-team'));
  assert.ok(
    diff.updatedContent.includes('/src/backend/ @target-org/backend-engineers'),
  );
  assert.ok(!diff.updatedContent.includes('@source-org/'));
});

test('rewriteTeamReferences returns hasChanges: false when no source team references exist', () => {
  const file: CodeownersFileCandidate = {
    path: 'CODEOWNERS',
    sha: 'sha-456',
    rawContent: '',
    decodedContent: '* @other-org/some-team @individual-user\n',
  };

  const diff = rewriteTeamReferences(file, 'source-org', 'target-org');
  assert.equal(diff.hasChanges, false);
  assert.equal(diff.matches.length, 0);
  assert.equal(diff.updatedContent, file.decodedContent);
});

test('scanCodeownersCandidates discovers static files and directory templates', async () => {
  const ctx = createMockContext({
    targetFiles: {
      '.github/CODEOWNERS': '* @source-org/security\n',
      '.github/ISSUE_TEMPLATE/bug_report.md':
        'assigned to @source-org/triage\n',
      '.github/workflows/ci.yml': 'name: CI\n',
    },
  });

  const candidates = await scanCodeownersCandidates(
    ctx,
    'target-org',
    'sample-repo',
  );
  assert.equal(candidates.length, 3);
  const paths = candidates.map((c) => c.path);
  assert.ok(paths.includes('.github/CODEOWNERS'));
  assert.ok(paths.includes('.github/ISSUE_TEMPLATE/bug_report.md'));
  assert.ok(paths.includes('.github/workflows/ci.yml'));
});

test('applyFileRepair commits directly to default branch when permitted', async () => {
  const writeClient = new MockWriteClient();
  const ctx = createMockContext({ writeClient });

  const diff = {
    path: '.github/CODEOWNERS',
    sha: 'old-sha',
    originalContent: '* @source-org/team-a',
    updatedContent: '* @target-org/team-a',
    matches: [],
    hasChanges: true,
  };

  const result = await applyFileRepair(ctx, 'target-org', 'sample-repo', diff, {
    mode: 'direct-commit',
  });

  assert.equal(result.status, 'succeeded');
  assert.equal(result.mode, 'direct-commit');
  assert.equal(writeClient.operations.length, 1);
  assert.equal(
    writeClient.operations[0]!.id,
    'rest.repos.createOrUpdateFileContents',
  );
  assert.equal(
    writeClient.operations[0]!.pathParams?.path,
    '.github/CODEOWNERS',
  );
});

test('applyFileRepair falls back to pull request when direct commit fails under auto mode', async () => {
  const writeClient = new MockWriteClient();
  writeClient.failDirectCommit = true;
  const ctx = createMockContext({ writeClient });

  const diff = {
    path: '.github/CODEOWNERS',
    sha: 'old-sha',
    originalContent: '* @source-org/team-a',
    updatedContent: '* @target-org/team-a',
    matches: [],
    hasChanges: true,
  };

  const result = await applyFileRepair(ctx, 'target-org', 'sample-repo', diff, {
    mode: 'auto',
  });

  assert.equal(result.status, 'succeeded');
  assert.equal(result.mode, 'pull-request');
  assert.ok(result.pullRequestUrl?.includes('pull/123'));
  assert.equal(writeClient.operations.length, 3); // direct commit attempt (403) -> PR branch commit -> open PR
});

test('CodeownersRepairModule full lifecycle (discover, plan, apply, verify)', async () => {
  const writeClient = new MockWriteClient();
  const initialContent = '* @source-org/alpha-team @source-org/beta-team\n';
  const targetFiles: Record<string, string> = {
    '.github/CODEOWNERS': initialContent,
  };

  const module = new CodeownersRepairModule({
    teamSlugMap: {
      'alpha-team': 'team-alpha-reformed',
    },
  });

  // Verify registry registration
  const defaultRegistry = createDefaultModuleRegistry();
  assert.ok(defaultRegistry.get('post-migration-codeowners'));

  // 1. Discover
  const ctx = createMockContext({
    sourceFiles: targetFiles,
    targetFiles,
    writeClient,
  });

  const discovered = await module.discover(ctx);
  assert.equal(discovered.files.length, 1);
  assert.equal(discovered.files[0]!.path, '.github/CODEOWNERS');

  // 2. Plan
  const plan = await module.plan(ctx, discovered);
  assert.equal(plan.moduleId, 'post-migration-codeowners');
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0]!.operation, 'update');
  assert.equal(plan.operations[0]!.resourceName, '.github/CODEOWNERS');

  // 3. Dry-Run Apply
  const dryCtx = createMockContext({
    targetFiles,
    writeClient,
    dryRun: true,
  });
  const dryResult = await module.apply(dryCtx, plan);
  assert.equal(dryResult.status, 'complete');
  assert.equal(writeClient.operations.length, 0); // No writes during dry-run

  // 4. Live Apply
  const liveResult = await module.apply(ctx, plan);
  assert.equal(liveResult.status, 'complete');
  assert.equal(writeClient.operations.length, 1);

  // 5. Verify when repaired
  const repairedFiles: Record<string, string> = {
    '.github/CODEOWNERS':
      '* @target-org/team-alpha-reformed @target-org/beta-team\n',
  };
  const verifiedCtx = createMockContext({
    targetFiles: repairedFiles,
    writeClient,
  });
  const verification = await module.verify(verifiedCtx, plan);
  assert.equal(verification.verified, true);
  assert.equal(verification.discrepancies.length, 0);

  // 6. Verify discrepancy detection if untranslated references remain
  const failedVerify = await module.verify(ctx, plan);
  assert.equal(failedVerify.verified, false);
  assert.equal(failedVerify.discrepancies.length, 1);
  assert.ok(
    failedVerify.discrepancies[0]!.message.includes(
      'still contains untranslated source team references',
    ),
  );
});
