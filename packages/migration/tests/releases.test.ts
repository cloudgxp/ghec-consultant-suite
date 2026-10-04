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
