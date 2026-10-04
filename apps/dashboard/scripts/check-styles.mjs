import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const sourceRoot = resolve('src');
const packageJsonPath = resolve('package.json');
const roots = [
  resolve(sourceRoot, 'components'),
  resolve(sourceRoot, 'features'),
  resolve(sourceRoot, 'lib'),
  sourceRoot,
];

const inlineStyleAllowlist = new Set([
  'components/VirtualizedTable.tsx',
  'components/DesignSystemPreview.tsx',
]);

const PROHIBITED_PACKAGES = ['daisyui', 'tailwindcss', '@tailwindcss/vite'];

const PROHIBITED_DAISY_CLASSES = new Set([
  'btn',
  'btn-primary',
  'btn-secondary',
  'btn-accent',
  'btn-ghost',
  'btn-square',
  'btn-sm',
  'btn-lg',
  'badge',
  'badge-primary',
  'badge-secondary',
  'badge-accent',
  'badge-outline',
  'badge-sm',
  'badge-lg',
  'alert',
  'alert-info',
  'alert-success',
  'alert-warning',
  'alert-error',
  'card',
  'card-body',
  'card-title',
  'stat',
  'stats',
  'stat-title',
  'stat-value',
  'menu',
  'menu-title',
  'modal',
  'modal-box',
  'modal-action',
  'drawer',
  'drawer-side',
  'drawer-content',
  'navbar',
  'timeline',
  'collapse',
  'collapse-title',
  'collapse-content',
  'fieldset',
  'toggle',
  'range',
  'dropdown',
  'dropdown-content',
  'table-zebra',
  'rounded-box',
]);

const APPROVED_EXPERIMENTAL_EXPORTS = new Set(['Blankslate', 'Table']);

const failures = [];

// 1. Validate package.json: zero retired styling dependencies
try {
  const pkgContent = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const allDeps = {
    ...pkgContent.dependencies,
    ...pkgContent.devDependencies,
  };
  for (const prohibited of PROHIBITED_PACKAGES) {
    if (prohibited in allDeps) {
      failures.push(
        `package.json: Prohibited dependency detected (${prohibited}). Retired styling packages must be absent.`,
      );
    }
  }
} catch (err) {
  failures.push(`Failed to read package.json: ${err.message}`);
}

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
  for (const path of await walk(root)) {
    if (seenPaths.has(path)) continue;
    seenPaths.add(path);

    const name = relative(sourceRoot, path).replaceAll('\\', '/');

    // 2. Validate CSS files
    if (path.endsWith('.css')) {
      const cssContent = await readFile(path, 'utf8');
      if (/@import\s+['"]tailwindcss['"]/.test(cssContent)) {
        failures.push(`${name}: @import 'tailwindcss' is strictly prohibited.`);
      }
      if (/@plugin\s+['"]daisyui/.test(cssContent)) {
        failures.push(`${name}: DaisyUI plugin directives are prohibited.`);
      }
      if (/@apply\b/.test(cssContent)) {
        failures.push(`${name}: Tailwind @apply directive is prohibited.`);
      }
      continue;
    }

    if (!/\.[jt]sx?$/.test(path)) continue;
    const source = await readFile(path, 'utf8');

    // 3. Prohibit internal Primer subpaths
    const internalImportMatch = source.match(
      /@primer\/react\/(?:dist|lib|lib-esm|src)\b/,
    );
    if (internalImportMatch) {
      failures.push(
        `${name}: Prohibited internal Primer import (${internalImportMatch[0]}). Use public '@primer/react' exports.`,
      );
    }

    // 4. Validate @primer/react/experimental imports (ADR 0003 compliance)
    const experimentalMatch = source.match(
      /import\s+\{([^}]+)\}\s+from\s+['"]@primer\/react\/experimental['"]/,
    );
    if (experimentalMatch) {
      const importedNames = experimentalMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/\s+as\s+.+$/, ''))
        .filter(Boolean);
      for (const importedName of importedNames) {
        if (!APPROVED_EXPERIMENTAL_EXPORTS.has(importedName)) {
          failures.push(
            `${name}: Unapproved experimental import '${importedName}' from '@primer/react/experimental'. Only ${[...APPROVED_EXPERIMENTAL_EXPORTS].join(', ')} are authorized per ADR 0003.`,
          );
        }
      }
    }

    // 5. Inline style prop check
    if (/\bstyle\s*=/.test(source) && !inlineStyleAllowlist.has(name)) {
      failures.push(`${name}: inline style prop is not allowed`);
    }

    // 6. Hard-coded hex color check
    if (/#[\da-f]{3,8}\b/i.test(source)) {
      failures.push(`${name}: hard-coded hex color is not allowed`);
    }

    // 7. DaisyUI class name scanner
    const classAttrMatches = source.matchAll(
      /(?:class(?:Name)?\s*=\s*['"`]|cx\([^)]*['"`])([^'"`]+)['"`]/g,
    );
    for (const match of classAttrMatches) {
      const tokens = match[1].split(/\s+/);
      for (const token of tokens) {
        if (PROHIBITED_DAISY_CLASSES.has(token)) {
          failures.push(
            `${name}: Prohibited DaisyUI class '${token}' detected in JSX/class string.`,
          );
        }
      }
    }
  }
}

if (failures.length) {
  console.error(
    `Primer Quality Gate failed (${failures.length} violations):\n${failures.map((item) => `  ✖ ${item}`).join('\n')}`,
  );
  process.exitCode = 1;
} else {
  console.log(
    '✔ Primer Quality Gate passed: zero legacy styles, valid Primer imports, and pure token styling verified.',
  );
}
