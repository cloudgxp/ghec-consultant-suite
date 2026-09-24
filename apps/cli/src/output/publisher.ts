import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { validateBundle, type DiscoveryBundle } from '@ghec/contracts';

export interface PublishOptions {
  outputPath: string;
  scopeKind: 'organization' | 'enterprise';
  scopeName: string;
  runId: string;
  startedAt: string;
}

export function generateBundleFilename(options: PublishOptions): string {
  if (options.outputPath.endsWith('.json')) {
    return resolve(options.outputPath);
  }
  const sanitizedScope = options.scopeName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const timestamp = options.startedAt
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .replace('Z', 'Z');
  const filename = `ghec-discovery-${options.scopeKind}-${sanitizedScope}-${timestamp}-${options.runId}.json`;
  return join(resolve(options.outputPath), filename);
}

export function publishBundle(
  bundle: DiscoveryBundle,
  options: PublishOptions,
): string {
  const validation = validateBundle(bundle);
  if (!validation.success) {
    throw new Error(`Bundle contract validation failed: ${validation.message}`);
  }

  const finalPath = generateBundleFilename(options);
  const targetDir = dirname(finalPath);

  mkdirSync(targetDir, { recursive: true, mode: 0o700 });

  if (existsSync(finalPath)) {
    throw new Error(
      `Output file collision: ${finalPath} already exists. Implicit overwrite is forbidden.`,
    );
  }

  const tempPath = join(targetDir, `.${options.runId}.tmp`);
  const serialized = JSON.stringify(bundle, null, 2) + '\n';

  try {
    writeFileSync(tempPath, serialized, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    renameSync(tempPath, finalPath);
    return finalPath;
  } catch (err) {
    throw new Error(
      `Failed to publish bundle to ${finalPath}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}
