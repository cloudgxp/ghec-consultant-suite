#!/usr/bin/env node

/**
 * preflight-scope.mjs
 * Validates a migration scope JSON file before wave execution.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node preflight-scope.mjs --scope <path-to-scope.json>

Options:
  --scope <file>  Path to migration scope JSON file (required)
  --help, -h      Display this help message
`);
  process.exit(0);
}

const scopeIndex = args.indexOf('--scope');
const scopePath =
  scopeIndex !== -1 && args[scopeIndex + 1] ? args[scopeIndex + 1] : args[0];

if (!scopePath) {
  console.error('Error: Missing required --scope argument.');
  process.exit(1);
}

const resolvedPath = resolve(process.cwd(), scopePath);

if (!existsSync(resolvedPath)) {
  console.error(`Error: Scope file not found: ${resolvedPath}`);
  process.exit(1);
}

try {
  const content = readFileSync(resolvedPath, 'utf-8');
  const scope = JSON.parse(content);

  console.log(`\n========================================`);
  console.log(` Migration Scope Preflight Audit`);
  console.log(` File: ${scopePath}`);
  console.log(`========================================`);

  const name = scope.name || 'unnamed-scope';
  const version = scope.version || scope.schemaVersion || '1.0.0';
  console.log(`Scope Name : ${name}`);
  console.log(`Version    : ${version}`);

  const orgs = Array.isArray(scope.organizations) ? scope.organizations : [];
  console.log(`Orgs Mapped: ${orgs.length}`);
  for (const org of orgs) {
    console.log(` - ${org.source} -> ${org.target}`);
  }

  const repos = Array.isArray(scope.repositories) ? scope.repositories : [];
  console.log(`Repo Count : ${repos.length}`);

  if (repos.length === 0 && orgs.length === 0) {
    throw new Error('Scope contains neither organizations nor repositories.');
  }

  if (repos.length > 0) {
    console.log(`Sample Repos:`);
    for (const r of repos.slice(0, 5)) {
      const src = r.sourceRepo || (typeof r === 'string' ? r : r.name);
      const tgt = r.targetRepo || src;
      const modules = Array.isArray(r.modules)
        ? ` [${r.modules.length} modules]`
        : '';
      console.log(` - ${src} -> ${tgt}${modules}`);
    }
    if (repos.length > 5) {
      console.log(` ... and ${repos.length - 5} more.`);
    }
  }

  console.log(`\n✅ Scope syntax and structure validated successfully.\n`);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n❌ Failed to validate scope file: ${message}\n`);
  process.exit(1);
}
