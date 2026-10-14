import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  assertScratchDiskSpace,
  checkScratchDiskSpace,
} from '../../../src/strategies/mirror-push/headroom.js';

describe('Scratch Disk Headroom Verification (DEC-004 & Scale Adaptation)', () => {
  it('calculates required bytes using 1.5x safety multiplier and returns sufficient on available disk', () => {
    const scratchDir = mkdtempSync(join(tmpdir(), 'headroom-test-'));
    try {
      const estimatedBytes = 100 * 1024 * 1024; // 100 MiB
      const result = checkScratchDiskSpace(scratchDir, estimatedBytes, 1.5);

      assert.equal(result.path, scratchDir);
      assert.equal(result.requiredBytes, 150 * 1024 * 1024);
      assert.ok(result.freeBytes > 0);
      assert.equal(result.sufficient, result.freeBytes >= result.requiredBytes);
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it('rejects execution and returns sufficient=false when required space exceeds available disk', () => {
    const scratchDir = mkdtempSync(join(tmpdir(), 'headroom-test-'));
    try {
      // 1000 Petabytes - guaranteed to exceed runner scratch disk
      const massiveEstimatedBytes = 1000 * 1024 * 1024 * 1024 * 1024 * 1024;
      const result = checkScratchDiskSpace(
        scratchDir,
        massiveEstimatedBytes,
        1.5,
      );

      assert.equal(result.sufficient, false);
      assert.ok(result.requiredBytes > result.freeBytes);

      assert.throws(
        () => assertScratchDiskSpace(scratchDir, massiveEstimatedBytes, 1.5),
        /Insufficient scratch disk space/,
      );
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });
});
