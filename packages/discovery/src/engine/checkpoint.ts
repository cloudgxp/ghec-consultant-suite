import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  readdirSync,
  statSync,
  chmodSync,
} from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import type {
  Entity,
  CollectorExecution,
  DiscoveryBundle,
} from '@ghec/contracts';

export interface CheckpointManifest {
  runId: string;
  startedAt: string;
  targetScope: {
    kind: 'organization' | 'enterprise';
    name: string;
  };
  modules: string[];
  completedModules: Record<string, string[]>;
  organizations: Array<{
    id: string;
    login: string;
    displayName?: string | null | undefined;
  }>;
  inaccessibleOrganizations?: string[] | undefined;
  salt?: string | undefined;
  saltDigest?: string | undefined;
}

export function writeAtomicJson(filePath: string, data: unknown): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const tempPath = join(
    dir,
    `.${basename(filePath)}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
  );
  const content = JSON.stringify(data, null, 2);
  writeFileSync(tempPath, content, { encoding: 'utf8', mode: 0o600 });
  renameSync(tempPath, filePath);
}

export interface CheckpointManagerOptions {
  noCreate?: boolean | undefined;
}

export class CheckpointManager {
  private readonly checkpointDir: string;
  private manifest: CheckpointManifest;

  constructor(
    checkpointDir: string,
    initialManifest?: Partial<CheckpointManifest> | undefined,
    options?: CheckpointManagerOptions,
  ) {
    this.checkpointDir = resolve(checkpointDir);

    const manifestPath = join(this.checkpointDir, 'manifest.json');
    if (initialManifest && !existsSync(manifestPath)) {
      this.manifest = {
        runId:
          initialManifest.runId ??
          basename(this.checkpointDir).replace(/^\.checkpoint-/, ''),
        startedAt: initialManifest.startedAt ?? new Date().toISOString(),
        targetScope: initialManifest.targetScope ?? {
          kind: 'organization',
          name: 'unknown',
        },
        modules: initialManifest.modules ?? [],
        completedModules: initialManifest.completedModules ?? {},
        organizations: initialManifest.organizations ?? [],
        ...(initialManifest.inaccessibleOrganizations !== undefined
          ? {
              inaccessibleOrganizations:
                initialManifest.inaccessibleOrganizations,
            }
          : {}),
        ...(initialManifest.salt !== undefined
          ? { salt: initialManifest.salt }
          : {}),
        ...(initialManifest.saltDigest !== undefined
          ? { saltDigest: initialManifest.saltDigest }
          : {}),
      };
      if (!options?.noCreate) {
        this.saveManifest();
      }
    } else {
      this.manifest = this.loadManifest();
    }
  }

  private ensureDir(): void {
    if (!existsSync(this.checkpointDir)) {
      mkdirSync(this.checkpointDir, { recursive: true, mode: 0o700 });
    }
    try {
      chmodSync(this.checkpointDir, 0o700);
    } catch {
      // Ignored if unsupported on non-posix systems
    }
  }

  getCheckpointDir(): string {
    return this.checkpointDir;
  }

  getManifest(): CheckpointManifest {
    return this.manifest;
  }

  loadManifest(): CheckpointManifest {
    const manifestPath = join(this.checkpointDir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      throw new Error(`Checkpoint manifest not found: ${manifestPath}`);
    }
    const raw = readFileSync(manifestPath, 'utf8');
    this.manifest = JSON.parse(raw) as CheckpointManifest;
    return this.manifest;
  }

  saveManifest(): void {
    this.ensureDir();
    const manifestPath = join(this.checkpointDir, 'manifest.json');
    writeAtomicJson(manifestPath, this.manifest);
  }

  isModuleCompleted(orgId: string, moduleId: string): boolean {
    return Boolean(this.manifest.completedModules[orgId]?.includes(moduleId));
  }

  saveModuleResults(
    orgId: string,
    moduleId: string,
    entities: readonly Entity[],
    execution: CollectorExecution,
    orgRecord?: DiscoveryBundle['organizations'][number] | undefined,
  ): void {
    // 1. Atomically save module entities
    const entitiesPath = join(
      this.checkpointDir,
      `entities-${orgId}-${moduleId}.json`,
    );
    writeAtomicJson(entitiesPath, entities);

    // 2. Atomically update organization executions
    const execPath = join(this.checkpointDir, `executions-${orgId}.json`);
    let executions: CollectorExecution[] = [];
    if (existsSync(execPath)) {
      try {
        executions = JSON.parse(readFileSync(execPath, 'utf8'));
      } catch {
        executions = [];
      }
    }
    const updatedExecutions = executions.filter((e) => e.module !== moduleId);
    updatedExecutions.push(execution);
    writeAtomicJson(execPath, updatedExecutions);

    // 3. Update manifest completed modules
    if (!this.manifest.completedModules[orgId]) {
      this.manifest.completedModules[orgId] = [];
    }
    if (!this.manifest.completedModules[orgId]!.includes(moduleId)) {
      this.manifest.completedModules[orgId]!.push(moduleId);
    }

    // 4. Update organization node if provided
    if (orgRecord) {
      if (!this.manifest.organizations.some((o) => o.id === orgRecord.id)) {
        this.manifest.organizations.push({
          id: orgRecord.id,
          login: orgRecord.login,
          displayName: orgRecord.displayName,
        });
      }
    }

    this.saveManifest();
  }

  saveInaccessibleOrganization(orgId: string): void {
    if (!this.manifest.inaccessibleOrganizations) {
      this.manifest.inaccessibleOrganizations = [];
    }
    if (!this.manifest.inaccessibleOrganizations.includes(orgId)) {
      this.manifest.inaccessibleOrganizations.push(orgId);
      this.saveManifest();
    }
  }

  loadEntities(orgId: string, moduleId: string): Entity[] {
    const entitiesPath = join(
      this.checkpointDir,
      `entities-${orgId}-${moduleId}.json`,
    );
    if (!existsSync(entitiesPath)) {
      return [];
    }
    try {
      const raw = readFileSync(entitiesPath, 'utf8');
      return JSON.parse(raw) as Entity[];
    } catch {
      return [];
    }
  }

  loadExecutions(orgId: string): CollectorExecution[] {
    const execPath = join(this.checkpointDir, `executions-${orgId}.json`);
    if (!existsSync(execPath)) {
      return [];
    }
    try {
      const raw = readFileSync(execPath, 'utf8');
      return JSON.parse(raw) as CollectorExecution[];
    } catch {
      return [];
    }
  }

  loadExecution(
    orgId: string,
    moduleId: string,
  ): CollectorExecution | undefined {
    const execs = this.loadExecutions(orgId);
    return execs.find((e) => e.module === moduleId);
  }

  loadOrganization(
    orgId: string,
  ): DiscoveryBundle['organizations'][number] | undefined {
    const found = this.manifest.organizations.find((o) => o.id === orgId);
    if (!found) return undefined;
    return {
      id: found.id,
      login: found.login,
      displayName: found.displayName ?? null,
    };
  }

  saveRepositoryPolicies(orgId: string, policies: readonly unknown[]): void {
    this.ensureDir();
    const policiesPath = join(this.checkpointDir, `policies-${orgId}.json`);
    writeAtomicJson(policiesPath, policies);
  }

  loadRepositoryPolicies<T = unknown>(orgId: string): T[] {
    const policiesPath = join(this.checkpointDir, `policies-${orgId}.json`);
    if (!existsSync(policiesPath)) {
      return [];
    }
    try {
      const raw = readFileSync(policiesPath, 'utf8');
      return JSON.parse(raw) as T[];
    } catch {
      return [];
    }
  }

  cleanup(): void {
    if (existsSync(this.checkpointDir)) {
      rmSync(this.checkpointDir, { recursive: true, force: true });
    }
  }

  static findLatest(searchDirs: string | string[]): string | null {
    const dirs = (Array.isArray(searchDirs) ? searchDirs : [searchDirs]).map(
      (d) => resolve(d),
    );
    const checkpointDirs: Array<{ path: string; mtime: number }> = [];

    for (const dir of dirs) {
      if (!existsSync(dir)) continue;
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('.checkpoint-')) {
            const fullPath = join(dir, entry.name);
            const manifestPath = join(fullPath, 'manifest.json');
            if (existsSync(manifestPath)) {
              const stat = statSync(manifestPath);
              checkpointDirs.push({ path: fullPath, mtime: stat.mtimeMs });
            }
          }
        }
      } catch {
        // Ignored
      }
    }

    if (checkpointDirs.length === 0) {
      return null;
    }

    checkpointDirs.sort((a, b) => b.mtime - a.mtime);
    return checkpointDirs[0]!.path;
  }

  static locate(
    searchDirs: string | string[],
    checkpointId?: string | undefined,
  ): string {
    const dirs = (Array.isArray(searchDirs) ? searchDirs : [searchDirs]).map(
      (d) => resolve(d),
    );

    if (!checkpointId || checkpointId === 'latest') {
      const latest = CheckpointManager.findLatest(dirs);
      if (!latest) {
        throw new Error(
          `No existing checkpoint found in directories: ${dirs.join(', ')}.`,
        );
      }
      return latest;
    }

    if (existsSync(checkpointId)) {
      return resolve(checkpointId);
    }

    const candidateName = checkpointId.startsWith('.checkpoint-')
      ? checkpointId
      : `.checkpoint-${checkpointId}`;

    for (const dir of dirs) {
      const candidatePath = join(dir, candidateName);
      if (existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    throw new Error(
      `Checkpoint "${checkpointId}" not found in directories: ${dirs.join(', ')}.`,
    );
  }
}
