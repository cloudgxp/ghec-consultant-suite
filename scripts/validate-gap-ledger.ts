import { generateGapLedgerManifest, validateGapLedger } from '@ghec/contracts';

console.log('Generating and validating Gap Ledger Manifest...\n');

const manifest = generateGapLedgerManifest();
const result = validateGapLedger(manifest);

if (!result.success) {
  console.error('❌ Gap Ledger Manifest validation failed:');
  console.error(result.message);
  process.exit(1);
}

const data = result.data;
console.log(`✓ Schema Version: ${data.schemaVersion}`);
console.log(`✓ Generated At: ${data.generatedAt}`);
console.log(`✓ Total Resources: ${data.summary.totalResources}`);
console.log(`  - Implemented: ${data.summary.implementedCount}`);
console.log(`  - Partial: ${data.summary.partialCount}`);
console.log(`  - Missing: ${data.summary.missingCount}`);
console.log(`✓ Category Counts:`, data.summary.categoryCounts);
console.log(`✓ Delivery Waves: ${data.waves.length}`);

if (data.resources.length !== data.summary.totalResources) {
  console.error(
    `❌ Mismatch: resources array length (${data.resources.length}) does not match summary total (${data.summary.totalResources})`,
  );
  process.exit(1);
}

console.log('\nAll validation checks passed successfully.');
