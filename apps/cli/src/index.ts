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
  parsePublishResultsOptions,
  executePublishResultsCommand,
} from './commands/publish-results.js';
import {
  parseAuditGapLedgerOptions,
  executeAuditGapLedgerCommand,
} from './commands/audit/gap-ledger.js';
import {
  parseSeedDemoOptions,
  executeSeedDemoCommand,
} from './commands/seed-demo.js';
import {
  parseTeardownOptions,
  executeTeardownSandbox,
} from './commands/teardown-sandbox.js';
import {
  parseGenerateScopeOptions,
  executeGenerateScopeCommand,
  parseValidateScopeOptions,
  executeValidateScopeCommand,
} from './commands/generate-scope.js';
import {
  parseCutoverOptions,
  executeCutoverCommand,
} from './commands/cutover.js';
import {
  loadConfig,
  sanitizeDiagnostics,
  type CliConfig,
} from './config/index.js';
import {
  DiscoveryOrchestrator,
  PreflightPermissionError,
} from '@ghec/discovery';

export {
  validateMigrationScope,
  MIGRATION_SCHEMA_VERSION,
} from '@ghec/contracts';
export {
  sliceScaleAdaptiveMatrix,
  assertScratchDiskSpace,
  HttpTargetWriteClient,
  reconcilePostGeiVisibility,
} from '@ghec/migration';

export interface CliOverrides extends CliConfig {
  sourceClient?: GitHubReadAdapter | undefined;
  targetClient?: GitHubReadAdapter | undefined;
  sourceWriteClient?: TargetWriteClient | undefined;
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
  discover         Enumerate source tenant metadata and emit DiscoveryBundle
  generate-scope   Generate schema-validated MigrationScope JSON from org, repo list, or file
  validate-scope   Validate MigrationScope JSON against contract schema (with optional overrides)
  preflight        Evaluate source & destination readiness, token scopes, and blockers
  plan             Generate immutable MigrationPlan from MigrationScope
  migrate          Execute pre-approved MigrationPlan or Scope against target tenant
  verify           Audit destination tenant state against plan and produce VerificationReport
  cutover          Detach source-locked items (deploy keys, Pages CNAME) and migrate to target
  console          Launch local loopback console server and dashboard proxy
  agent-review     Analyze verification report and generate automated remediation plan
  publish-results  Generate and publish migration audit repository to target organization
  audit-gap-ledger Audit platform migration capabilities against suite modules and emit GapLedgerManifest
  seed-demo        Provision synthetic source content across 34 migration modules
  teardown-sandbox Purge test resources matching prefix filter from target organization

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
Options: --input <bundle.json> --modules <list> --output <file> --split-matrix <batch-size> --runner-capacity <capacity> --output-matrix <file> --sandbox-rehearsal --verbose
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
         --continue-on-error --dry-run --sandbox-rehearsal --output <file> --verbose
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
      for (const modRes of report.results) {
        const failedOps = modRes.results.filter((op) => op.status === 'failed');
        if (
          migrateOptions.verbose ||
          modRes.status === 'failed' ||
          modRes.status === 'partial' ||
          failedOps.length > 0
        ) {
          console.log(
            `  [${modRes.status.toUpperCase()}] module=${modRes.moduleId} ops=${modRes.results.length} failed=${failedOps.length} duration=${modRes.durationMs}ms`,
          );
          for (const fOp of failedOps) {
            console.error(
              `    -> Operation ${fOp.operationId} failed: ${sanitizeDiagnostics(fOp.error ?? 'unknown error')}`,
            );
          }
        }
      }
      if (report.recommendations && report.recommendations.length > 0) {
        for (const rec of report.recommendations) {
          console.warn(`  [RECOMMENDATION] ${sanitizeDiagnostics(rec)}`);
        }
      }
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
Options: --scope <file> --sandbox-rehearsal --output <file> --verbose
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
      for (const mod of result.report.modules) {
        if (
          verifyOptions.verbose ||
          !mod.verified ||
          mod.discrepancies.length > 0
        ) {
          console.log(
            `  [${mod.verified ? 'COMPLIANT' : 'DISCREPANCY'}] module=${mod.moduleId} discrepancies=${mod.discrepancies.length}`,
          );
          for (const d of mod.discrepancies) {
            console.log(
              `    -> ${d.resourceName}: ${sanitizeDiagnostics(d.message)} (expected=${JSON.stringify(d.expected)}, actual=${JSON.stringify(d.actual)})`,
            );
          }
        }
      }
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
Options: --execution-reports <path-or-dir> --spec <spec.md> --output <file> --output-markdown <file> --append-step-summary --verbose`);
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

  if (command === 'publish-results') {
    if (commandArgs.includes('--help')) {
      console.log(`ghec-consultant-cli publish-results — Generate and publish migration audit repository to target organization
Usage: ghec-consultant-cli publish-results [options]
Options: --execution-report <file> --verification-report <file> --remediation-plan <file>
         --scope <file> --target-org <org> --source-org <org> --repo-name <name>
         --output-dir <path> --dry-run --skip-push --append-step-summary --branch <name>
         --app-id <id> --private-key-path <path> --installation-id <id>
         --source-token <token> --target-token <token>`);
      return 0;
    }

    let publishOptions;
    try {
      publishOptions = parsePublishResultsOptions(commandArgs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `Invalid publish-results options: ${sanitizeDiagnostics(msg)}`,
      );
      return 2;
    }

    try {
      await executePublishResultsCommand(publishOptions, configOverride);
      return 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Publish results failed: ${sanitizeDiagnostics(msg)}`);
      return 1;
    }
  }

  if (command === 'audit-gap-ledger') {
    if (commandArgs.includes('--help')) {
      console.log(`ghec-consultant-cli audit-gap-ledger — Platform capability gap analysis
Usage: ghec-consultant-cli audit-gap-ledger [options]
Options: --format <json|table|markdown> --output <path> --category <category> --status <status>`);
      return 0;
    }

    const options = parseAuditGapLedgerOptions(commandArgs);
    return await executeAuditGapLedgerCommand(options);
  }

  if (command === 'seed-demo') {
    if (commandArgs.includes('--help')) {
      console.log(`ghec-consultant-cli seed-demo — Seed synthetic migration demo content
Usage: ghec-consultant-cli seed-demo --org <name> [options]
Options:
  --org, --organization <name>  Target organization name (required)
  --repo, --repository <name>   Target repository name (optional, auto-created)
  --scope <both|organization|repository> Scope level (default: both)
  --preset <preset|module-list> Content filter preset or comma-separated list (default: all)
  --prefix <string>             Resource prefix (default: demo-)
  --dry-run                     Simulate operations without making remote changes
  --cleanup                     Purge demo resources matching prefix before re-seeding
  --pat-secret <name>           Secret containing Personal Access Token (default: GHEC_SOURCE_TOKEN)`);
      return 0;
    }

    let options;
    try {
      options = parseSeedDemoOptions(commandArgs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Invalid seed-demo options: ${sanitizeDiagnostics(msg)}`);
      return 2;
    }

    return await executeSeedDemoCommand(options);
  }

  if (command === 'teardown-sandbox') {
    if (commandArgs.includes('--help')) {
      console.log(`ghec-consultant-cli teardown-sandbox — Purge test resources from target organization
Usage: ghec-consultant-cli teardown-sandbox --org <name> --prefix <prefix> [options]
Options:
  --org <name>      Target organization name (required)
  --prefix <string> Resource prefix filter (e.g. "dummy-", "demo-") (required, min 3 chars)
  --confirm         Confirm live deletion of matching resources (required for live run)
  --dry-run         Simulate deletion without mutating target resources
  --token <string>  Target administrative token (defaults to GHEC_TARGET_TOKEN)`);
      return 0;
    }

    let options;
    try {
      options = parseTeardownOptions(commandArgs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `Invalid teardown-sandbox options: ${sanitizeDiagnostics(msg)}`,
      );
      return 2;
    }

    try {
      const manifest = await executeTeardownSandbox(options);
      console.log(
        `Teardown completed: ${manifest.totalPurged} purged, ${manifest.totalRetained} retained (dryRun: ${manifest.dryRun}).`,
      );
      return 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Teardown failed: ${sanitizeDiagnostics(msg)}`);
      return 1;
    }
  }

  if (command === 'generate-scope') {
    if (commandArgs.includes('--help') || commandArgs.includes('-h')) {
      console.log(`ghec-consultant-cli generate-scope — Generate schema-compliant migration scope JSON
Usage: ghec-consultant-cli generate-scope --source <org> --target <org> (--all | --org-only | --repos <list> | --file <path>) [options]
Options:
  --source <org>               Source organization slug
  --target <org>               Target organization slug (required)
  --all                        Fetch all non-archived repositories from source organization
  --org-only                   Generate scope for organization-level resources only (no repositories)
  --repos <list>               Comma- or newline-separated repository names or URLs
  --file, --repos-file <path>  Path to file containing repository URLs or names (one per line)
  --name <scopeName>           Scope name (defaults to <source>-to-<target>-<mode>)
  --output <path>              Output JSON path (defaults to scopes/<name>.json)
  --target-type <ghec|emu>     Target tenant type ('ghec' or 'emu')
  --emu-shortcode <shortcode>  EMU shortcode/suffix (e.g. 'acme' or '_acme')
  --lfs-strategy <strategy>    LFS strategy: 'dual-remote-stream' (default) or 'skip'
  --mirror-push-mode <mode>    Mirror-push mode: 'fast-snapshot' (default) or 'full-history'
  --target-visibility <vis>    Override visibility ('private', 'internal', 'public')
  --target-repo-prefix <str>   Prefix for target repository names (supports '{source}-' placeholder)
  --target-repo-suffix <str>   Suffix for target repository names (supports '-{source}' placeholder)
  --include-archived           Include archived repositories when using --all
  --skip-releases              Skip release asset migration
  --org-items <mode>           Organization items mode: 'all', 'associated-only', or 'none'
  --include-org-resources <b>  Include org-level modules ('true' default or 'false')
  --org-modules <list>         Comma-separated org modules to include
  --repo-modules <list>        Comma-separated repo modules to include
  --sandbox-rehearsal          Keep all target Webhooks and GitHub Actions disabled during rehearsal
  --dry-run                    Print generated scope JSON to stdout without writing to disk`);
      return 0;
    }

    let scopeOptions;
    try {
      scopeOptions = parseGenerateScopeOptions(commandArgs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `Invalid generate-scope options: ${sanitizeDiagnostics(msg)}`,
      );
      return 2;
    }

    try {
      await executeGenerateScopeCommand(scopeOptions);
      return 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Scope generation failed: ${sanitizeDiagnostics(msg)}`);
      return 1;
    }
  }

  if (command === 'validate-scope') {
    if (commandArgs.includes('--help') || commandArgs.includes('-h')) {
      console.log(`ghec-consultant-cli validate-scope — Validate migration scope JSON against contract schema
Usage: ghec-consultant-cli validate-scope [--scope] <file> [options]
Options:
  --scope <file>               Path to migration scope JSON file
  --target-type <ghec|emu>     Optional targetType override to apply before validation
  --emu-shortcode <shortcode>  Optional EMU shortcode override when target-type is 'emu'
  --mirror-push-mode <mode>    Optional mirrorPushMode override ('fast-snapshot' or 'full-history')
  --org-items <mode>           Optional orgItemsMode override ('all', 'associated-only', or 'none')
  --sandbox-rehearsal          Enable sandboxRehearsal across scope organizations and repositories`);
      return 0;
    }

    let validateOptions;
    try {
      validateOptions = parseValidateScopeOptions(commandArgs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `Invalid validate-scope options: ${sanitizeDiagnostics(msg)}`,
      );
      return 2;
    }

    try {
      executeValidateScopeCommand(validateOptions);
      return 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Scope validation failed: ${sanitizeDiagnostics(msg)}`);
      return 1;
    }
  }

  if (command === 'cutover') {
    if (commandArgs.includes('--help') || commandArgs.includes('-h')) {
      console.log(`ghec-consultant-cli cutover — Post-migration source-detach cutover
Usage: ghec-consultant-cli cutover (--scope <file> | --source-org <org> --target-org <org>) [options]
Options:
  --scope <file>                  Path to migration scope JSON file
  --source-org <org>              Source organization slug
  --target-org <org>              Target organization slug
  --repos <list>                  Comma-separated repository names to cut over
  --include-deploy-keys           Detach SSH deploy keys from source and recreate on target (default: true)
  --include-pages-cname           Detach GitHub Pages custom CNAME from source and bind on target (default: true)
  --deactivate-source-webhooks    Deactivate active webhooks on source repositories and organization
  --disable-source-actions        Disable GitHub Actions on source repositories
  --archive-source-repos          Archive source repositories (read-only) after cutover
  --dry-run                       Simulate cutover operations without mutating source or target
  --output <file>                 Output JSON report path (default: ./scans/cutover-report.json)
  --append-step-summary           Append Markdown summary to GITHUB_STEP_SUMMARY
  --source-token <token>          Source administrative token (defaults to GHEC_SOURCE_TOKEN)
  --target-token <token>          Target administrative token (defaults to GHEC_TARGET_TOKEN)`);
      return 0;
    }

    let cutoverOptions;
    try {
      cutoverOptions = parseCutoverOptions(commandArgs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Invalid cutover options: ${sanitizeDiagnostics(msg)}`);
      return 2;
    }

    const controller = new AbortController();
    const onSigint = () => controller.abort();
    process.once('SIGINT', onSigint);

    try {
      const { report, filePath } = await executeCutoverCommand(
        cutoverOptions,
        {
          sourceClient: configOverride?.sourceClient,
          targetClient: configOverride?.targetClient,
          sourceWriteClient: configOverride?.sourceWriteClient,
          targetWriteClient: configOverride?.targetWriteClient,
        },
        controller.signal,
      );
      console.log(`Cutover report saved: ${filePath}`);
      console.log(
        `Actions: ${report.summary.totalActions} (${report.summary.succeeded} succeeded, ${report.summary.planned} planned, ${report.summary.skipped} skipped, ${report.summary.rolledBack} rolled back, ${report.summary.failed} failed)`,
      );
      return report.summary.failed > 0 || report.summary.rolledBack > 0 ? 1 : 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Cutover failed: ${sanitizeDiagnostics(msg)}`);
      return 1;
    } finally {
      process.removeListener('SIGINT', onSigint);
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
