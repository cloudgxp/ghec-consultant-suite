#!/usr/bin/env node

/**
 * scaffold-module.mjs
 * Generates template files for a new migration module conforming to the 4-stage lifecycle.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node scaffold-module.mjs <module-id> [DisplayName] [--dry-run]

Arguments:
  module-id    Unique identifier in kebab-case (e.g. 'repo-autolinks')
  DisplayName  Optional human-readable title (e.g. 'Repository Autolink References')
  --dry-run    Print planned file creations without writing to disk
`);
  process.exit(0);
}

const isDryRun = args.includes('--dry-run');
const positional = args.filter((a) => !a.startsWith('--'));

const moduleId = positional[0];
const displayName =
  positional[1] ||
  moduleId
    .replace(/(^|-)([a-z])/g, (_, p1, p2) => ` ${p2.toUpperCase()}`)
    .trim();

if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(moduleId)) {
  console.error(
    `Error: Module ID must be kebab-case (e.g. 'custom-rulesets'). Received: '${moduleId}'`,
  );
  process.exit(1);
}

const rootDir = process.cwd();
const moduleDir = resolve(rootDir, 'packages/migration/src/modules', moduleId);
const testFile = resolve(
  rootDir,
  'packages/migration/tests/modules',
  `${moduleId}.test.ts`,
);

console.log(`Scaffolding migration module: ${moduleId} ("${displayName}")`);
if (isDryRun) {
  console.log(`[Dry-Run Mode] No files will be written.`);
}

const typesContent = `export interface ${toPascalCase(moduleId)}Resource {
  readonly id: string;
  readonly name: string;
  readonly settings: Record<string, unknown>;
}

export interface ${toPascalCase(moduleId)}Plan {
  readonly actions: ReadonlyArray<{
    readonly action: 'create' | 'update' | 'skip';
    readonly resourceName: string;
    readonly payload?: Record<string, unknown>;
  }>;
}
`;

const moduleContent = `import type {
  MigrationModule,
  MigrationContext,
  ApplyOptions,
  ApplyResult,
  ModuleVerifyResult,
} from '../../core/types.js';
import type { ${toPascalCase(moduleId)}Resource, ${toPascalCase(moduleId)}Plan } from './types.js';

export class ${toPascalCase(moduleId)}MigrationModule implements MigrationModule<${toPascalCase(moduleId)}Resource, ${toPascalCase(moduleId)}Plan> {
  readonly id = '${moduleId}';
  readonly displayName = '${displayName}';
  readonly dependencies: readonly string[] = ['gei-repo'];

  async discover(context: MigrationContext): Promise<${toPascalCase(moduleId)}Resource> {
    context.logger.info(\`Discovering \${this.displayName} for repository: \${context.repository.name}\`);
    return {
      id: context.repository.name,
      name: context.repository.name,
      settings: {},
    };
  }

  async plan(context: MigrationContext, sourceData: ${toPascalCase(moduleId)}Resource): Promise<${toPascalCase(moduleId)}Plan> {
    context.logger.info(\`Planning \${this.displayName} diff for: \${sourceData.name}\`);
    return {
      actions: [
        {
          action: 'create',
          resourceName: sourceData.name,
          payload: sourceData.settings,
        },
      ],
    };
  }

  async apply(
    context: MigrationContext,
    plan: ${toPascalCase(moduleId)}Plan,
    options: ApplyOptions,
  ): Promise<ApplyResult> {
    if (options.dryRun) {
      context.logger.info(\`[Dry-Run] Would apply \${plan.actions.length} action(s) for \${this.displayName}\`);
      return {
        success: true,
        appliedCount: plan.actions.length,
        skippedCount: 0,
        errors: [],
      };
    }

    context.logger.info(\`Applying \${plan.actions.length} action(s) for \${this.displayName}\`);
    return {
      success: true,
      appliedCount: plan.actions.length,
      skippedCount: 0,
      errors: [],
    };
  }

  async verify(
    context: MigrationContext,
    expected: ${toPascalCase(moduleId)}Resource,
  ): Promise<ModuleVerifyResult> {
    context.logger.info(\`Verifying \${this.displayName} on target for: \${expected.name}\`);
    return {
      moduleId: this.id,
      verified: true,
      discrepancies: [],
    };
  }
}
`;

const indexContent = `export * from './types.js';
export * from './module.js';
`;

function toPascalCase(str) {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

const testContent = `import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ${toPascalCase(moduleId)}MigrationModule } from '../../src/modules/${moduleId}/index.js';

describe('${toPascalCase(moduleId)}MigrationModule', () => {
  it('instantiates and provides valid metadata', () => {
    const mod = new ${toPascalCase(moduleId)}MigrationModule();
    assert.equal(mod.id, '${moduleId}');
    assert.equal(mod.displayName, '${displayName}');
  });
});
`;

const files = [
  { path: join(moduleDir, 'types.ts'), content: typesContent },
  { path: join(moduleDir, 'module.ts'), content: moduleContent },
  { path: join(moduleDir, 'index.ts'), content: indexContent },
  { path: testFile, content: testContent },
];

for (const file of files) {
  console.log(` -> ${file.path}`);
  if (!isDryRun) {
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.content, 'utf-8');
  }
}

console.log(`\nNext steps:`);
console.log(`1. Export from packages/migration/src/modules/index.ts`);
console.log(`2. Register in packages/migration/src/core/registry.ts`);
console.log(`3. Run: npm test`);
