import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { once } from 'node:events';
import { dirname, join, resolve } from 'node:path';
import {
  validateBundle,
  DiscoveryBundleSchema,
  type DiscoveryBundle,
  type PublishableBundle,
} from '@ghec/contracts';

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
    .replace(/Z$/i, '');
  const filename = `ghec-discovery-${options.scopeKind}-${sanitizedScope}-${timestamp}-${options.runId}.json`;
  return join(resolve(options.outputPath), filename);
}

export async function publishBundle(
  bundle: PublishableBundle,
  options: PublishOptions,
): Promise<string> {
  if (Array.isArray(bundle.entities) && bundle.entities.length <= 25000) {
    const validation = validateBundle(bundle as DiscoveryBundle);
    if (!validation.success) {
      const detailed = DiscoveryBundleSchema.safeParse(bundle);
      let details = '';
      if (!detailed.success) {
        details = `: ${detailed.error.issues.map((i) => `[${i.path.join('.') || 'root'}] ${i.message}`).join('; ')}`;
      }
      throw new Error(
        `Bundle contract validation failed: ${validation.message}${details}`,
      );
    }
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
  const writeStream = createWriteStream(tempPath, {
    flags: 'wx',
    mode: 0o600,
    encoding: 'utf8',
  });

  const writeChunk = async (chunk: string): Promise<void> => {
    if (!writeStream.write(chunk)) {
      await once(writeStream, 'drain');
    }
  };

  try {
    // 1. Root opening
    await writeChunk('{\n');

    // 2. Top-level metadata properties
    await writeChunk(
      `  "schemaVersion": ${JSON.stringify(bundle.schemaVersion)},\n`,
    );
    await writeChunk(`  "synthetic": ${JSON.stringify(bundle.synthetic)},\n`);
    await writeChunk(
      `  "scan": ${JSON.stringify(bundle.scan, null, 2).replace(/\n/g, '\n  ')},\n`,
    );
    await writeChunk(
      `  "configuration": ${JSON.stringify(bundle.configuration, null, 2).replace(/\n/g, '\n  ')},\n`,
    );
    await writeChunk(
      `  "scope": ${JSON.stringify(bundle.scope, null, 2).replace(/\n/g, '\n  ')},\n`,
    );
    await writeChunk(
      `  "organizations": ${JSON.stringify(bundle.organizations, null, 2).replace(/\n/g, '\n  ')},\n`,
    );
    await writeChunk(
      `  "collectors": ${JSON.stringify(bundle.collectors, null, 2).replace(/\n/g, '\n  ')},\n`,
    );

    // 3. Stream entities array element by element
    await writeChunk('  "entities": [\n');
    let firstEntity = true;
    for await (const entity of bundle.entities) {
      if (!firstEntity) {
        await writeChunk(',\n');
      }
      firstEntity = false;
      const serialized = JSON.stringify(entity, null, 2).replace(
        /\n/g,
        '\n    ',
      );
      await writeChunk(`    ${serialized}`);
    }
    await writeChunk('\n  ],\n');

    // 4. Remaining metadata
    await writeChunk(
      `  "findings": ${JSON.stringify(bundle.findings, null, 2).replace(/\n/g, '\n  ')},\n`,
    );
    await writeChunk(
      `  "limitations": ${JSON.stringify(bundle.limitations, null, 2).replace(/\n/g, '\n  ')},\n`,
    );
    await writeChunk(
      `  "errors": ${JSON.stringify(bundle.errors, null, 2).replace(/\n/g, '\n  ')},\n`,
    );
    await writeChunk(
      `  "summary": ${JSON.stringify(bundle.summary, null, 2).replace(/\n/g, '\n  ')}\n`,
    );

    // 5. Root closing
    await writeChunk('}\n');

    await new Promise<void>((res, rej) => {
      writeStream.on('error', rej);
      writeStream.on('finish', res);
      writeStream.end();
    });

    // 6. Atomic rename
    renameSync(tempPath, finalPath);
    return finalPath;
  } catch (err) {
    if (existsSync(tempPath)) {
      try {
        rmSync(tempPath, { force: true });
      } catch {
        // Ignored
      }
    }
    throw new Error(
      `Failed to publish bundle to ${finalPath}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}
