#!/usr/bin/env node
import {
  parseSeedDemoOptions,
  executeSeedDemoCommand,
} from '../apps/cli/src/commands/seed-demo.js';
import { sanitizeDiagnostics } from '@ghec/github-client';

async function main(): Promise<number> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`seed-demo-content.ts — Standalone runner for synthetic demo content seeding
Usage: node --import tsx scripts/seed-demo-content.ts [options]

Environment Variables:
  GHEC_TOKEN or GHEC_SOURCE_TOKEN   GitHub Personal Access Token (admin:org, repo, delete_repo, workflow)
  GHEC_ORG                          Target organization name
  GHEC_REPO                         Target repository name

CLI Options:
  --org <name>                      Target organization name
  --repo <name>                     Target repository name (auto-created if missing)
  --scope <both|organization|repository> Scope level (default: both)
  --preset <preset|module-list>     Content preset or comma-separated module IDs (default: all)
  --prefix <string>                 Naming prefix for demo resources (default: demo-)
  --dry-run                         Simulate operations without making remote changes
  --cleanup                         Purge demo resources matching prefix before re-seeding
`);
    return 0;
  }

  let options;
  try {
    options = parseSeedDemoOptions(args);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${sanitizeDiagnostics(msg)}`);
    return 2;
  }

  return await executeSeedDemoCommand(options);
}

const exitCode = await main();
if (exitCode !== 0) {
  process.exit(exitCode);
}
