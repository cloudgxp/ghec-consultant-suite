import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import {
  ModuleExecutionResultSchema,
  type MigrationScope,
  type ModuleExecutionResult,
} from '@ghec/contracts';
import {
  createManifest,
  createRepositoryCheckpoint,
  MANIFEST_FILE_NAME,
} from './manifest.js';
import type {
  CheckpointStage,
  MigrationCheckpointManifest,
  RepositoryCheckpoint,
  TerminalStageCheckpoint,
} from './types.js';

const CHECKPOINT_PREFIX = '.checkpoint-';

export interface MigrationCheckpointManagerOptions {
  rootDirectory?: string;
  now?: () => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCheckpointManifest(
  value: unknown,
): value is MigrationCheckpointManifest {
  return (
    isRecord(value) &&
    isNonEmptyString(value.runId) &&
    isNonEmptyString(value.startedAt) &&
    isNonEmptyString(value.updatedAt) &&
    isRecord(value.scope) &&
    isRecord(value.repositories)
  );
}

function isStatus(
  value: unknown,
  statuses: readonly string[],
): value is string {
  return typeof value === 'string' && statuses.includes(value);
}

function terminalStage(result: unknown): TerminalStageCheckpoint {
  if (
    !isRecord(result) ||
    !isStatus(result.status, ['completed', 'failed', 'skipped'])
  ) {
    throw new Error(
      'Terminal checkpoint results need a completed, failed, or skipped status.',
    );
  }
  if (result.error !== undefined && typeof result.error !== 'string') {
    throw new Error('Checkpoint errors must be strings.');
  }
  return result.error === undefined
    ? { status: result.status as TerminalStageCheckpoint['status'] }
    : {
        status: result.status as TerminalStageCheckpoint['status'],
        error: result.error,
      };
}

/** Writes JSON via a same-directory temporary file, then atomically renames it. */
export function writeAtomicJson(filePath: string, data: unknown): void {
  const directory = dirname(filePath);
  if (!existsSync(directory))
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = join(
    directory,
    `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    renameSync(temporaryPath, filePath);
    try {
      chmodSync(filePath, 0o600);
    } catch {
      // File modes are not supported by every filesystem.
    }
  } finally {
    if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
  }
}

/**
 * Persists per-repository migration state under
 * `<rootDirectory>/.checkpoint-<runId>/manifest.json`.
 */
export class MigrationCheckpointManager {
  private readonly checkpointDirectory: string;
  private readonly now: () => string;
  private manifest: MigrationCheckpointManifest;

  constructor(
    runId: string,
    scope: MigrationScope,
    options: MigrationCheckpointManagerOptions = {},
  ) {
    if (!isNonEmptyString(runId))
      throw new Error('Checkpoint runId is required.');
    const rootDirectory = resolve(options.rootDirectory ?? './migrations');
    this.checkpointDirectory = join(
      rootDirectory,
      `${CHECKPOINT_PREFIX}${runId}`,
    );
    this.now = options.now ?? (() => new Date().toISOString());
    const manifestPath = this.manifestPath();
    this.manifest = existsSync(manifestPath)
      ? this.readManifest(manifestPath)
      : createManifest(runId, scope, this.now());
    if (!existsSync(manifestPath)) this.saveManifest();
  }

  static resume(
    checkpointDirectory: string,
    options: Pick<MigrationCheckpointManagerOptions, 'now'> = {},
  ): MigrationCheckpointManager {
    const manifestPath = join(resolve(checkpointDirectory), MANIFEST_FILE_NAME);
    if (!existsSync(manifestPath)) {
      throw new Error(`Checkpoint manifest not found: ${manifestPath}`);
    }
    const manifest = MigrationCheckpointManager.readManifestAt(manifestPath);
    return new MigrationCheckpointManager(manifest.runId, manifest.scope, {
      rootDirectory: dirname(resolve(checkpointDirectory)),
      ...(options.now ? { now: options.now } : {}),
    });
  }

  static locate(
    searchDirectories: string | readonly string[],
    runIdOrLatest = 'latest',
  ): string {
    const directories = (
      Array.isArray(searchDirectories) ? searchDirectories : [searchDirectories]
    ).map((directory) => resolve(directory));
    if (runIdOrLatest !== 'latest') {
      const name = runIdOrLatest.startsWith(CHECKPOINT_PREFIX)
        ? runIdOrLatest
        : `${CHECKPOINT_PREFIX}${runIdOrLatest}`;
      for (const directory of directories) {
        const candidate = join(directory, name);
        if (existsSync(join(candidate, MANIFEST_FILE_NAME))) return candidate;
      }
      throw new Error(
        `Checkpoint ${JSON.stringify(runIdOrLatest)} was not found.`,
      );
    }

    const candidates: Array<{
      directory: string;
      mtimeMs: number;
      updatedAtMs: number;
    }> = [];
    for (const directory of directories) {
      if (!existsSync(directory)) continue;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.startsWith(CHECKPOINT_PREFIX))
          continue;
        const candidate = join(directory, entry.name);
        const manifestPath = join(candidate, MANIFEST_FILE_NAME);
        if (existsSync(manifestPath)) {
          const manifest =
            MigrationCheckpointManager.readManifestAt(manifestPath);
          const updatedAtMs = Date.parse(manifest.updatedAt);
          candidates.push({
            directory: candidate,
            mtimeMs: statSync(manifestPath).mtimeMs,
            updatedAtMs: Number.isNaN(updatedAtMs) ? 0 : updatedAtMs,
          });
        }
      }
    }
    candidates.sort(
      (left, right) =>
        right.updatedAtMs - left.updatedAtMs ||
        right.mtimeMs - left.mtimeMs ||
        right.directory.localeCompare(left.directory),
    );
    if (!candidates[0]) throw new Error('No migration checkpoints were found.');
    return candidates[0].directory;
  }

  getCheckpointDirectory(): string {
    return this.checkpointDirectory;
  }

  getManifest(): MigrationCheckpointManifest {
    return structuredClone(this.manifest);
  }

  isRepositoryCompleted(repositoryName: string): boolean {
    return this.isStageCompleted(repositoryName, 'verification');
  }

  isStageCompleted(repositoryName: string, stage: string): boolean {
    const repository = this.manifest.repositories[repositoryName];
    if (!repository) return false;
    switch (stage as CheckpointStage) {
      case 'preflight':
        return repository.preflight.status === 'evaluated';
      case 'targetPrep':
        return repository.targetPrep.status === 'completed';
      case 'gei':
        return repository.gei.status === 'completed';
      case 'specializedStrategies': {
        const values = Object.values(repository.specializedStrategies);
        return (
          values.length > 0 &&
          values.every(
            (result) =>
              result?.status === 'completed' || result?.status === 'skipped',
          )
        );
      }
      case 'apiModules': {
        const values = Object.values(repository.apiModules);
        return (
          values.length > 0 &&
          values.every(
            (result) =>
              result.status === 'completed' || result.status === 'skipped',
          )
        );
      }
      case 'postMigration': {
        const values = Object.values(repository.postMigration);
        return (
          values.length > 0 &&
          values.every(
            (result) =>
              result?.status === 'completed' || result?.status === 'skipped',
          )
        );
      }
      case 'verification':
        return repository.verification.status === 'passed';
      default:
        return false;
    }
  }

  isModuleCompleted(repositoryName: string, moduleId: string): boolean {
    const status =
      this.manifest.repositories[repositoryName]?.apiModules[moduleId]?.status;
    return status === 'completed' || status === 'skipped';
  }

  recordStageResult(
    repositoryName: string,
    stage: string,
    result: unknown,
  ): void {
    const repository = this.repository(repositoryName);
    switch (stage as CheckpointStage) {
      case 'preflight':
        repository.preflight = this.preflightResult(result);
        break;
      case 'targetPrep':
        repository.targetPrep = this.targetPrepResult(result);
        break;
      case 'gei':
        repository.gei = this.geiResult(result);
        break;
      case 'specializedStrategies':
        repository.specializedStrategies = this.terminalRecord(result, [
          'git-lfs',
          'releases-fallback',
        ]);
        break;
      case 'apiModules':
        repository.apiModules = this.terminalRecord(result);
        break;
      case 'postMigration':
        repository.postMigration = this.terminalRecord(result, [
          'repo-visibility',
          'webhooks',
          'mannequins',
          'codeowners',
          'security',
        ]);
        break;
      case 'verification':
        repository.verification = this.verificationResult(result);
        break;
      default:
        throw new Error(`Unsupported checkpoint stage: ${stage}`);
    }
    this.saveManifest();
  }

  recordModuleResult(
    repositoryName: string,
    moduleId: string,
    result: ModuleExecutionResult,
  ): void {
    const execution = ModuleExecutionResultSchema.parse(result);
    if (execution.moduleId !== moduleId) {
      throw new Error(
        'Module result moduleId does not match the recorded moduleId.',
      );
    }
    const failedResult = execution.results.find(
      (operation) => operation.status === 'failed',
    );
    const status =
      execution.status === 'complete'
        ? 'completed'
        : execution.status === 'skipped'
          ? 'skipped'
          : 'failed';
    this.repository(repositoryName).apiModules[moduleId] =
      status === 'failed'
        ? {
            status,
            error: failedResult?.error ?? 'Module execution did not complete.',
          }
        : { status };
    this.saveManifest();
  }

  cleanup(runId = this.manifest.runId): void {
    if (runId !== this.manifest.runId) {
      throw new Error(
        `Checkpoint runId mismatch: expected ${this.manifest.runId}.`,
      );
    }
    if (existsSync(this.checkpointDirectory)) {
      rmSync(this.checkpointDirectory, { recursive: true, force: true });
    }
  }

  private manifestPath(): string {
    return join(this.checkpointDirectory, MANIFEST_FILE_NAME);
  }

  private readManifest(manifestPath: string): MigrationCheckpointManifest {
    return MigrationCheckpointManager.readManifestAt(manifestPath);
  }

  private static readManifestAt(
    manifestPath: string,
  ): MigrationCheckpointManifest {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      throw new Error(`Checkpoint manifest is unreadable: ${manifestPath}`);
    }
    if (!isCheckpointManifest(parsed)) {
      throw new Error(
        `Checkpoint manifest has an invalid shape: ${manifestPath}`,
      );
    }
    return parsed;
  }

  private repository(repositoryName: string): RepositoryCheckpoint {
    if (!isNonEmptyString(repositoryName))
      throw new Error('Repository name is required.');
    return (this.manifest.repositories[repositoryName] ??=
      createRepositoryCheckpoint());
  }

  private saveManifest(): void {
    mkdirSync(this.checkpointDirectory, { recursive: true, mode: 0o700 });
    try {
      chmodSync(this.checkpointDirectory, 0o700);
    } catch {
      // Directory modes are not supported by every filesystem.
    }
    this.manifest.updatedAt = this.now();
    writeAtomicJson(this.manifestPath(), this.manifest);
  }

  private preflightResult(result: unknown): RepositoryCheckpoint['preflight'] {
    if (
      !isRecord(result) ||
      !isStatus(result.status, ['pending', 'evaluated', 'failed'])
    ) {
      throw new Error('Preflight checkpoint result has an invalid status.');
    }
    return result.assessment === undefined
      ? { status: result.status as RepositoryCheckpoint['preflight']['status'] }
      : {
          status: result.status as RepositoryCheckpoint['preflight']['status'],
          assessment: result.assessment,
        };
  }

  private targetPrepResult(
    result: unknown,
  ): RepositoryCheckpoint['targetPrep'] {
    if (
      !isRecord(result) ||
      !isStatus(result.status, ['pending', 'completed', 'failed'])
    ) {
      throw new Error(
        'Target preparation checkpoint result has an invalid status.',
      );
    }
    if (result.error !== undefined && typeof result.error !== 'string') {
      throw new Error('Target preparation errors must be strings.');
    }
    return result.error === undefined
      ? {
          status: result.status as RepositoryCheckpoint['targetPrep']['status'],
        }
      : {
          status: result.status as RepositoryCheckpoint['targetPrep']['status'],
          error: result.error,
        };
  }

  private geiResult(result: unknown): RepositoryCheckpoint['gei'] {
    if (
      !isRecord(result) ||
      !isStatus(result.status, [
        'pending',
        'in-progress',
        'completed',
        'failed',
      ])
    ) {
      throw new Error('GEI checkpoint result has an invalid status.');
    }
    for (const key of ['migrationId', 'error'] as const) {
      if (result[key] !== undefined && typeof result[key] !== 'string') {
        throw new Error(`GEI ${key} must be a string.`);
      }
    }
    if (
      result.skippedReleases !== undefined &&
      typeof result.skippedReleases !== 'boolean'
    ) {
      throw new Error('GEI skippedReleases must be a boolean.');
    }
    return {
      status: result.status as RepositoryCheckpoint['gei']['status'],
      ...(typeof result.migrationId === 'string'
        ? { migrationId: result.migrationId }
        : {}),
      ...(typeof result.skippedReleases === 'boolean'
        ? { skippedReleases: result.skippedReleases }
        : {}),
      ...(typeof result.error === 'string' ? { error: result.error } : {}),
    };
  }

  private verificationResult(
    result: unknown,
  ): RepositoryCheckpoint['verification'] {
    if (
      !isRecord(result) ||
      !isStatus(result.status, ['pending', 'passed', 'failed'])
    ) {
      throw new Error('Verification checkpoint result has an invalid status.');
    }
    if (
      result.reportUri !== undefined &&
      typeof result.reportUri !== 'string'
    ) {
      throw new Error('Verification reportUri must be a string.');
    }
    return typeof result.reportUri === 'string'
      ? {
          status:
            result.status as RepositoryCheckpoint['verification']['status'],
          reportUri: result.reportUri,
        }
      : {
          status:
            result.status as RepositoryCheckpoint['verification']['status'],
        };
  }

  private terminalRecord(
    result: unknown,
    allowedIds?: readonly string[],
  ): Record<string, TerminalStageCheckpoint> {
    if (!isRecord(result))
      throw new Error('Checkpoint stage result must be a record.');
    const output: Record<string, TerminalStageCheckpoint> = {};
    for (const [id, stageResult] of Object.entries(result)) {
      if (allowedIds && !allowedIds.includes(id)) {
        throw new Error(`Unsupported checkpoint item: ${id}`);
      }
      output[id] = terminalStage(stageResult);
    }
    return output;
  }
}
