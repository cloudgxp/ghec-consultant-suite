#!/usr/bin/env node
import { MODULE_IDS } from '@ghec/contracts';
import { pathToFileURL } from 'node:url';
import { parseDiscoveryOptions } from './commands/discover.js';
import {
  loadConfig,
  sanitizeDiagnostics,
  type CliConfig,
} from './config/index.js';
import { DiscoveryOrchestrator } from './engine/orchestrator.js';
import { PreflightPermissionError } from './permissions/index.js';

export async function runCli(
  args: string[] = process.argv.slice(2),
  configOverride?: CliConfig,
): Promise<number> {
  if (
    args.length === 0 ||
    args[0] === '--help' ||
    (args[0] === 'discover' && args.includes('--help'))
  ) {
    console.log(`ghec-consultant-cli — GitHub Enterprise Cloud discovery tool
Usage: ghec-consultant-cli discover --modules <list|all> (--organization <name> | --enterprise <slug>)
       ghec-consultant-cli discover --resume [checkpoint-id|latest]
Options: --output <path> --format json --dry-run --include-sensitive-metadata
         --redaction-profile <standard|minimal> --continue-on-error --verbose
         --app-id <id> --private-key-path <path> --installation-id <id>
         --resume [checkpoint-id|latest] --salt <secret>
Modules: ${MODULE_IDS.join(', ')}`);
    return 0;
  }

  if (args.length === 1 && args[0] === '--version') {
    console.log('0.1.0');
    return 0;
  }

  if (args[0] !== 'discover') {
    console.error('Unknown command. Use --help.');
    return 2;
  }

  let plan;
  try {
    plan = parseDiscoveryOptions(args.slice(1));
  } catch {
    // Parser errors may include supplied values. Do not echo user input.
    console.error('Invalid discovery options. Use discover --help.');
    return 2;
  }

  const config =
    configOverride ??
    loadConfig({
      appId: plan.appId,
      privateKeyPath: plan.privateKeyPath,
      installationId: plan.installationId,
    });
  const orchestrator = new DiscoveryOrchestrator(plan, config);

  const controller = new AbortController();
  const onSigint = () => {
    controller.abort();
  };
  process.once('SIGINT', onSigint);

  try {
    if (plan.dryRun) {
      await orchestrator.executeDryRun(controller.signal);
      return 0;
    }

    const result = await orchestrator.run(controller.signal);
    console.log(`Discovery finished with exit code ${result.exitCode}.`);
    console.log(`Bundle published: ${result.filePath}`);
    console.log(`Status: ${result.bundle.scan.status}`);
    console.log(`Entities collected: ${result.bundle.entities.length}`);
    return result.exitCode;
  } catch (err) {
    if (controller.signal.aborted) {
      console.error(
        `Discovery interrupted. Run can be resumed with: ghec-consultant-cli discover --resume ${orchestrator.getRunId()}`,
      );
      return 130;
    } else if (err instanceof PreflightPermissionError) {
      return 1;
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Discovery failed: ${sanitizeDiagnostics(msg)}`);
      return 1;
    }
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  process.exitCode = await runCli();
}
