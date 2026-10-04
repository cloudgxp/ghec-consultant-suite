import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const dashboardRoot = resolve(scriptDir, '..');
const sourceRoot = resolve(dashboardRoot, 'src');
const roots = [
  resolve(sourceRoot, 'components'),
  resolve(sourceRoot, 'features'),
  resolve(sourceRoot, 'lib'),
  sourceRoot,
];

const DAISY_CLASSES = [
  'btn',
  'badge',
  'alert',
  'card',
  'stat',
  'stats',
  'menu',
  'modal',
  'tabs',
  'drawer',
  'navbar',
  'select',
  'input',
  'checkbox',
  'toggle',
  'range',
  'fieldset',
  'collapse',
  'timeline',
  'join',
  'dropdown',
];

const failures = [];
const classCounts = new Map();
let totalFilesScanned = 0;
let filesWithLegacyClasses = 0;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    }),
  );
  return groups.flat();
}

const seenPaths = new Set();
for (const root of roots) {
  const entries = await walk(root);
  for (const path of entries) {
    if (seenPaths.has(path)) continue;
    seenPaths.add(path);

    if (!/\.[jt]sx?$/.test(path)) continue;
    const name = relative(sourceRoot, path).replaceAll('\\', '/');
    const source = await readFile(path, 'utf8');
    totalFilesScanned++;

    // 1. Guardrail: Prohibit internal Primer subpaths
    const internalImportMatch = source.match(
      /@primer\/react\/(?:dist|lib|lib-esm|src)\b/,
    );
    if (internalImportMatch) {
      failures.push(
        `${name}: Prohibited internal Primer import detected (${internalImportMatch[0]}). Use public '@primer/react' exports.`,
      );
    }

    // 2. Count legacy DaisyUI classes in class/className strings
    let fileHasLegacy = false;
    const classAttrMatches = source.matchAll(
      /(?:class(?:Name)?\s*=\s*['"`]|cx\([^)]*['"`])([^'"`]+)['"`]/g,
    );
    for (const match of classAttrMatches) {
      const tokens = match[1].split(/\s+/);
      for (const token of tokens) {
        if (
          token.startsWith('select-none') ||
          token.startsWith('select-text') ||
          token.startsWith('select-all')
        )
          continue;
        for (const cls of DAISY_CLASSES) {
          if (token === cls || token.startsWith(`${cls}-`)) {
            fileHasLegacy = true;
            classCounts.set(cls, (classCounts.get(cls) || 0) + 1);
          }
        }
      }
    }
    if (fileHasLegacy) {
      filesWithLegacyClasses++;
    }
  }
}

console.log('='.repeat(60));
console.log('       GHEC Dashboard: Primer Migration & Legacy Style Report');
console.log('='.repeat(60));
console.log(`Total files scanned:       ${totalFilesScanned}`);
console.log(`Files with legacy classes: ${filesWithLegacyClasses}`);
console.log('-'.repeat(60));
if (classCounts.size === 0) {
  console.log(
    '✔ Remaining DaisyUI Class Occurrences: ZERO (100% Primer adoption)',
  );
} else {
  console.log('Remaining DaisyUI Class Occurrences:');
  const sorted = [...classCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cls, count] of sorted) {
    console.log(`  - ${cls.padEnd(16)} : ${count}`);
  }
}
console.log('='.repeat(60));

if (failures.length > 0) {
  console.error('\nPrimer import guardrail failures:');
  for (const f of failures) {
    console.error(`  ✖ ${f}`);
  }
  process.exitCode = 1;
} else {
  console.log('\n✔ All Primer imports conform to public API guardrails.');
}
