import { readFileSync } from 'node:fs';
import { validateBundle } from '@ghec/contracts';
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
