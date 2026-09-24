import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '../../..');

test('collector manifests and validation suite pass completely offline', () => {
  const result = spawnSync('python3', ['scripts/collectors/validate.py'], {
    cwd: root,
    encoding: 'utf8',
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
    'research/github/schemas/source-manifest.schema.json',
    'research/github/schemas/common-profile.schema.json',
    'research/github/schemas/reconciliation.schema.json',
    'research/github/schemas/endpoint-inventory.schema.json',
    'research/github/schemas/collector-registry.schema.json',
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
