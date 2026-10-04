import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { MigrationScope } from '@ghec/contracts';
import { MigrationCheckpointManager, writeAtomicJson } from '../src/index.js';

const scope: MigrationScope = {
  version: '1.0.0',
  name: 'acme-to-contoso',
  organizations: [{ source: 'acme', target: 'contoso' }],
  repositories: [
    {
      sourceOrg: 'acme',
      sourceRepo: 'api',
      targetOrg: 'contoso',
      targetRepo: 'api',
      useGei: true,
    },
  ],
};

function fixtureRoot(): string {
  return mkdtempSync(join(tmpdir(), 'ghec-migration-checkpoint-'));
}

test('creates a protected, atomically persisted checkpoint manifest', () => {
  const root = fixtureRoot();
  try {
    const manager = new MigrationCheckpointManager('run-001', scope, {
      rootDirectory: root,
    });
    const directory = manager.getCheckpointDirectory();
    const manifestPath = join(directory, 'manifest.json');

    assert.equal(directory, join(root, '.checkpoint-run-001'));
    assert.equal(existsSync(manifestPath), true);
    assert.equal(
      JSON.parse(readFileSync(manifestPath, 'utf8')).runId,
      'run-001',
    );
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    assert.equal(statSync(manifestPath).mode & 0o777, 0o600);
    assert.deepEqual(
      readdirSync(directory).filter((name) => name.endsWith('.tmp')),
      [],
    );

    // Initial stages should all evaluate as not completed
    for (const stage of [
      'preflight',
      'targetPrep',
      'gei',
      'specializedStrategies',
      'apiModules',
      'postMigration',
      'verification',
    ]) {
      assert.equal(
        manager.isStageCompleted('acme/api', stage),
        false,
        `Initial stage ${stage} should not be completed`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tracks all seven stages and module execution results for resumption', () => {
  const root = fixtureRoot();
  try {
    const manager = new MigrationCheckpointManager('run-002', scope, {
      rootDirectory: join(root, 'migrations'),
    });
    const repository = 'acme/api';

    manager.recordStageResult(repository, 'preflight', {
      status: 'evaluated',
      assessment: { status: 'ready' },
    });
    manager.recordStageResult(repository, 'targetPrep', {
      status: 'completed',
    });
    manager.recordStageResult(repository, 'gei', {
      status: 'completed',
      migrationId: 'gei-123',
      skippedReleases: true,
    });
    manager.recordStageResult(repository, 'specializedStrategies', {
      'git-lfs': { status: 'completed' },
      'releases-fallback': { status: 'skipped' },
    });
    manager.recordModuleResult(repository, 'repo-variables', {
      schemaVersion: '1.0.0',
      moduleId: 'repo-variables',
      status: 'complete',
      durationMs: 42,
      results: [
        {
          operationId: 'var-1',
          status: 'succeeded',
          completedAt: '2026-10-04T12:00:00Z',
        },
      ],
    });
    manager.recordStageResult(repository, 'postMigration', {
      'repo-visibility': { status: 'completed' },
      webhooks: { status: 'completed' },
      mannequins: { status: 'skipped' },
      codeowners: { status: 'completed' },
    });
    manager.recordStageResult(repository, 'verification', {
      status: 'passed',
      reportUri: 'file:///reports/verify.json',
    });

    for (const stage of [
      'preflight',
      'targetPrep',
      'gei',
      'specializedStrategies',
      'apiModules',
      'postMigration',
      'verification',
    ]) {
      assert.equal(manager.isStageCompleted(repository, stage), true, stage);
    }
    assert.equal(manager.isModuleCompleted(repository, 'repo-variables'), true);
    assert.equal(manager.isRepositoryCompleted(repository), true);

    const located = MigrationCheckpointManager.locate(
      join(root, 'migrations'),
      'run-002',
    );
    const resumed = MigrationCheckpointManager.resume(located);
    assert.equal(resumed.isStageCompleted(repository, 'gei'), true);
    assert.equal(resumed.isModuleCompleted(repository, 'repo-variables'), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('preserves a complete manifest when a stale temporary file remains after interruption', () => {
  const root = fixtureRoot();
  try {
    const filePath = join(root, 'manifest.json');
    writeAtomicJson(filePath, { generation: 1 });
    writeFileSync(
      join(root, '.manifest.json.interrupted.tmp'),
      '{"generation":',
    );

    assert.deepEqual(JSON.parse(readFileSync(filePath, 'utf8')), {
      generation: 1,
    });
    assert.equal(
      existsSync(join(root, '.manifest.json.interrupted.tmp')),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('locates the latest checkpoint and cleans up only its matching run', () => {
  const root = fixtureRoot();
  try {
    const migrationRoot = join(root, 'migrations');
    mkdirSync(migrationRoot, { recursive: true });
    const first = new MigrationCheckpointManager('run-003', scope, {
      rootDirectory: migrationRoot,
      now: () => '2026-10-04T12:00:00.000Z',
    });
    const second = new MigrationCheckpointManager('run-004', scope, {
      rootDirectory: migrationRoot,
      now: () => '2026-10-04T12:00:01.000Z',
    });

    assert.equal(
      MigrationCheckpointManager.locate(migrationRoot, 'latest'),
      second.getCheckpointDirectory(),
    );
    assert.throws(() => first.cleanup('run-004'), /runId mismatch/);
    first.cleanup('run-003');
    assert.equal(existsSync(first.getCheckpointDirectory()), false);
    assert.equal(existsSync(second.getCheckpointDirectory()), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
