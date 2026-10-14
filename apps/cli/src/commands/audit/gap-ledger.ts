import { writeFileSync } from 'node:fs';
import {
  generateGapLedgerManifest,
  type CapabilityGapEntry,
  type GapLedgerManifest,
  type ResourceCategory,
  type ImplementationStatus,
} from '@ghec/contracts';

export interface AuditGapLedgerOptions {
  readonly format?: 'json' | 'table' | 'markdown' | undefined;
  readonly output?: string | undefined;
  readonly category?: ResourceCategory | undefined;
  readonly status?: ImplementationStatus | undefined;
}

export function parseAuditGapLedgerOptions(
  args: readonly string[],
): AuditGapLedgerOptions {
  let format: 'json' | 'table' | 'markdown' = 'table';
  let output: string | undefined = undefined;
  let category: ResourceCategory | undefined = undefined;
  let status: ImplementationStatus | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) {
      continue;
    }

    if (arg === '--format' && i + 1 < args.length) {
      const val = args[++i];
      if (val === 'json' || val === 'table' || val === 'markdown') {
        format = val;
      }
    } else if (arg.startsWith('--format=')) {
      const val = arg.split('=')[1];
      if (val === 'json' || val === 'table' || val === 'markdown') {
        format = val;
      }
    } else if (arg === '--output' && i + 1 < args.length) {
      output = args[++i];
    } else if (arg.startsWith('--output=')) {
      output = arg.split('=')[1];
    } else if (arg === '--category' && i + 1 < args.length) {
      category = args[++i] as ResourceCategory;
    } else if (arg === '--status' && i + 1 < args.length) {
      status = args[++i] as ImplementationStatus;
    }
  }

  return { format, output, category, status };
}

export function renderTable(resources: readonly CapabilityGapEntry[]): string {
  const lines: string[] = [];
  lines.push(
    `| ${'ID'.padEnd(28)} | ${'Category'.padEnd(12)} | ${'Status'.padEnd(11)} | ${'Mechanism'.padEnd(18)} | ${'Module ID'.padEnd(26)} |`,
  );
  lines.push(
    `|${'-'.repeat(30)}|${'-'.repeat(14)}|${'-'.repeat(13)}|${'-'.repeat(20)}|${'-'.repeat(28)}|`,
  );

  for (const r of resources) {
    const mod = r.existingModuleId ?? r.proposedModuleId ?? '-';
    lines.push(
      `| ${r.id.padEnd(28)} | ${r.category.padEnd(12)} | ${r.status.padEnd(11)} | ${r.mechanism.padEnd(18)} | ${mod.padEnd(26)} |`,
    );
  }

  return lines.join('\n');
}

export function renderMarkdown(manifest: GapLedgerManifest): string {
  const lines: string[] = [];
  lines.push('# GHEC Consultant Suite — Migration Capability Gap Ledger');
  lines.push('');
  lines.push(
    `**Generated**: ${manifest.generatedAt} | **Version**: ${manifest.schemaVersion}`,
  );
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(
    `- **Total Resources Audited**: ${manifest.summary.totalResources}`,
  );
  lines.push(`- **Implemented Modules**: ${manifest.summary.implementedCount}`);
  lines.push(`- **Partial Coverage**: ${manifest.summary.partialCount}`);
  lines.push(`- **Missing Capabilities**: ${manifest.summary.missingCount}`);
  lines.push('');
  lines.push('## Capability Inventory');
  lines.push('');
  lines.push(renderTable(manifest.resources));
  lines.push('');
  lines.push('## Implementation Waves');
  lines.push('');
  for (const wave of manifest.waves) {
    lines.push(`### ${wave.name} (${wave.priority})`);
    lines.push(`- **Target Modules**: \`${wave.moduleIds.join('`, `')}\``);
    lines.push(`- **Rationale**: ${wave.rationale}`);
    lines.push('');
  }

  return lines.join('\n');
}

export async function executeAuditGapLedgerCommand(
  options: AuditGapLedgerOptions,
): Promise<number> {
  const manifest = generateGapLedgerManifest();

  let filteredResources = manifest.resources;
  if (options.category) {
    filteredResources = filteredResources.filter(
      (r) => r.category === options.category,
    );
  }
  if (options.status) {
    filteredResources = filteredResources.filter(
      (r) => r.status === options.status,
    );
  }

  let outputText = '';
  if (options.format === 'json') {
    outputText = JSON.stringify(manifest, null, 2);
  } else if (options.format === 'markdown') {
    outputText = renderMarkdown(manifest);
  } else {
    // Table format
    const summary = manifest.summary;
    console.log('\n=== GHEC Migration Capability Gap Ledger Audit ===\n');
    console.log(
      `Total: ${summary.totalResources} | Implemented: ${summary.implementedCount} | Partial: ${summary.partialCount} | Missing: ${summary.missingCount}\n`,
    );
    console.log(renderTable(filteredResources));
    console.log('');
  }

  if (options.output) {
    writeFileSync(
      options.output,
      outputText || JSON.stringify(manifest, null, 2),
      'utf8',
    );
    console.log(`\nAudit ledger exported to: ${options.output}`);
  } else if (options.format === 'json' || options.format === 'markdown') {
    console.log(outputText);
  }

  return 0;
}
