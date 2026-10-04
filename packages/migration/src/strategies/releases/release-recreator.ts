import type {
  CreateReleaseInput,
  SourceRelease,
  TargetRelease,
  ReleaseTransport,
} from './types.js';

function createInput(release: SourceRelease): CreateReleaseInput {
  return {
    tagName: release.tagName,
    targetCommitish: release.targetCommitish,
    ...(release.name !== undefined ? { name: release.name } : {}),
    ...(release.body !== undefined ? { body: release.body } : {}),
    draft: release.draft,
    prerelease: release.prerelease,
    ...(release.makeLatest ? { makeLatest: release.makeLatest } : {}),
  };
}

/** Recreates release metadata idempotently, ordered oldest to newest. */
export class ReleaseRecreator {
  constructor(private readonly transport: ReleaseTransport) {}

  async recreate(
    release: SourceRelease,
    signal: AbortSignal,
  ): Promise<{ release: TargetRelease; created: boolean }> {
    const existing = (await this.transport.listTargetReleases(signal)).find(
      (candidate) => candidate.tagName === release.tagName,
    );
    if (existing) return { release: existing, created: false };
    return {
      release: await this.transport.createTargetRelease(
        createInput(release),
        signal,
      ),
      created: true,
    };
  }
}
