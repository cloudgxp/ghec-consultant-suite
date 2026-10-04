import type {
  MigrationCheckpointManifest,
  RepositoryCheckpoint,
} from './types.js';

export const MANIFEST_FILE_NAME = 'manifest.json';

export function createRepositoryCheckpoint(): RepositoryCheckpoint {
  return {
    preflight: { status: 'pending' },
    targetPrep: { status: 'pending' },
    gei: { status: 'pending' },
    specializedStrategies: {},
    apiModules: {},
    postMigration: {},
    verification: { status: 'pending' },
  };
}

export function createManifest(
  runId: string,
  scope: MigrationCheckpointManifest['scope'],
  now = new Date().toISOString(),
): MigrationCheckpointManifest {
  const repositories: MigrationCheckpointManifest['repositories'] = {};
  for (const repository of scope.repositories) {
    repositories[`${repository.sourceOrg}/${repository.sourceRepo}`] =
      createRepositoryCheckpoint();
  }
  return { runId, startedAt: now, updatedAt: now, scope, repositories };
}
