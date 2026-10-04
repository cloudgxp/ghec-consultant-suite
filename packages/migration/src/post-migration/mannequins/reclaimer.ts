import * as fs from 'node:fs/promises';
import { runGeiCommand } from '../../gei/executor.js';
import type { GeiCommandRunner } from '../../gei/types.js';
import type { IdentityMappingEngine } from '../../modules/teams/identity-mapper.js';
import { parseMannequinCsv } from './csv-generator.js';
import type { MannequinRecord } from './types.js';

export interface ExportMannequinInventoryOptions {
  targetOrg: string;
  outputPath: string;
  geiRunner?: GeiCommandRunner | undefined;
  token?: string | undefined;
  signal?: AbortSignal | undefined;
}

export interface ExecuteMannequinReclamationOptions {
  targetOrg: string;
  csvPath: string;
  isEmu?: boolean | undefined;
  geiRunner?: GeiCommandRunner | undefined;
  token?: string | undefined;
  dryRun?: boolean | undefined;
  signal?: AbortSignal | undefined;
}

export interface AppliedIdentityMappingsResult {
  mappedRecords: MannequinRecord[];
  unmappedUsers: string[];
  warnings: string[];
}

/**
 * Spawns `gh gei generate-mannequin-csv` and parses the generated CSV into structured records.
 */
export async function exportMannequinInventory(
  options: ExportMannequinInventoryOptions,
): Promise<MannequinRecord[]> {
  const runner = options.geiRunner ?? runGeiCommand;

  const args = [
    'gei',
    'generate-mannequin-csv',
    '--github-target-org',
    options.targetOrg,
    '--output',
    options.outputPath,
  ];

  const env: Record<string, string> = {};
  if (options.token) {
    env.GH_PAT = options.token;
  }

  const result = await runner('gh', args, {
    environment: env,
    ...(options.signal ? { signal: options.signal } : {}),
    secrets: options.token ? [options.token] : [],
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to generate mannequin CSV for org '${options.targetOrg}' (exit code ${result.exitCode}): ${result.stderr || result.stdout}`,
    );
  }

  const csvContent = await fs.readFile(options.outputPath, 'utf8');
  return parseMannequinCsv(csvContent);
}

/**
 * Applies identity mapping transformations to resolve target EMU logins for mannequin records.
 */
export function applyIdentityMappings(
  records: readonly MannequinRecord[],
  mapper: IdentityMappingEngine,
): AppliedIdentityMappingsResult {
  const mappedRecords: MannequinRecord[] = [];
  const unmappedUsers: string[] = [];
  const warnings: string[] = [];

  for (const record of records) {
    // If targetUser is already provided, respect existing mapping
    if (record.targetUser && record.targetUser.trim().length > 0) {
      mappedRecords.push({
        ...record,
        status: record.status ?? 'completed',
      });
      continue;
    }

    const mapping = mapper.mapLogin(record.mannequinUser);

    if (mapping.status === 'unmapped') {
      unmappedUsers.push(record.mannequinUser);
      if (mapping.warning) {
        warnings.push(mapping.warning);
      } else {
        warnings.push(
          `No target EMU identity mapped for mannequin contributor '${record.mannequinUser}'`,
        );
      }

      mappedRecords.push({
        ...record,
        targetUser: undefined,
        status: 'unmapped',
      });
    } else {
      mappedRecords.push({
        ...record,
        targetUser: mapping.mappedLogin,
        status: 'completed',
      });
    }
  }

  return {
    mappedRecords,
    unmappedUsers,
    warnings,
  };
}

/**
 * Spawns `gh gei reclaim-mannequin` using the mapped CSV.
 * In EMU environments, passes `--skip-invitation` to immediately reattribute historical activity.
 */
export async function executeMannequinReclamation(
  options: ExecuteMannequinReclamationOptions,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  if (options.dryRun) {
    return {
      exitCode: 0,
      stdout: `DRY_RUN: Simulated gh gei reclaim-mannequin for org '${options.targetOrg}' with CSV '${options.csvPath}' (isEmu: ${options.isEmu !== false})`,
      stderr: '',
    };
  }

  const runner = options.geiRunner ?? runGeiCommand;

  const args = [
    'gei',
    'reclaim-mannequin',
    '--github-target-org',
    options.targetOrg,
    '--csv',
    options.csvPath,
  ];

  // In GHEC-EMU, skip-invitation is supported and recommended for immediate attribution
  if (options.isEmu !== false) {
    args.push('--skip-invitation');
  }

  const env: Record<string, string> = {};
  if (options.token) {
    env.GH_PAT = options.token;
  }

  const result = await runner('gh', args, {
    environment: env,
    ...(options.signal ? { signal: options.signal } : {}),
    secrets: options.token ? [options.token] : [],
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to reclaim mannequins for org '${options.targetOrg}' (exit code ${result.exitCode}): ${result.stderr || result.stdout}`,
    );
  }

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
