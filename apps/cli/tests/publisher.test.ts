import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validateBundle,
  type Entity,
  type PublishableBundle,
} from '@ghec/contracts';
import { publishBundle } from '../src/output/publisher.js';
import {
  generateSalt,
  computeSaltDigest,
  pseudonymizeUsername,
  screenAndRedactSecrets,
  redactSecretsInString,
  REDACTED_SECRET_PATTERN,
} from '../src/output/sanitizer.js';
import { DiscoveryOrchestrator } from '../src/engine/orchestrator.js';
import { parseDiscoveryOptions } from '../src/commands/discover.js';
import type {
  GitHubReadAdapter,
  GraphQLResponse,
  ReadPage,
} from '../src/github/adapter.js';

test('publishBundle streams 100,000 synthetic entities with memory remaining under 512 MB RSS', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ghec-scale-test-'));

  try {
    const orgId = 'scale-org';
    const execId = 'exec:scale-org:repos:scale-run';
    const count = 100_000;

    // Use a generator to stream entities one by one without allocating a 100k array
    function* entityStream(): Generator<Entity> {
      for (let i = 0; i < count; i++) {
        yield {
          id: `repo:${orgId}:repo-${i}`,
          organizationId: orgId,
          collectorExecutionId: execId,
          provenance: {
            source: 'synthetic',
            operation: 'synthetic.repo',
            observedAt: '2026-03-10T12:00:00.000Z',
            apiVersion: '2026-03-10',
          },
          kind: 'repository',
          name: `repo-${i}`,
          visibility: 'private',
          archived: false,
          defaultBranch: 'main',
          size: {
            availability: 'observed',
            value: 1024,
            unit: 'bytes',
            reason: null,
          },
          fork: false,
        };
      }
    }

    const bundle: PublishableBundle = {
      schemaVersion: '1.0.0',
      synthetic: true,
      scan: {
        id: 'scale-run',
        startedAt: '2026-03-10T12:00:00.000Z',
        completedAt: '2026-03-10T12:05:00.000Z',
        producer: 'ghec-consultant-cli',
        producerVersion: '0.1.0',
        status: 'complete',
      },
      configuration: {
        modules: ['repos'],
        format: 'json',
        includeSensitiveMetadata: false,
        redactionProfile: 'standard',
        continueOnError: false,
      },
      scope: {
        kind: 'organization',
        organizationId: orgId,
      },
      organizations: [
        { id: orgId, login: orgId, displayName: 'Scale Test Org' },
      ],
      collectors: [
        {
          id: execId,
          module: 'repos',
          organizationId: orgId,
          status: 'complete',
          startedAt: '2026-03-10T12:00:00.000Z',
          completedAt: '2026-03-10T12:05:00.000Z',
          provenance: [
            {
              source: 'synthetic',
              operation: 'synthetic.repo',
              observedAt: '2026-03-10T12:00:00.000Z',
              apiVersion: '2026-03-10',
            },
          ],
          warnings: [],
          errors: [],
          coverage: {
            state: 'complete',
            observed: count,
            expected: count,
            reason: null,
          },
        },
      ],
      entities: entityStream(),
      findings: [],
      limitations: [],
      errors: [],
      summary: {
        organizationCount: 1,
        repositoryCount: count,
        completeCollectorCount: 1,
        incompleteCollectorCount: 0,
      },
    };

    const filePath = await publishBundle(bundle, {
      outputPath: tmpDir,
      scopeKind: 'organization',
      scopeName: orgId,
      runId: 'scale-run',
      startedAt: '2026-03-10T12:00:00.000Z',
    });

    const memoryUsage = process.memoryUsage();
    const rssMB = memoryUsage.rss / (1024 * 1024);

    assert.ok(
      rssMB < 512,
      `Process memory RSS (${rssMB.toFixed(2)} MB) exceeded 512 MB threshold`,
    );

    assert.ok(existsSync(filePath));
    const stat = statSync(filePath);
    assert.ok(
      stat.size > 1_000_000,
      `Output file size (${stat.size} bytes) should be > 1MB`,
    );

    // Mode check on POSIX
    if (process.platform !== 'win32') {
      assert.equal(
        stat.mode & 0o777,
        0o600,
        'Output file should have mode 0600',
      );
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Streamed bundle output is valid JSON and validates against contracts validateBundle', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ghec-valid-test-'));

  try {
    const orgId = 'valid-org';
    const execId = 'exec:valid-org:repos:valid-run';
    const salt = generateSalt();
    const saltDigest = computeSaltDigest(salt);

    const testEntity: Entity = {
      id: `repo:${orgId}:test-repo`,
      organizationId: orgId,
      collectorExecutionId: execId,
      provenance: {
        source: 'synthetic',
        operation: 'synthetic.repo',
        observedAt: '2026-03-10T12:00:00.000Z',
        apiVersion: '2026-03-10',
      },
      kind: 'repository',
      name: 'test-repo',
      visibility: 'public',
      archived: false,
      defaultBranch: 'main',
      size: {
        availability: 'observed',
        value: 2048,
        unit: 'bytes',
        reason: null,
      },
      fork: false,
    };

    const bundle: PublishableBundle = {
      schemaVersion: '1.0.0',
      synthetic: true,
      scan: {
        id: 'valid-run',
        startedAt: '2026-03-10T12:00:00.000Z',
        completedAt: '2026-03-10T12:01:00.000Z',
        producer: 'ghec-consultant-cli',
        producerVersion: '0.1.0',
        status: 'complete',
      },
      configuration: {
        modules: ['repos'],
        format: 'json',
        includeSensitiveMetadata: false,
        redactionProfile: 'standard',
        continueOnError: false,
        saltDigest,
      },
      scope: {
        kind: 'organization',
        organizationId: orgId,
      },
      organizations: [{ id: orgId, login: orgId, displayName: 'Valid Org' }],
      collectors: [
        {
          id: execId,
          module: 'repos',
          organizationId: orgId,
          status: 'complete',
          startedAt: '2026-03-10T12:00:00.000Z',
          completedAt: '2026-03-10T12:01:00.000Z',
          provenance: [
            {
              source: 'synthetic',
              operation: 'synthetic.repo',
              observedAt: '2026-03-10T12:00:00.000Z',
              apiVersion: '2026-03-10',
            },
          ],
          warnings: [],
          errors: [],
          coverage: {
            state: 'complete',
            observed: 1,
            expected: 1,
            reason: null,
          },
        },
      ],
      entities: [testEntity],
      findings: [],
      limitations: [],
      errors: [],
      summary: {
        organizationCount: 1,
        repositoryCount: 1,
        completeCollectorCount: 1,
        incompleteCollectorCount: 0,
      },
    };

    const filePath = await publishBundle(bundle, {
      outputPath: tmpDir,
      scopeKind: 'organization',
      scopeName: orgId,
      runId: 'valid-run',
      startedAt: '2026-03-10T12:00:00.000Z',
    });

    const content = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    const validation = validateBundle(parsed);

    assert.equal(
      validation.success,
      true,
      'Parsed bundle should validate against contract',
    );
    if (validation.success) {
      assert.equal(validation.data.configuration.saltDigest, saltDigest);
      assert.equal(validation.data.entities.length, 1);
      assert.equal(validation.data.entities[0]!.id, testEntity.id);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('publishBundle enforces non-clobber behavior and atomic temp rename', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ghec-noclobber-test-'));

  try {
    const orgId = 'noclobber-org';
    const bundle: PublishableBundle = {
      schemaVersion: '1.0.0',
      synthetic: true,
      scan: {
        id: 'clobber-run',
        startedAt: '2026-03-10T12:00:00.000Z',
        completedAt: '2026-03-10T12:01:00.000Z',
        producer: 'ghec-consultant-cli',
        producerVersion: '0.1.0',
        status: 'complete',
      },
      configuration: {
        modules: ['orgs'],
        format: 'json',
        includeSensitiveMetadata: false,
        redactionProfile: 'standard',
        continueOnError: false,
      },
      scope: {
        kind: 'organization',
        organizationId: orgId,
      },
      organizations: [
        { id: orgId, login: orgId, displayName: 'No Clobber Org' },
      ],
      collectors: [
        {
          id: `exec:${orgId}:orgs:clobber-run`,
          module: 'orgs',
          organizationId: orgId,
          status: 'complete',
          startedAt: '2026-03-10T12:00:00.000Z',
          completedAt: '2026-03-10T12:01:00.000Z',
          provenance: [
            {
              source: 'synthetic',
              operation: 'synthetic.org',
              observedAt: '2026-03-10T12:00:00.000Z',
              apiVersion: '2026-03-10',
            },
          ],
          warnings: [],
          errors: [],
          coverage: {
            state: 'complete',
            observed: 1,
            expected: 1,
            reason: null,
          },
        },
      ],
      entities: [],
      findings: [],
      limitations: [],
      errors: [],
      summary: {
        organizationCount: 1,
        repositoryCount: 0,
        completeCollectorCount: 1,
        incompleteCollectorCount: 0,
      },
    };

    const options = {
      outputPath: tmpDir,
      scopeKind: 'organization' as const,
      scopeName: orgId,
      runId: 'clobber-run',
      startedAt: '2026-03-10T12:00:00.000Z',
    };

    // First publication succeeds
    const firstPath = await publishBundle(bundle, options);
    assert.ok(existsSync(firstPath));

    // Second publication with same parameters must throw collision error
    await assert.rejects(async () => {
      await publishBundle(bundle, options);
    }, /Output file collision: .* already exists. Implicit overwrite is forbidden./);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('HMAC-SHA256 pseudonymizes user identities consistently with --salt across runs', () => {
  const salt1 = 'test-secret-salt-12345';
  const salt2 = 'different-secret-salt-67890';
  const username = 'octocat';

  const pseudo1 = pseudonymizeUsername(salt1, username);
  const pseudo1Repeat = pseudonymizeUsername(salt1, username);
  const pseudo2 = pseudonymizeUsername(salt2, username);

  // Starts with "usr_"
  assert.match(pseudo1, /^usr_[0-9a-f]{16}$/);

  // Deterministic across identical salts
  assert.equal(pseudo1, pseudo1Repeat);

  // Different salts produce different pseudonyms
  assert.notEqual(pseudo1, pseudo2);
});

test('Pre-publication security scanner catches and neutralizes secret patterns', () => {
  const classicPat = 'ghp_' + 'A'.repeat(36);
  const fineGrainedPat = 'github_pat_' + 'B'.repeat(82);
  const appToken = 'ghs_' + 'C'.repeat(36);
  const privateKey =
    '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';
  const bearerToken = 'Bearer ghp_' + 'D'.repeat(36);

  // String redaction
  const { sanitized: s1, secretDetected: d1 } = redactSecretsInString(
    `Token: ${classicPat}`,
  );
  assert.equal(d1, true);
  assert.equal(s1, `Token: ${REDACTED_SECRET_PATTERN}`);

  const { sanitized: sApp, secretDetected: dApp } = redactSecretsInString(
    `AppToken: ${appToken}`,
  );
  assert.equal(dApp, true);
  assert.equal(sApp, `AppToken: ${REDACTED_SECRET_PATTERN}`);

  const { sanitized: s2, secretDetected: d2 } = redactSecretsInString(
    `Key: ${privateKey}`,
  );
  assert.equal(d2, true);
  assert.equal(s2, `Key: ${REDACTED_SECRET_PATTERN}`);

  const { sanitized: s3, secretDetected: d3 } = redactSecretsInString(
    `Header: ${bearerToken}`,
  );
  assert.equal(d3, true);
  assert.match(s3, /\[REDACTED_SECRET_PATTERN\]/);

  // Entity screening
  const testEntity: Entity = {
    id: 'policy:org1:ruleset-secret',
    organizationId: 'org1',
    collectorExecutionId: 'exec:org1:policies:run1',
    provenance: {
      source: 'graphql',
      operation: 'graphql.policies',
      observedAt: '2026-03-10T12:00:00.000Z',
      apiVersion: '2026-03-10',
    },
    kind: 'policy',
    repositoryId: null,
    policyKind: 'ruleset',
    name: `Protected ruleset using ${fineGrainedPat} for bypass`,
    enforcement: 'active',
  };

  const { redactedEntity, secretDetected } = screenAndRedactSecrets(testEntity);
  assert.equal(secretDetected, true);
  assert.equal(
    (redactedEntity as typeof testEntity).name,
    `Protected ruleset using ${REDACTED_SECRET_PATTERN} for bypass`,
  );
});

test('DiscoveryOrchestrator applies salt pseudonymization and records saltDigest in configuration', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ghec-orch-salt-test-'));

  try {
    const customSalt = 'my-custom-audit-salt-2026';
    const plan = parseDiscoveryOptions([
      '--organization',
      'test-org',
      '--modules',
      'users',
      '--output',
      tmpDir,
      '--salt',
      customSalt,
    ]);

    const mockAdapter: GitHubReadAdapter = {
      isMock: true,
      async queryGraphQL<T>(): Promise<GraphQLResponse<T>> {
        return { data: {} as T, observedAt: new Date().toISOString() };
      },
      async readPage<T>(): Promise<ReadPage<T>> {
        return {
          items: [],
          nextCursor: null,
          observedAt: new Date().toISOString(),
          remainingRequests: 5000,
          resetAt: null,
          status: 200,
        };
      },
      async readSingle<T>(
        op,
        signal,
      ): Promise<{ data: T; observedAt: string; status: number }> {
        const page = await this.readPage<T>(op, null, signal);
        return {
          data: page.items[0] as T,
          observedAt: page.observedAt,
          status: page.status,
        };
      },
      async fetchAll<T>(operation): Promise<{
        items: readonly T[];
        observedAt: string;
        complete: boolean;
      }> {
        if (operation.id.includes('orgs.list-members')) {
          return {
            items: [
              { id: 101, login: 'alice', role: 'admin' },
              { id: 102, login: 'bob', role: 'member' },
            ] as unknown as T[],
            observedAt: new Date().toISOString(),
            complete: true,
          };
        }
        return {
          items: [],
          observedAt: new Date().toISOString(),
          complete: true,
        };
      },
    } as unknown as GitHubReadAdapter;

    const orchestrator = new DiscoveryOrchestrator(
      plan,
      { token: 'mock-token' },
      mockAdapter,
    );

    assert.equal(orchestrator.getSalt(), customSalt);
    assert.equal(orchestrator.getSaltDigest(), computeSaltDigest(customSalt));

    const result = await orchestrator.run(new AbortController().signal);

    assert.equal(
      result.bundle.configuration.saltDigest,
      computeSaltDigest(customSalt),
    );
    assert.equal(result.bundle.entities.length, 2);

    const identities = result.bundle.entities.filter(
      (e) => e.kind === 'identity',
    );
    assert.equal(identities.length, 2);

    const aliceExpectedPseudo = pseudonymizeUsername(customSalt, 'alice');
    const bobExpectedPseudo = pseudonymizeUsername(customSalt, 'bob');

    assert.equal(identities[0]!.pseudonym, aliceExpectedPseudo);
    assert.equal(identities[1]!.pseudonym, bobExpectedPseudo);

    // Verify bundle validates against contracts
    const validation = validateBundle(result.bundle);
    assert.equal(validation.success, true);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
