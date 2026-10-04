import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runApiSurfaceProbe } from '../../../scripts/collectors/probe-api-surface.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '../../..');

function childProcessEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  // Do not leak the parent test runner's child marker into nested commands.
  // Node processes that inherit it route normal stdout as test protocol data.
  delete env.NODE_TEST_CONTEXT;
  return env;
}

test('collector manifests and validation suite pass completely offline', () => {
  const result = spawnSync('python3', ['scripts/collectors/validate.py'], {
    cwd: root,
    encoding: 'utf8',
    env: childProcessEnv(),
  });
  if (result.status !== 0) {
    console.error(result.stderr);
    console.error(result.stdout);
  }
  assert.equal(result.status, 0, 'validate.py failed');
  assert.match(result.stdout, /ALL VALIDATION CHECKS PASSED PERFECTLY/);
});

test('manifest files and schemas exist with valid JSON', () => {
  const files = [
    'research/github/source-manifest.json',
    'research/github/common-profile.json',
    'research/github/reconciliation.json',
    'research/github/endpoint-inventory.json',
    'research/github/collector-registry.json',
    'research/github/graphql-query-catalog.json',
    'research/github/advanced-domain-reconciliation.json',
    'research/github/schemas/source-manifest.schema.json',
    'research/github/schemas/common-profile.schema.json',
    'research/github/schemas/reconciliation.schema.json',
    'research/github/schemas/endpoint-inventory.schema.json',
    'research/github/schemas/collector-registry.schema.json',
    'research/github/schemas/graphql-query-catalog.schema.json',
    'research/github/schemas/advanced-domain-reconciliation.schema.json',
    'research/github/api-drift-report.json',
    'research/github/schemas/api-drift-report.schema.json',
  ];

  for (const f of files) {
    const p = join(root, f);
    assert.ok(existsSync(p), `Missing file: ${f}`);
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    assert.ok(
      typeof parsed === 'object' && parsed !== null,
      `Invalid JSON in ${f}`,
    );
  }
});

test('graphql query catalog comprehensively accounts for all 237 planned collectors without omissions or overlaps', () => {
  const regPath = join(root, 'research/github/collector-registry.json');
  const catPath = join(root, 'research/github/graphql-query-catalog.json');

  const registry = JSON.parse(readFileSync(regPath, 'utf8'));
  const catalog = JSON.parse(readFileSync(catPath, 'utf8'));

  const registryIds = new Set(
    registry.collectors.map((c: { id: string }) => c.id),
  );
  assert.equal(
    registryIds.size,
    237,
    'Registry must contain exactly 237 planned collectors',
  );

  const graphqlIds = catalog.queries.flatMap(
    (q: { satisfiedCollectorIds: string[] }) => q.satisfiedCollectorIds,
  );
  const graphqlIdSet = new Set(graphqlIds);
  assert.equal(
    graphqlIds.length,
    graphqlIdSet.size,
    'GraphQL queries must not have duplicate satisfiedCollectorIds',
  );

  const restOnlyIds = catalog.restOnlyCollectors.map(
    (c: { id: string }) => c.id,
  );
  const restOnlyIdSet = new Set(restOnlyIds);
  assert.equal(
    restOnlyIds.length,
    restOnlyIdSet.size,
    'restOnlyCollectors must not contain duplicate IDs',
  );

  // Assert empty intersection
  for (const id of graphqlIdSet) {
    assert.ok(
      !restOnlyIdSet.has(id),
      `Collector ${id} is listed as both satisfied by GraphQL and in restOnlyCollectors`,
    );
  }

  // Assert complete union
  const combinedIds = new Set([...graphqlIdSet, ...restOnlyIdSet]);
  assert.equal(
    combinedIds.size,
    237,
    'GraphQL queries and restOnlyCollectors combined must account for all 237 collectors',
  );

  for (const regId of registryIds) {
    assert.ok(
      combinedIds.has(regId),
      `Collector ${regId} is missing from graphql-query-catalog.json`,
    );
  }

  assert.equal(catalog.summary.totalPlannedCollectors, 237);
  assert.equal(catalog.summary.satisfiedByGraphQL, graphqlIdSet.size);
  assert.equal(catalog.summary.restOnly, restOnlyIdSet.size);
});

test('advanced domain reconciliation resolves all 10 unresolved billing endpoints and defines LFS strategy', () => {
  const reconPath = join(root, 'research/github/reconciliation.json');
  const advReconPath = join(
    root,
    'research/github/advanced-domain-reconciliation.json',
  );

  const baseReconciliation = JSON.parse(readFileSync(reconPath, 'utf8'));
  const advancedReconciliation = JSON.parse(readFileSync(advReconPath, 'utf8'));

  assert.equal(advancedReconciliation.schemaVersion, '1.0.0');
  assert.equal(advancedReconciliation.summary.unresolvedInitial, 10);
  assert.equal(advancedReconciliation.summary.unresolvedResolved, 10);
  assert.equal(advancedReconciliation.summary.unresolvedRemaining, 0);

  // Assert all 10 seedOnly endpoints are present in billingReconciliation
  const reconciledPaths = new Set(
    advancedReconciliation.billingReconciliation.map(
      (b: { path: string }) => b.path,
    ),
  );
  assert.equal(reconciledPaths.size, 10);

  for (const seedPath of baseReconciliation.seedOnly) {
    assert.ok(
      reconciledPaths.has(seedPath),
      `Path ${seedPath} from seedOnly was not reconciled in advanced-domain-reconciliation.json`,
    );
  }

  // Assert user endpoints are Excluded and org endpoints are Planned or Deferred
  for (const item of advancedReconciliation.billingReconciliation) {
    if (item.scope === 'user') {
      assert.equal(item.resolvedDisposition, 'Excluded');
    } else {
      assert.ok(
        item.resolvedDisposition === 'Planned' ||
          item.resolvedDisposition === 'Deferred',
      );
    }
  }

  // Assert LFS strategy is non-destructive
  assert.equal(
    advancedReconciliation.lfsStrategy.recommendedDiscoveryOperation,
    'rest.billing.get-shared-storage-billing-org',
  );
  assert.match(
    advancedReconciliation.lfsStrategy.nonDestructiveConstraint,
    /without cloning repository git objects/,
  );

  // Assert Copilot & EMU domains are documented
  assert.ok(
    advancedReconciliation.copilotDomain.enterpriseEndpoints.length > 0,
  );
  assert.ok(
    advancedReconciliation.copilotDomain.organizationEndpoints.length > 0,
  );
  assert.ok(advancedReconciliation.emuIdentityDomain.endpoints.length > 0);
  assert.match(
    advancedReconciliation.emuIdentityDomain.pseudonymizationEnforcement,
    /HMAC-SHA256/,
  );
});

test('automated api probe and schema drift verification suite runs offline and generates conformant report', async () => {
  const packageJson = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  );
  assert.equal(
    packageJson.scripts['probe:api'],
    'node --import tsx scripts/collectors/probe-api-surface.ts',
  );

  const dir = mkdtempSync(join(tmpdir(), 'ghec-api-probe-'));
  const reportPath = join(dir, 'api-drift-report.json');
  const output: string[] = [];
  const originalLog = console.log;
  try {
    console.log = (...values: unknown[]) => output.push(values.join(' '));
    const report = await runApiSurfaceProbe({
      live: false,
      reportPath,
      quiet: true,
    });

    assert.ok(existsSync(reportPath), 'Missing api-drift-report.json');
    const diskReport = JSON.parse(readFileSync(reportPath, 'utf8'));

    assert.equal(report.schemaVersion, '1.0.0');
    assert.equal(report.targetApiVersion, '2026-03-10');
    assert.equal(report.summary.totalOperationsAudited, 776);
    assert.equal(report.summary.validOperations, 766);
    assert.equal(report.graphQLVerification.totalQueries, 8);
    assert.equal(report.graphQLVerification.validQueries, 8);
    assert.equal(report.graphQLVerification.syntaxErrors.length, 0);
    assert.equal(report.driftDetails.length, 776);
    assert.match(output.join('\n'), /AUDIT SUMMARY/);
    assert.deepEqual(diskReport, JSON.parse(JSON.stringify(report)));
  } finally {
    console.log = originalLog;
    rmSync(dir, { recursive: true, force: true });
  }
});
