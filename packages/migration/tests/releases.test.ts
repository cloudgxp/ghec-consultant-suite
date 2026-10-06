import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LargeReleasesMigrationStrategy,
  RELEASE_ASSET_REST_LIMIT_BYTES,
  type CreateReleaseInput,
  type ReleaseAsset,
  type ReleaseTransport,
  type SourceRelease,
  type TargetRelease,
} from '../src/index.js';

function asset(name: string, size = 4): ReleaseAsset {
  return {
    id: 1,
    name,
    contentType: 'application/octet-stream',
    size,
    downloadUrl: `https://source/${name}`,
  };
}

function release(
  tagName: string,
  createdAt: string,
  assets: readonly ReleaseAsset[],
): SourceRelease {
  return {
    id: Number(tagName.slice(1)),
    tagName,
    targetCommitish: 'main',
    draft: false,
    prerelease: false,
    createdAt,
    assets,
  };
}

test('recreates releases oldest-first and streams assets without buffering', async () => {
  const source = [
    release('v2', '2026-10-02T00:00:00Z', [
      asset('large', RELEASE_ASSET_REST_LIMIT_BYTES + 1),
    ]),
    release('v1', '2026-10-01T00:00:00Z', [asset('small')]),
  ];
  const target: TargetRelease[] = [];
  const creationOrder: string[] = [];
  let downloaded: ReadableStream<Uint8Array> | undefined;
  const transport: ReleaseTransport = {
    listSourceReleases: async () => source,
    listTargetReleases: async () => target,
    createTargetRelease: async (input: CreateReleaseInput) => {
      creationOrder.push(input.tagName);
      const value = {
        id: target.length + 10,
        tagName: input.tagName,
        assets: [],
      };
      target.push(value);
      return value;
    },
    downloadAsset: async () => {
      downloaded = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });
      return downloaded;
    },
    uploadAsset: async (releaseId, sourceAsset, body) => {
      assert.equal(body, downloaded);
      const destination = target.find((item) => item.id === releaseId);
      assert.ok(destination);
      (destination.assets as Array<{ name: string; size: number }>).push({
        name: sourceAsset.name,
        size: sourceAsset.size,
      });
    },
  };
  const result = await new LargeReleasesMigrationStrategy(transport).execute({
    geiSkippedReleases: true,
    signal: new AbortController().signal,
  });
  assert.deepEqual(creationOrder, ['v1', 'v2']);
  assert.equal(result.metrics.releasesRecreated, 2);
  assert.equal(result.metrics.assetsTransferred, 1);
  assert.equal(result.metrics.bytesStreamed, 4);
  assert.match(result.warnings[0] ?? '', /2 GiB REST upload limit/);
});

test('requires a GEI run that deliberately skipped releases', async () => {
  const transport = {
    listSourceReleases: async () => [],
    listTargetReleases: async () => [],
    createTargetRelease: async () => ({ id: 1, tagName: 'v1', assets: [] }),
    downloadAsset: async () => new ReadableStream<Uint8Array>(),
    uploadAsset: async () => undefined,
  } satisfies ReleaseTransport;
  await assert.rejects(
    () =>
      new LargeReleasesMigrationStrategy(transport).execute({
        geiSkippedReleases: false,
        signal: new AbortController().signal,
      }),
    /only when GEI used --skip-releases/,
  );
});

test('LargeReleasesMigrationStrategy execute with dryRun: true calculates diff metrics and calls neither recreate nor uploadAsset', async () => {
  const source = [
    release('v2', '2026-10-02T00:00:00Z', [
      asset('large', RELEASE_ASSET_REST_LIMIT_BYTES + 100),
      asset('bundle.zip', 2048),
    ]),
    release('v1', '2026-10-01T00:00:00Z', [asset('installer.pkg', 1024)]),
  ];
  // Target already has v1 with installer.pkg, but missing v2
  const target: TargetRelease[] = [
    {
      id: 10,
      tagName: 'v1',
      assets: [{ name: 'installer.pkg', size: 1024 }],
    },
  ];

  let createCalled = false;
  let uploadCalled = false;
  let downloadCalled = false;

  const transport: ReleaseTransport = {
    listSourceReleases: async () => source,
    listTargetReleases: async () => target,
    createTargetRelease: async () => {
      createCalled = true;
      throw new Error(
        'createTargetRelease should not be called in dryRun mode',
      );
    },
    downloadAsset: async () => {
      downloadCalled = true;
      throw new Error('downloadAsset should not be called in dryRun mode');
    },
    uploadAsset: async () => {
      uploadCalled = true;
      throw new Error('uploadAsset should not be called in dryRun mode');
    },
  };

  const strategy = new LargeReleasesMigrationStrategy(transport);
  const result = await strategy.execute({
    geiSkippedReleases: true,
    dryRun: true,
    signal: new AbortController().signal,
  });

  assert.equal(result.status, 'completed');
  assert.equal(createCalled, false);
  assert.equal(downloadCalled, false);
  assert.equal(uploadCalled, false);
  // v2 was missing, so 1 release recreated
  assert.equal(result.metrics.releasesRecreated, 1);
  // bundle.zip was eligible (2048 bytes), large exceeded limit
  assert.equal(result.metrics.assetsTransferred, 1);
  assert.equal(result.metrics.bytesStreamed, 2048);
  // warning for large asset exceeding 2 GiB
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0] ?? '', /exceeds the 2 GiB REST upload limit/);
});
