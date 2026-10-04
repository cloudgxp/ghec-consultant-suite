import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GhasSecurityMigrationModule,
  diffSecuritySettings,
  matchAlertRemediations,
  SECRET_SCANNING_LIMITATION_NOTICE,
  SARIF_LIMITATION_NOTICE,
  type RepositorySecuritySettings,
  type SecretScanningAlert,
} from '../../src/post-migration/security/index.js';
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

  constructor(
    private readonly settings: RepositorySecuritySettings = {},
    private readonly secretAlerts: SecretScanningAlert[] = [],
  ) {}

  async readSingle<T>(
    operation: ReadOperation,
  ): Promise<{ data: T; status: number; observedAt: string }> {
    if (operation.path.includes('/secret-scanning/alerts')) {
      const stateParam = operation.queryParams?.state;
      const filtered = this.secretAlerts.filter(
        (a) => !stateParam || a.state === stateParam,
      );
      return {
        data: filtered as unknown as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    }

    if (operation.id === 'rest.repos.getSecuritySettings') {
      return {
        data: {
          security_and_analysis: this.settings,
        } as unknown as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    }

    if (operation.path.includes('/code-scanning/analyses')) {
      return {
        data: [
          {
            id: 101,
            ref: 'refs/heads/main',
            commit_sha: 'sha-abcdef123',
            tool: { name: 'CodeQL', version: '2.15.0' },
            sarif: '{"runs":[]}',
          },
        ] as unknown as T,
        status: 200,
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

  async mutate<T = unknown>(
    op: TargetWriteOperation,
  ): Promise<{ status: number; data?: T | undefined }> {
    this.operations.push(op);
    if (op.id === 'rest.codeScanning.uploadSarif') {
      return { status: 202, data: { id: 'sarif-upload-123' } as unknown as T };
    }
    return { status: 200, data: undefined };
  }
}

function createMockContext(options: {
  sourceSettings?: RepositorySecuritySettings;
  targetSettings?: RepositorySecuritySettings;
  sourceAlerts?: SecretScanningAlert[];
  targetAlerts?: SecretScanningAlert[];
  writeClient?: TargetWriteClient;
  dryRun?: boolean;
}): MigrationContext {
  return {
    runId: 'test-run-security',
    scope: {
      level: 'repository',
      sourceOrg: 'source-org',
      targetOrg: 'target-org',
      sourceRepo: 'sec-repo',
      targetRepo: 'sec-repo',
    },
    sourceClient: new MockReadAdapter(
      options.sourceSettings ?? {},
      options.sourceAlerts ?? [],
    ),
    targetClient: new MockReadAdapter(
      options.targetSettings ?? {},
      options.targetAlerts ?? [],
    ),
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

test('diffSecuritySettings plans feature enabling and handles GHAS license boundary', () => {
  const source: RepositorySecuritySettings = {
    advanced_security: { status: 'enabled' },
    secret_scanning: { status: 'enabled' },
    secret_scanning_push_protection: { status: 'enabled' },
    dependabot_security_updates: { status: 'enabled' },
  };

  const target: RepositorySecuritySettings = {
    advanced_security: { status: 'disabled' },
    secret_scanning: { status: 'disabled' },
    secret_scanning_push_protection: { status: 'disabled' },
    dependabot_security_updates: { status: 'disabled' },
  };

  // 1. With available license: all features enabled
  const diffWithLicense = diffSecuritySettings(source, target, {
    targetHasGhasLicense: true,
  });
  assert.equal(diffWithLicense.hasChanges, true);
  assert.equal(diffWithLicense.payload.advanced_security?.status, 'enabled');
  assert.equal(diffWithLicense.payload.secret_scanning?.status, 'enabled');
  assert.equal(
    diffWithLicense.payload.secret_scanning_push_protection?.status,
    'enabled',
  );
  assert.equal(
    diffWithLicense.payload.dependabot_security_updates?.status,
    'enabled',
  );

  // 2. Without license: advanced security and secret scanning skipped with warning
  const diffWithoutLicense = diffSecuritySettings(source, target, {
    targetHasGhasLicense: false,
  });
  assert.equal(diffWithoutLicense.payload.advanced_security, undefined);
  assert.equal(diffWithoutLicense.payload.secret_scanning, undefined);
  assert.equal(
    diffWithoutLicense.payload.dependabot_security_updates?.status,
    'enabled',
  );
  assert.ok(
    diffWithoutLicense.warnings.some((w) =>
      w.includes('no available GHAS licenses'),
    ),
  );

  // 3. Noop when target already matches source
  const noopDiff = diffSecuritySettings(source, source);
  assert.equal(noopDiff.hasChanges, false);
});

test('matchAlertRemediations matches open target alerts to source resolved alerts', () => {
  const sourceResolved: SecretScanningAlert[] = [
    {
      number: 1,
      secret_type: 'github_personal_access_token',
      state: 'resolved',
      resolution: 'false_positive',
      resolution_comment: 'Generated for dev test suite mock',
    },
    {
      number: 2,
      secret_type: 'slack_api_token',
      state: 'resolved',
      resolution: 'revoked',
      resolution_comment: 'Token rotated immediately in vault',
    },
  ];

  const targetOpen: SecretScanningAlert[] = [
    {
      number: 10,
      secret_type: 'github_personal_access_token',
      state: 'open',
    },
    {
      number: 11,
      secret_type: 'slack_api_token',
      state: 'open',
    },
    {
      number: 12,
      secret_type: 'unrelated_secret_type',
      state: 'open',
    },
  ];

  const matches = matchAlertRemediations(sourceResolved, targetOpen);
  assert.equal(matches.length, 2);

  const patMatch = matches.find(
    (m) => m.secretType === 'github_personal_access_token',
  )!;
  assert.equal(patMatch.targetAlertNumber, 10);
  assert.equal(patMatch.sourceResolution, 'false_positive');
  assert.ok(
    patMatch.resolutionComment.includes('Generated for dev test suite mock'),
  );

  const slackMatch = matches.find((m) => m.secretType === 'slack_api_token')!;
  assert.equal(slackMatch.targetAlertNumber, 11);
  assert.equal(slackMatch.sourceResolution, 'revoked');
  assert.ok(slackMatch.resolutionComment.includes('Token rotated immediately'));
});

test('GhasSecurityMigrationModule full lifecycle (discover, plan, apply, verify)', async () => {
  const sourceSettings: RepositorySecuritySettings = {
    advanced_security: { status: 'enabled' },
    secret_scanning: { status: 'enabled' },
  };
  const targetSettings: RepositorySecuritySettings = {
    advanced_security: { status: 'disabled' },
    secret_scanning: { status: 'disabled' },
  };

  const sourceAlerts: SecretScanningAlert[] = [
    {
      number: 1,
      secret_type: 'aws_access_key_id',
      state: 'resolved',
      resolution: 'false_positive',
      resolution_comment: 'Sample documentation key',
    },
  ];

  const targetAlerts: SecretScanningAlert[] = [
    {
      number: 99,
      secret_type: 'aws_access_key_id',
      state: 'open',
    },
  ];

  const writeClient = new MockWriteClient();
  const module = new GhasSecurityMigrationModule({ syncSarif: true });

  // 1. Verify Module Registry integration
  const registry = createDefaultModuleRegistry();
  assert.ok(registry.get('security'));

  // 2. Discover
  const ctx = createMockContext({
    sourceSettings,
    targetSettings,
    sourceAlerts,
    targetAlerts,
    writeClient,
  });

  const discovered = await module.discover(ctx);
  assert.equal(discovered.settings.advanced_security?.status, 'enabled');
  assert.equal(discovered.resolvedAlerts.length, 1);
  assert.equal(discovered.sarifAnalyses?.length, 1);

  // 3. Plan
  const plan = await module.plan(ctx, discovered);
  assert.equal(plan.moduleId, 'security');
  assert.ok(plan.operations.length >= 3); // settings + alert remediation + sarif

  const settingsOp = plan.operations.find(
    (op) => op.resourceType === 'repository-security-settings',
  );
  assert.equal(settingsOp?.operation, 'update');

  const alertOp = plan.operations.find(
    (op) => op.resourceType === 'secret-scanning-alert',
  );
  assert.equal(alertOp?.operation, 'update');

  const sarifOp = plan.operations.find(
    (op) => op.resourceType === 'code-scanning-sarif',
  );
  assert.equal(sarifOp?.operation, 'create');

  // Verify limitations warnings
  assert.ok(plan.warnings.some((w) => w === SECRET_SCANNING_LIMITATION_NOTICE));
  assert.ok(plan.warnings.some((w) => w === SARIF_LIMITATION_NOTICE));

  // 4. Dry-run Apply
  const dryCtx = createMockContext({
    sourceSettings,
    targetSettings,
    writeClient,
    dryRun: true,
  });
  const dryResult = await module.apply(dryCtx, plan);
  assert.equal(dryResult.status, 'complete');
  assert.equal(writeClient.operations.length, 0);

  // 5. Live Apply
  const liveResult = await module.apply(ctx, plan);
  assert.equal(liveResult.status, 'complete');
  assert.equal(writeClient.operations.length, 3);

  // 6. Fidelity Report Generation
  const report = module.generateFidelityReport(discovered, plan, liveResult);
  assert.equal(report.featuresConfigured.advanced_security, 'enabled');
  assert.equal(report.featuresConfigured.secret_scanning, 'enabled');
  assert.equal(report.secretAlertsRemediatedCount, 1);
  assert.equal(report.sarifUploaded, true);
  assert.equal(report.limitationsNotices.length, 2);

  // 7. Verify when target state matches
  const verifiedCtx = createMockContext({
    targetSettings: sourceSettings,
    targetAlerts: [], // no remaining open alerts
    writeClient,
  });
  const verification = await module.verify(verifiedCtx, plan);
  assert.equal(verification.verified, true);
  assert.equal(verification.discrepancies.length, 0);

  // 8. Verify discrepancy detection when target alert remains open
  const discrepancyCtx = createMockContext({
    targetSettings: sourceSettings,
    targetAlerts, // alert 99 still open
    writeClient,
  });
  const failedVerify = await module.verify(discrepancyCtx, plan);
  assert.equal(failedVerify.verified, false);
  assert.equal(failedVerify.discrepancies.length, 1);
  assert.ok(
    failedVerify.discrepancies[0]!.message.includes('is still open on target'),
  );
});
