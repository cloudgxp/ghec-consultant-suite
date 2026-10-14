import { parseArgs } from 'node:util';
import {
  type SeedDispatchRequest,
  type SeedScopeLevel,
  validateSeedDispatchRequest,
} from '@ghec/contracts';
import { createDefaultOrchestrator } from './seeder/index.js';
import { appendGithubStepSummary } from './seeder/summary.js';

export function parseSeedDemoOptions(args: string[]): SeedDispatchRequest {
  const { values } = parseArgs({
    args,
    strict: false,
    options: {
      org: { type: 'string' },
      organization: { type: 'string' },
      repo: { type: 'string' },
      repository: { type: 'string' },
      scope: { type: 'string', default: 'both' },
      'scope-level': { type: 'string' },
      preset: { type: 'string' },
      modules: { type: 'string' },
      'content-type': { type: 'string' },
      prefix: { type: 'string', default: 'demo-' },
      'pat-secret': { type: 'string', default: 'GHEC_SOURCE_TOKEN' },
      'dry-run': { type: 'boolean', default: false },
      cleanup: { type: 'boolean', default: false },
      'cleanup-existing': { type: 'boolean', default: false },
      token: { type: 'string' },
    },
  });

  const org =
    (values.org as string | undefined) ??
    (values.organization as string | undefined) ??
    process.env.GHEC_ORG;
  const repo =
    (values.repo as string | undefined) ??
    (values.repository as string | undefined) ??
    process.env.GHEC_REPO;
  const scopeLevel = ((values.scope as string | undefined) ??
    (values['scope-level'] as string | undefined) ??
    'both') as SeedScopeLevel;
  const contentType =
    (values.preset as string | undefined) ??
    (values.modules as string | undefined) ??
    (values['content-type'] as string | undefined) ??
    'all';
  const patSecretName =
    (values['pat-secret'] as string | undefined) ?? 'GHEC_SOURCE_TOKEN';
  const dryRun = Boolean(values['dry-run']);
  const cleanupExisting = Boolean(values.cleanup || values['cleanup-existing']);
  const resourcePrefix = (values.prefix as string | undefined) ?? 'demo-';

  if (values.token && typeof values.token === 'string') {
    process.env.GHEC_TOKEN = values.token;
  }

  return validateSeedDispatchRequest({
    organization: org ?? '',
    repository: repo || undefined,
    scopeLevel,
    contentType,
    patSecretName,
    dryRun,
    cleanupExisting,
    resourcePrefix,
  });
}

export async function executeSeedDemoCommand(
  request: SeedDispatchRequest,
  logger: (msg: string) => void = console.log,
): Promise<number> {
  const orchestrator = createDefaultOrchestrator();
  const summary = await orchestrator.run(request, { logger });

  logger('\n========================================');
  logger('  DEMO SEEDING EXECUTION SUMMARY');
  logger('========================================');
  logger(`Organization:  ${summary.organization}`);
  logger(`Repository:    ${summary.repository ?? '(none)'}`);
  logger(`Scope Level:   ${summary.scopeLevel}`);
  logger(`Content Type:  ${summary.contentType}`);
  logger(`Mode:          ${summary.dryRun ? 'DRY-RUN' : 'LIVE'}`);
  logger(`Duration:      ${(summary.totalDurationMs / 1000).toFixed(2)}s`);
  logger('----------------------------------------');
  logger(`Total Items:   ${summary.counts.total}`);
  logger(`Created:       ${summary.counts.created}`);
  logger(`Updated:       ${summary.counts.updated}`);
  logger(`Skipped:       ${summary.counts.skipped}`);
  logger(`Deleted:       ${summary.counts.deleted}`);
  logger(`Failed:        ${summary.counts.failed}`);
  logger('========================================\n');

  appendGithubStepSummary(summary);

  if (summary.counts.failed > 0) {
    logger('Failures:');
    for (const err of summary.errors) {
      logger(`  ✗ ${err}`);
    }
    return 1;
  }

  return 0;
}
