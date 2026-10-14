import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { GAP_LEDGER_CATALOG } from '@ghec/contracts';

const root = process.cwd();
let failed = 0;

console.log('Verifying documentation references in GAP_LEDGER_CATALOG...\n');

for (const entry of GAP_LEDGER_CATALOG) {
  const fullPath = join(root, entry.docsRef);
  if (!existsSync(fullPath)) {
    console.error(
      `❌ [${entry.id}] Missing documentation file: ${entry.docsRef}`,
    );
    failed++;
  } else {
    console.log(`✓ [${entry.id}] -> ${entry.docsRef}`);
  }
}

console.log(
  `\nVerified ${GAP_LEDGER_CATALOG.length} documentation references.`,
);

if (failed > 0) {
  console.error(`\nFailed with ${failed} missing documentation files.`);
  process.exit(1);
} else {
  console.log('All documentation references exist on disk.');
}
