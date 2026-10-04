import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBundle } from '@ghec/contracts';
import {
  workflowInventory,
  runnersInventory,
  operationsInventory,
  environmentPolicyInventory,
} from '../src/lib/action-operations.js';
import {
  configurationInventory,
  configurationCoverage,
} from '../src/lib/configuration-metadata.js';
import {
  packageInventory,
  releaseAssetInventory,
} from '../src/lib/supply-chain.js';
import {
  generateActionsOperationsCsv,
  generateConfigurationMetadataCsv,
  generatePackagesCsv,
  generateReleaseAssetsCsv,
} from '../src/lib/export-csv.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(
  here,
  '../../../fixtures/synthetic/specialized-v1.json',
);
const raw = JSON.parse(readFileSync(fixturePath, 'utf8'));
const parsed = validateBundle(raw);

assert.equal(parsed.success, true);
if (!parsed.success) throw new Error(parsed.message);
const bundle = parsed.data;

test('workflowInventory correctly projects native action-workflow entities', () => {
  const workflows = workflowInventory(bundle);
  assert.equal(workflows.length, 2);
  assert.ok(workflows.every((w) => w.compatibility === 'native'));

  const ci = workflows.find((w) => w.name === 'Build and Test');
  assert.ok(ci);
  assert.equal(ci.state, 'active');
  assert.equal(ci.reusable, false);
  assert.equal(ci.runCount, 154);
  assert.ok(ci.lastActivityAt);

  const deploy = workflows.find((w) => w.name === 'Deploy Production');
  assert.ok(deploy);
  assert.equal(deploy.state, 'active');
  assert.equal(deploy.reusable, true);
  assert.equal(deploy.runCount, 48);
});

test('runnersInventory extracts runner groups and specialized self-hosted runners', () => {
  const runners = runnersInventory(bundle);
  assert.equal(runners.length, 3);

  const group = runners.find((r) => r.kind === 'action-runner-group');
  assert.ok(group && group.kind === 'action-runner-group');
  assert.equal(group.name, 'Production-SelfHosted-Group');
  assert.equal(group.visibility, 'selected');
  assert.equal(group.runnerCount.value, 2);

  const selfHosted = runners.find(
    (r) => r.kind === 'action-runner' && r.runnerType === 'self-hosted',
  );
  assert.ok(selfHosted && selfHosted.kind === 'action-runner');
  assert.equal(selfHosted.name, 'linux-x64-prod-01');
  assert.equal(selfHosted.operatingSystem, 'linux');
  assert.equal(selfHosted.status, 'online');
  assert.equal(selfHosted.busy, true);
  assert.ok(selfHosted.labels.includes('gpu'));

  const hosted = runners.find(
    (r) => r.kind === 'action-runner' && r.runnerType === 'hosted',
  );
  assert.ok(hosted && hosted.kind === 'action-runner');
  assert.equal(hosted.name, 'ubuntu-latest-standard');
  assert.equal(hosted.busy, false);
});

test('operationsInventory extracts caches and artifacts with byte metrics', () => {
  const ops = operationsInventory(bundle);
  assert.equal(ops.length, 2);

  const cache = ops.find((o) => o.kind === 'action-cache');
  assert.ok(cache && cache.kind === 'action-cache');
  assert.equal(cache.key, 'Linux-node-cache-v1-abc123def');
  assert.equal(cache.size.value, 157286400);

  const artifact = ops.find((o) => o.kind === 'action-artifact');
  assert.ok(artifact && artifact.kind === 'action-artifact');
  assert.equal(artifact.name, 'release-dist-bundle');
  assert.equal(artifact.size.value, 31457280);
  assert.equal(artifact.expired, false);
});

test('environmentPolicyInventory extracts environment rules and token permissions', () => {
  const envPolicy = environmentPolicyInventory(bundle);
  assert.equal(envPolicy.length, 2);

  const env = envPolicy.find((e) => e.kind === 'action-environment');
  assert.ok(env && env.kind === 'action-environment');
  assert.equal(env.name, 'production');
  assert.equal(env.protectionRuleCount.value, 2);
  assert.equal(env.reviewerCount.value, 3);
  assert.equal(env.deploymentBranchPolicy, 'protected');

  const policy = envPolicy.find((e) => e.kind === 'action-policy');
  assert.ok(policy && policy.kind === 'action-policy');
  assert.equal(policy.allowedActions, 'selected');
  assert.equal(policy.defaultTokenPermission, 'read');
  assert.equal(policy.canApprovePullRequests, false);
  assert.equal(policy.forkPolicy, 'restricted');
});

test('configurationInventory and coverage correctly handle native secrets and metadata', () => {
  const records = configurationInventory(bundle);
  assert.equal(records.length, 2);
  assert.ok(records.every((r) => r.compatibility === 'native'));

  const orgSecret = records.find((r) => r.name === 'NPM_PUBLISH_TOKEN');
  assert.ok(orgSecret);
  assert.equal(orgSecret.domain, 'actions');
  assert.equal(orgSecret.level, 'organization');
  assert.equal(orgSecret.accessMode, 'selected_repositories');
  assert.equal(orgSecret.selectedRepositoryCount, 1);

  const repoSecret = records.find((r) => r.name === 'PRIVATE_REGISTRY_KEY');
  assert.ok(repoSecret);
  assert.equal(repoSecret.domain, 'dependabot');
  assert.equal(repoSecret.level, 'repository');
  assert.equal(repoSecret.accessMode, 'all_repositories');

  const coverage = configurationCoverage(bundle);
  assert.equal(coverage.length, 1);
  assert.equal(coverage[0]?.domain, 'actions');
  assert.equal(coverage[0]?.state, 'complete');
});

test('package and release inventories project native supply chain entities', () => {
  const packages = packageInventory(bundle);
  assert.equal(packages.length, 1);
  assert.equal(packages[0]?.name, '@fictional/core-sdk');
  assert.equal(packages[0]?.compatibility, 'native');
  assert.equal(packages[0]?.versionCount, 5);
  assert.equal(packages[0]?.sizeBytes, 12582912);
  assert.equal(packages[0]?.disposition, 'transfer');

  const releaseAssets = releaseAssetInventory(bundle);
  assert.ok(releaseAssets.length >= 3);

  const release = releaseAssets.find((r) => r.kind === 'release');
  assert.ok(release);
  assert.equal(release.name, 'Release v2.1.0');

  const asset = releaseAssets.find((r) => r.kind === 'release-asset');
  assert.ok(asset);
  assert.equal(asset.name, 'core-sdk-linux-x64.tar.gz');
  assert.equal(asset.sizeBytes, 10485760);

  const largeAsset = releaseAssets.find((r) => r.kind === 'large-asset');
  assert.ok(largeAsset);
  assert.equal(largeAsset.name, 'test-database-seed.sql.gz');
  assert.equal(largeAsset.sizeBytes, 52428800);
});

test('specialized CSV exports render native records and preserve audit boundaries', () => {
  const actionsCsv = generateActionsOperationsCsv(bundle);
  assert.match(actionsCsv, /Production-SelfHosted-Group/);
  assert.match(actionsCsv, /linux-x64-prod-01/);
  assert.match(actionsCsv, /Linux-node-cache-v1-abc123def/);
  assert.match(actionsCsv, /Build and Test/);

  const configCsv = generateConfigurationMetadataCsv(
    bundle,
    configurationInventory(bundle),
  );
  assert.match(configCsv, /NPM_PUBLISH_TOKEN/);
  assert.match(configCsv, /PRIVATE_REGISTRY_KEY/);
  assert.match(configCsv, /ZERO VALUES/);

  const packagesCsv = generatePackagesCsv(bundle, packageInventory(bundle));
  assert.match(packagesCsv, /@fictional\/core-sdk/);

  const assetsCsv = generateReleaseAssetsCsv(
    bundle,
    releaseAssetInventory(bundle),
  );
  assert.match(assetsCsv, /Release v2.1.0/);
  assert.match(assetsCsv, /core-sdk-linux-x64\.tar\.gz/);
});
