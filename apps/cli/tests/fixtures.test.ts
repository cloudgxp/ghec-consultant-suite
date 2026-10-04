import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateBundle, type DiscoveryBundle } from '@ghec/contracts';
import { publishBundle } from '../src/output/publisher.js';
import {
  pseudonymizeUsername,
  generateSalt,
  computeSaltDigest,
} from '../src/output/sanitizer.js';

function loadFixture(name: string): DiscoveryBundle {
  const fileUrl = new URL(
    `../../../fixtures/synthetic/${name}.json`,
    import.meta.url,
  );
  return JSON.parse(readFileSync(fileUrl, 'utf8')) as DiscoveryBundle;
}

test('CLI publisher accepts and streams specialized fixture with 0 loss', async () => {
  const bundle = loadFixture('specialized-v1');
  const tmp = mkdtempSync(join(tmpdir(), 'ghec-cli-fixture-test-'));
  const outPath = join(tmp, 'published-specialized.json');

  try {
    const publishedPath = await publishBundle(bundle, {
      outputPath: outPath,
      scopeKind: 'organization',
      scopeName: 'fictional-specialized',
      runId: 'test-run-1',
      startedAt: '2026-01-01T12:00:00Z',
    });
    const published = JSON.parse(readFileSync(publishedPath, 'utf8'));
    const validated = validateBundle(published);
    assert.equal(validated.success, true);
    if (!validated.success) throw new Error(validated.message);

    // Verify entity count preserved
    assert.equal(validated.data.entities.length, bundle.entities.length);

    // Verify specialized entities present
    const hasRunner = validated.data.entities.some(
      (e) => e.kind === 'action-runner',
    );
    const hasRunnerGroup = validated.data.entities.some(
      (e) => e.kind === 'action-runner-group',
    );
    const hasWorkflow = validated.data.entities.some(
      (e) => e.kind === 'action-workflow',
    );
    const hasConfig = validated.data.entities.some(
      (e) => e.kind === 'configuration-metadata',
    );

    assert.ok(hasRunner);
    assert.ok(hasRunnerGroup);
    assert.ok(hasWorkflow);
    assert.ok(hasConfig);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI publisher accepts and streams partial-denied fixture preserving 403 status', async () => {
  const bundle = loadFixture('partial-denied-v1');
  const tmp = mkdtempSync(join(tmpdir(), 'ghec-cli-partial-test-'));
  const outPath = join(tmp, 'published-partial.json');

  try {
    const publishedPath = await publishBundle(bundle, {
      outputPath: outPath,
      scopeKind: 'organization',
      scopeName: 'fictional-restricted',
      runId: 'test-run-2',
      startedAt: '2026-01-01T12:00:00Z',
    });
    const published = JSON.parse(readFileSync(publishedPath, 'utf8'));
    const validated = validateBundle(published);
    assert.equal(validated.success, true);
    if (!validated.success) throw new Error(validated.message);

    assert.equal(validated.data.scan.status, 'partial');
    assert.ok(
      validated.data.errors.some((e) => e.code === 'permission_denied'),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('identity pseudonymization is deterministic across specialized fixture entities', () => {
  const bundle = loadFixture('specialized-v1');
  const user = bundle.entities.find((e) => e.kind === 'identity');
  assert.ok(user && user.kind === 'identity');

  const salt = generateSalt();
  const digest = computeSaltDigest(salt);
  assert.ok(digest.length > 0);

  const pseudo1 = pseudonymizeUsername(user.pseudonym, salt);
  const pseudo2 = pseudonymizeUsername(user.pseudonym, salt);
  assert.equal(pseudo1, pseudo2);
  assert.match(pseudo1, /^usr_[a-f0-9]{16}$/);
});
