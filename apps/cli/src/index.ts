#!/usr/bin/env node
import { MODULE_IDS } from '@ghec/contracts';
import { parseDiscoveryOptions } from './commands/discover.js';
import { loadConfig, sanitizeDiagnostics } from './config/index.js';
import { DiscoveryOrchestrator } from './engine/orchestrator.js';

const args = process.argv.slice(2);

async function main(): Promise<void> {
  if (
    args.length === 0 ||
    args[0] === '--help' ||
    (args[0] === 'discover' && args.includes('--help'))
  ) {
    console.log(`ghec-consultant-cli — GitHub Enterprise Cloud discovery tool
Usage: ghec-consultant-cli discover --modules <list|all> (--organization <name> | --enterprise <slug>)
Options: --output <path> --format json --dry-run --include-sensitive-metadata
         --redaction-profile <standard|minimal> --continue-on-error --verbose
Modules: ${MODULE_IDS.join(', ')}`);
    return;
  }

  if (args.length === 1 && args[0] === '--version') {
    console.log('0.1.0');
    return;
  }

  if (args[0] !== 'discover') {
    console.error('Unknown command. Use --help.');
    process.exitCode = 2;
    return;
  }

  let plan;
  try {
    plan = parseDiscoveryOptions(args.slice(1));
  } catch {
    // Parser errors may include supplied values. Do not echo user input.
    console.error('Invalid discovery options. Use discover --help.');
    process.exitCode = 2;
    return;
  }

  const config = loadConfig();
  const orchestrator = new DiscoveryOrchestrator(plan, config);

  if (plan.dryRun) {
    orchestrator.printDryRunPlan();
    process.exitCode = 0;
    return;
  }

  const controller = new AbortController();
  const onSigint = () => {
    controller.abort();
  };
  process.once('SIGINT', onSigint);

  try {
    const result = await orchestrator.run(controller.signal);
    console.log(`Discovery finished with exit code ${result.exitCode}.`);
    console.log(`Bundle published: ${result.filePath}`);
    console.log(`Status: ${result.bundle.scan.status}`);
    console.log(`Entities collected: ${result.bundle.entities.length}`);
    process.exitCode = result.exitCode;
  } catch (err) {
    if (controller.signal.aborted) {
      console.error('Discovery aborted by user.');
      process.exitCode = 130;
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Discovery failed: ${sanitizeDiagnostics(msg)}`);
      process.exitCode = 1;
    }
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}

await main();
