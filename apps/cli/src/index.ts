#!/usr/bin/env node
import { MODULE_IDS } from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import type { TargetWriteClient } from '@ghec/migration';
import { pathToFileURL } from 'node:url';
import { parseDiscoveryOptions } from './commands/discover.js';
import { parsePlanOptions, executePlanCommand } from './commands/plan.js';
import {
  parseMigrateOptions,
  executeMigrateCommand,
} from './commands/migrate.js';
import { parseVerifyOptions, executeVerifyCommand } from './commands/verify.js';
import {
  parsePreflightOptions,
  executePreflightCommand,
} from './commands/preflight.js';
import {
  parseConsoleOptions,
  executeConsoleCommand,
} from './commands/console.js';
import {
  parseAgentReviewOptions,
  executeAgentReviewCommand,
} from './commands/agent-review.js';
import {
  loadConfig,
  sanitizeDiagnostics,
  type CliConfig,
} from './config/index.js';
import {
  DiscoveryOrchestrator,
  PreflightPermissionError,
} from '@ghec/discovery';

export interface CliOverrides extends CliConfig {
  sourceClient?: GitHubReadAdapter | undefined;
  targetClient?: GitHubReadAdapter | undefined;
  targetWriteClient?: TargetWriteClient | undefined;
}

export async function runCli(
  args: string[] = process.argv.slice(2),
  configOverride?: CliOverrides,
): Promise<number> {
  const isHelp = args.includes('--help') || args.length === 0;

  if (isHelp && (args.length === 0 || args[0] === '--help')) {
    console.log(`ghec-consultant-cli — GitHub Enterprise Cloud migration & discovery suite

Usage: ghec-consultant-cli <command> [options]

Commands:
  discover    Enumerate source tenant metadata and emit DiscoveryBundle
  preflight   Evaluate source & destination readiness, token scopes, and blockers
  plan        Generate immutable MigrationPlan from MigrationScope
  migrate     Execute pre-approved MigrationPlan or Scope against target tenant
  verify      Audit destination tenant state against plan and produce VerificationReport
  console     Launch local loopback console server and dashboard proxy
  agent-review Analyze verification report and generate automated remediation plan

Global Options:
  --help      Show help for command
  --version   Show CLI version

Modules: ${MODULE_IDS.join(', ')}`);
    return 0;
  }

  if (args.length === 1 && args[0] === '--version') {
    console.log('0.1.0');
    return 0;
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  if (command === 'discover') {
    if (commandArgs.includes('--help')) {
      console.log(`ghec-consultant-cli discover — GitHub Enterprise Cloud discovery tool
Usage: ghec-consultant-cli discover --modules <list|all> (--organization <name> | --enterprise <slug>)
       ghec-consultant-cli discover --resume [checkpoint-id|latest]
Options: --output <path> --format json --dry-run --include-sensitive-metadata
         --redaction-profile <standard|minimal> --continue-on-error --verbose
         --app-id <id> --private-key-path <path> --installation-id <id>
         --resume [checkpoint-id|latest] --salt <secret>
Modules: ${MODULE_IDS.join(', ')}`);
      return 0;
    }

    let plan;
    try {
      plan = parseDiscoveryOptions(commandArgs);
    } catch {
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

  if (command === 'preflight') {
    if (commandArgs.includes('--help')) {
      console.log(`ghec-consultant-cli preflight — Evaluate migration readiness & credential capabilities
Usage: ghec-consultant-cli preflight --scope <file> [options]
Options: --output <file> --verbose
         --app-id <id> --private-key-path <path> --installation-id <id>
         --source-token <token> --target-token <token>`);
      return 0;
    }

    let preflightOptions;
    try {
      preflightOptions = parsePreflightOptions(commandArgs);
    } catch {
      console.error('Invalid preflight options. Use preflight --help.');
      return 2;
    }

    const controller = new AbortController();
    const onSigint = () => controller.abort();
    process.once('SIGINT', onSigint);

    try {
      const { report, filePath, hasBlockers, blockedCount } =
        await executePreflightCommand(
          preflightOptions,
          {
            sourceClient: configOverride?.sourceClient,
            targetClient: configOverride?.targetClient,
          },
          controller.signal,
        );
      console.log(`Preflight report saved: ${filePath}`);
      console.log(
        `Evaluated repositories: ${report.repositoryAssessments.length}`,
      );
      console.log(`Blocked repositories: ${blockedCount}`);

      if (hasBlockers) {
        console.error('Preflight evaluation found blockers:');
        const allBlockers = Array.from(
          new Set(report.repositoryAssessments.flatMap((r) => r.blockers)),
        );
        for (const blocker of allBlockers) {
          console.error(`  - ${blocker}`);
        }
        return 1;
      }

      console.log(
        'Preflight evaluation completed successfully: 0 blockers found.',
      );
      return 0;
    } catch (err) {
      if (controller.signal.aborted) {
        console.error('Preflight interrupted.');
        return 130;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Preflight evaluation failed: ${sanitizeDiagnostics(msg)}`);
      return 1;
    } finally {
      process.removeListener('SIGINT', onSigint);
    }
  }

  if (command === 'plan') {
    if (commandArgs.includes('--help')) {
      console.log(`ghec-consultant-cli plan — Generate migration plan
Usage: ghec-consultant-cli plan --scope <file> [options]
Options: --input <bundle.json> --modules <list> --output <file> --split-matrix <batch-size> --runner-capacity <capacity> --output-matrix <file> --verbose
         --app-id <id> --private-key-path <path> --installation-id <id>
         --source-token <token> --target-token <token>`);
      return 0;
    }

    let planOptions;
    try {
      planOptions = parsePlanOptions(commandArgs);
    } catch {
      console.error('Invalid plan options. Use plan --help.');
      return 2;
    }

    const controller = new AbortController();
    const onSigint = () => controller.abort();
    process.once('SIGINT', onSigint);

    try {
      const { plan, filePath, matrix, matrixFilePath } =
        await executePlanCommand(
          planOptions,
          {
            sourceClient: configOverride?.sourceClient,
            targetClient: configOverride?.targetClient,
          },
          controller.signal,
        );
      console.log(`Migration plan generated: ${filePath}`);
      console.log(`Plan ID: ${plan.planId}`);
      console.log(`Scope: ${plan.scopeName}`);
      console.log(
        `Operations: ${plan.summary.create} create, ${plan.summary.update} update, ${plan.summary.noop} noop, ${plan.summary.skip} skip`,
      );
      if (matrix && matrixFilePath) {
        console.log(`GitHub Actions matrix generated: ${matrixFilePath}`);
        console.log(`Total matrix cohorts: ${matrix.include.length}`);
      }
      return 0;
    } catch (err) {
      if (controller.signal.aborted) {
        console.error('Plan command interrupted.');
        return 130;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Plan failed: ${sanitizeDiagnostics(msg)}`);
      return 1;
    } finally {
      process.removeListener('SIGINT', onSigint);
    }
  }

  if (command === 'migrate') {
    if (commandArgs.includes('--help')) {
      console.log(`ghec-consultant-cli migrate — Execute migration
Usage: ghec-consultant-cli migrate (--plan <file> | --scope <file>) [options]
Options: --input <bundle.json> --modules <list> --resume [checkpoint-id|latest]
         --continue-on-error --dry-run --output <file> --verbose
         --app-id <id> --private-key-path <path> --installation-id <id>
         --source-token <token> --target-token <token>`);
      return 0;
    }

    let migrateOptions;
    try {
      migrateOptions = parseMigrateOptions(commandArgs);
    } catch {
      console.error('Invalid migrate options. Use migrate --help.');
      return 2;
    }

    const controller = new AbortController();
    const onSigint = () => controller.abort();
    process.once('SIGINT', onSigint);

    try {
      const { report, filePath } = await executeMigrateCommand(
        migrateOptions,
        {
          sourceClient: configOverride?.sourceClient,
          targetClient: configOverride?.targetClient,
          targetWriteClient: configOverride?.targetWriteClient,
        },
        controller.signal,
      );
      console.log(`Migration finished with status: ${report.status}`);
      console.log(`Execution report saved: ${filePath}`);
      console.log(`Modules executed: ${report.results.length}`);
      return report.exitCode;
    } catch (err) {
      if (controller.signal.aborted) {
        console.error('Migration interrupted.');
        return 130;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Migration failed: ${sanitizeDiagnostics(msg)}`);
      return 1;
    } finally {
      process.removeListener('SIGINT', onSigint);
    }
  }

  if (command === 'verify') {
    if (commandArgs.includes('--help')) {
      console.log(`ghec-consultant-cli verify — Verify migration compliance
Usage: ghec-consultant-cli verify --plan <file> [options]
Options: --scope <file> --output <file> --verbose
         --app-id <id> --private-key-path <path> --installation-id <id>
         --source-token <token> --target-token <token>`);
      return 0;
    }

    let verifyOptions;
    try {
      verifyOptions = parseVerifyOptions(commandArgs);
    } catch {
      console.error('Invalid verify options. Use verify --help.');
      return 2;
    }

    const controller = new AbortController();
    const onSigint = () => controller.abort();
    process.once('SIGINT', onSigint);

    try {
      const { result, filePath } = await executeVerifyCommand(
        verifyOptions,
        {
          targetClient: configOverride?.targetClient,
          sourceClient: configOverride?.sourceClient,
        },
        controller.signal,
      );
      console.log(`Verification report saved: ${filePath}`);
      console.log(
        `Verified modules: ${result.report.summary.verifiedModuleCount} / ${result.report.modules.length}`,
      );
      console.log(
        `Discrepancies found: ${result.report.summary.discrepancyCount}`,
      );
      return result.exitCode;
    } catch (err) {
      if (controller.signal.aborted) {
        console.error('Verification interrupted.');
        return 130;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Verification failed: ${sanitizeDiagnostics(msg)}`);
      return 1;
    } finally {
      process.removeListener('SIGINT', onSigint);
    }
  }

  if (command === 'console') {
    if (commandArgs.includes('--help')) {
      console.log(`ghec-consultant-cli console — Launch local loopback console server and dashboard proxy
Usage: ghec-consultant-cli console [options]
Options: --port <number> --host <address> --no-open`);
      return 0;
    }

    let consoleOptions;
    try {
      consoleOptions = parseConsoleOptions(commandArgs);
    } catch {
      console.error('Invalid console options. Use console --help.');
      return 2;
    }

    const controller = new AbortController();
    const onSigint = () => controller.abort();
    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigint);

    try {
      await executeConsoleCommand(consoleOptions, undefined, controller.signal);

      // Keep server alive until abort signal is received
      await new Promise<void>((resolve) => {
        controller.signal.addEventListener('abort', () => resolve(), {
          once: true,
        });
      });

      return 0;
    } catch (err) {
      if (controller.signal.aborted) {
        return 0;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Console server failed: ${sanitizeDiagnostics(msg)}`);
      return 1;
    } finally {
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigint);
    }
  }

  if (command === 'agent-review') {
    if (commandArgs.includes('--help')) {
      console.log(`ghec-consultant-cli agent-review — Analyze verification report and generate automated remediation plan
Usage: ghec-consultant-cli agent-review --report <file> [options]
Options: --spec <spec.md> --output <file> --output-markdown <file> --append-step-summary --verbose`);
      return 0;
    }

    let reviewOptions;
    try {
      reviewOptions = parseAgentReviewOptions(commandArgs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `Invalid agent-review options: ${sanitizeDiagnostics(msg)}`,
      );
      return 2;
    }

    try {
      const result = await executeAgentReviewCommand(reviewOptions);
      console.log(
        `Agentic remediation plan generated: ${result.plan.actions.length} action(s) for ${result.plan.totalDiscrepancies} discrepancy(ies).`,
      );
      console.log(`  JSON Plan:     ${result.jsonPath}`);
      console.log(`  Markdown Plan: ${result.markdownPath}`);
      return 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Agent review failed: ${sanitizeDiagnostics(msg)}`);
      return 1;
    }
  }

  console.error('Unknown command. Use --help.');
  return 2;
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  process.exitCode = await runCli();
}
