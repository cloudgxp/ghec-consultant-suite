#!/usr/bin/env node

/**
 * Customer Migration Release Kit Builder
 *
 * Bundles ghec-consultant-cli and all @ghec/* packages + runtime dependencies into
 * a single zero-source standalone ESM binary (`bin/ghec-consultant-cli.mjs`),
 * packages the operational GitHub Actions workflows and Operator/Customer manuals
 * into `dist/release-kit/`, and creates `dist/ghec-migration-kit-v<version>.tar.gz`.
 */

import * as esbuild from 'esbuild';
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  cpSync,
  chmodSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const OPERATIONAL_WORKFLOWS = [
  'discovery-scan.yml',
  'generate-scope.yml',
  'migration-plan-pr.yml',
  'migration-execute-wave.yml',
  'migration-e2e-autonomous.yml',
  'migration-resume.yml',
  'migration-apply-remediation.yml',
  'post-migration-cutover.yml',
  'seed-demo-content.yml',
  'teardown-target-sandbox.yml',
];

export async function buildReleaseKit(options = {}) {
  const outDir = resolve(options.outDir || join(rootDir, 'dist/release-kit'));
  const createTarball = options.createTarball !== false;

  const pkgJson = JSON.parse(
    readFileSync(join(rootDir, 'package.json'), 'utf8'),
  );
  const version = pkgJson.version || '0.1.0';

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'bin'), { recursive: true });
  mkdirSync(join(outDir, 'apps/cli/bin'), { recursive: true });
  mkdirSync(join(outDir, 'packages/contracts/dist'), { recursive: true });
  mkdirSync(join(outDir, 'packages/migration/dist'), { recursive: true });
  mkdirSync(join(outDir, 'scripts'), { recursive: true });
  mkdirSync(join(outDir, '.github/actions/setup-suite'), { recursive: true });
  mkdirSync(join(outDir, '.github/workflows'), { recursive: true });
  mkdirSync(join(outDir, 'docs/guides'), { recursive: true });
  mkdirSync(join(outDir, 'scopes'), { recursive: true });

  const bundlePath = join(outDir, 'bin/ghec-consultant-cli.mjs');

  await esbuild.build({
    entryPoints: [join(rootDir, 'apps/cli/src/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    outfile: bundlePath,
    sourcemap: false,
    minify: false,
    banner: {
      js: "import { createRequire as __bundleCreateRequire } from 'node:module'; const require = __bundleCreateRequire(import.meta.url);",
    },
    logLevel: 'warning',
  });

  // Ensure #!/usr/bin/env node is on line 1 of the bundle
  let bundleContent = readFileSync(bundlePath, 'utf8');
  bundleContent = bundleContent.replace(/^#!.*\n/gm, '');
  bundleContent = `#!/usr/bin/env node\n${bundleContent}`;
  writeFileSync(bundlePath, bundleContent, 'utf8');
  chmodSync(bundlePath, 0o755);

  // Compatibility forwarders so existing workflow paths work seamlessly without source
  const cliForwarderPath = join(outDir, 'apps/cli/bin/ghec-consultant-cli.mjs');
  writeFileSync(
    cliForwarderPath,
    `#!/usr/bin/env node\nimport { runCli } from '../../../bin/ghec-consultant-cli.mjs';\nprocess.exitCode = await runCli();\n`,
    'utf8',
  );
  chmodSync(cliForwarderPath, 0o755);

  writeFileSync(
    join(outDir, 'packages/contracts/dist/index.js'),
    `export * from '../../../bin/ghec-consultant-cli.mjs';\n`,
    'utf8',
  );
  writeFileSync(
    join(outDir, 'packages/migration/dist/index.js'),
    `export * from '../../../bin/ghec-consultant-cli.mjs';\n`,
    'utf8',
  );

  const scopeForwarderPath = join(outDir, 'scripts/generate-scope.mjs');
  writeFileSync(
    scopeForwarderPath,
    `#!/usr/bin/env node\nimport { runCli } from '../bin/ghec-consultant-cli.mjs';\nprocess.exitCode = await runCli(['generate-scope', ...process.argv.slice(2)]);\n`,
    'utf8',
  );
  chmodSync(scopeForwarderPath, 0o755);

  // Copy composite setup action
  copyFileSync(
    join(rootDir, '.github/actions/setup-suite/action.yml'),
    join(outDir, '.github/actions/setup-suite/action.yml'),
  );

  // Copy operational workflows
  for (const wf of OPERATIONAL_WORKFLOWS) {
    const srcWf = join(rootDir, '.github/workflows', wf);
    if (existsSync(srcWf)) {
      copyFileSync(srcWf, join(outDir, '.github/workflows', wf));
    }
  }

  // Copy Operator and Customer/PM guides (exclude developer guides)
  const guidesDir = join(rootDir, 'docs/guides');
  if (existsSync(guidesDir)) {
    const guidesReadme = join(guidesDir, 'README.md');
    if (existsSync(guidesReadme)) {
      copyFileSync(guidesReadme, join(outDir, 'docs/guides/README.md'));
    }
    for (const subDir of ['operators', 'customers-and-pms']) {
      const srcSubDir = join(guidesDir, subDir);
      const destSubDir = join(outDir, 'docs/guides', subDir);
      if (existsSync(srcSubDir)) {
        mkdirSync(destSubDir, { recursive: true });
        for (const entry of readdirSync(srcSubDir, { withFileTypes: true })) {
          if (entry.isFile() && entry.name.endsWith('.md')) {
            copyFileSync(
              join(srcSubDir, entry.name),
              join(destSubDir, entry.name),
            );
          }
        }
      }
    }
  }

  // Copy compiled static dashboard for Private GitHub Pages publishing
  const dashboardDistDir = join(rootDir, 'apps/dashboard/dist');
  if (existsSync(dashboardDistDir)) {
    cpSync(dashboardDistDir, join(outDir, 'apps/dashboard/dist'), {
      recursive: true,
    });
  }

  // Minimal package.json for ESM resolution in customer repository
  writeFileSync(
    join(outDir, 'package.json'),
    JSON.stringify(
      {
        name: 'ghec-migration-kit',
        version,
        private: true,
        type: 'module',
        engines: {
          node: '>=22.13.0',
        },
        bin: {
          'ghec-consultant-cli': './bin/ghec-consultant-cli.mjs',
        },
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  // Root README for Customer Migration Kit
  writeFileSync(
    join(outDir, 'README.md'),
    `# GHEC Migration Kit (v${version})

This package contains the pre-compiled **GHEC Consultant CLI** (\`bin/ghec-consultant-cli.mjs\`), the pre-built **Assessment & Operations Web UI** (\`apps/dashboard/dist/\`), ready-to-run **GitHub Actions workflows** (\`.github/workflows/\`), and plain-English manuals for running end-to-end GitHub Enterprise Cloud (GHEC / GHEC-EMU) migrations without uploading source code.

## Manuals Included in This Kit

- **[Consultant Operator's Manual](docs/guides/operators/consultant-operators-manual.md)**: Step-by-step instructions and complete input reference for running Discovery, Dry-Run, and Live Migration waves from the GitHub Actions Web UI or \`gh workflow run\`.
- **[Generating and Validating Migration Scopes](docs/guides/operators/generating-migration-scopes.md)**: Dedicated guide for generating scopes by visibility, repository list, or multi-organization consolidation (\`org_items_mode: associated-only\`).
- **[Project Manager & Engagement Lead Playbook](docs/guides/customers-and-pms/pm-engagement-playbook.md)**: Engagement phasing, client prerequisite tracker, and executive scorecard review guide.
- **[Customer Migration Handbook](docs/guides/customers-and-pms/customer-migration-handbook.md)**: Non-technical handbook for customer stakeholders explaining each migration phase, required tokens and settings, what moves automatically, and post-migration wrap-up tasks.
`,
    'utf8',
  );

  let tarballPath = null;
  if (createTarball) {
    tarballPath = join(
      dirname(outDir),
      `ghec-migration-kit-v${version}.tar.gz`,
    );
    execFileSync('tar', ['-czf', tarballPath, '-C', outDir, '.']);
  }

  return {
    version,
    outDir,
    bundlePath,
    tarballPath,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await buildReleaseKit();
  console.log(`Built Customer Migration Release Kit v${result.version}:`);
  console.log(`  Directory: ${result.outDir}`);
  console.log(`  CLI Bundle: ${result.bundlePath}`);
  if (result.tarballPath) {
    console.log(`  Archive:   ${result.tarballPath}`);
  }
}
