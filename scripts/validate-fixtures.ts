import { readFileSync } from 'node:fs';
import {
  generateGapLedgerManifest,
  validateBundle,
  validateGapLedger,
} from '@ghec/contracts';

for (const name of [
  'enterprise-v1',
  'organization-v1',
  'specialized-v1',
  'partial-denied-v1',
]) {
  const input: unknown = JSON.parse(
    readFileSync(
      new URL(`../fixtures/synthetic/${name}.json`, import.meta.url),
      'utf8',
    ),
  );
  const result = validateBundle(input);
  if (!result.success) throw new Error(`${name}: ${result.message}`);
  console.log(`${name}: valid synthetic schema ${result.data.schemaVersion}`);
}

// Gap ledger synthetic fixture validation
const validLedgerInput: unknown = JSON.parse(
  readFileSync(
    new URL(
      '../fixtures/synthetic/gap-ledger/valid-manifest.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const validLedgerResult = validateGapLedger(validLedgerInput);
if (!validLedgerResult.success) {
  throw new Error(`valid-manifest.json: ${validLedgerResult.message}`);
}
console.log(
  `gap-ledger/valid-manifest: valid synthetic schema ${validLedgerResult.data.schemaVersion}`,
);

const invalidLedgerInput: unknown = JSON.parse(
  readFileSync(
    new URL(
      '../fixtures/synthetic/gap-ledger/invalid-manifest.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const invalidLedgerResult = validateGapLedger(invalidLedgerInput);
if (invalidLedgerResult.success) {
  throw new Error(
    'invalid-manifest.json: expected schema validation to fail, but succeeded',
  );
}
console.log('gap-ledger/invalid-manifest: correctly rejected invalid schema');

// Authoritative gap ledger catalog validation
const liveManifest = generateGapLedgerManifest();
const liveResult = validateGapLedger(liveManifest);
if (!liveResult.success) {
  throw new Error(`live gap ledger catalog: ${liveResult.message}`);
}
console.log(
  `gap-ledger/live-manifest: valid authoritative schema ${liveResult.data.schemaVersion} (${liveResult.data.summary.totalResources} resources)`,
);
