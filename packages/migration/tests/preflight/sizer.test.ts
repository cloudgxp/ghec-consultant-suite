import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGitSizerOutput,
  evaluateSizingLimits,
  formatBytes,
  PLATFORM_LIMITS,
} from '../../src/index.js';

describe('git-sizer parsing and sizing limits', () => {
  describe('formatBytes', () => {
    it('formats bytes, KiB, MiB, and GiB correctly', () => {
      assert.equal(formatBytes(500), '500 B');
      assert.equal(formatBytes(1024), '1.00 KiB');
      assert.equal(formatBytes(1048576), '1.00 MiB');
      assert.equal(formatBytes(1073741824), '1.00 GiB');
      assert.equal(formatBytes(40 * 1073741824), '40.00 GiB');
    });
  });

  describe('parseGitSizerOutput', () => {
    it('parses standard snake_case git-sizer JSON output', () => {
      const json = JSON.stringify({
        unique_blob_size: 5000000,
        max_commit_size: 15000,
        max_blob_size: 250000,
        max_ref_name_length: 45,
      });

      const stats = parseGitSizerOutput(json);
      assert.equal(stats.gitSizeBytes, 5000000);
      assert.equal(stats.largestCommitBytes, 15000);
      assert.equal(stats.largestBlobBytes, 250000);
      assert.equal(stats.longestRefLength, 45);
    });

    it('parses camelCase and alternative key naming in object format', () => {
      const input = {
        totalBlobSize: 10000000,
        maxCommitSize: 20000,
        maxBlobSize: 300000,
        longest_ref_length: 60,
      };

      const stats = parseGitSizerOutput(input);
      assert.equal(stats.gitSizeBytes, 10000000);
      assert.equal(stats.largestCommitBytes, 20000);
      assert.equal(stats.largestBlobBytes, 300000);
      assert.equal(stats.longestRefLength, 60);
    });

    it('defaults missing or negative fields safely to 0', () => {
      const stats = parseGitSizerOutput({});
      assert.equal(stats.gitSizeBytes, 0);
      assert.equal(stats.largestCommitBytes, 0);
      assert.equal(stats.largestBlobBytes, 0);
      assert.equal(stats.longestRefLength, 0);
    });

    it('throws descriptive error on malformed JSON string', () => {
      assert.throws(
        () => parseGitSizerOutput('invalid-json{['),
        /Failed to parse git-sizer output JSON/,
      );
    });
  });

  describe('evaluateSizingLimits', () => {
    it('passes repositories well within platform limits', () => {
      const stats = {
        gitSizeBytes: 1024 * 1024 * 500, // 500 MiB
        largestCommitBytes: 1024 * 1024 * 50, // 50 MiB
        largestBlobBytes: 1024 * 1024 * 80, // 80 MiB
        longestRefLength: 50,
      };

      const res = evaluateSizingLimits(stats);
      assert.equal(res.withinLimits, true);
      assert.equal(res.blockers.length, 0);
      assert.equal(res.warnings.length, 0);
    });

    it('blocks repositories exceeding the 40 GiB repository Git size limit', () => {
      const stats = {
        gitSizeBytes: PLATFORM_LIMITS.MAX_REPO_GIT_SIZE_BYTES + 1,
        largestCommitBytes: 1000,
        largestBlobBytes: 1000,
        longestRefLength: 20,
      };

      const res = evaluateSizingLimits(stats);
      assert.equal(res.withinLimits, false);
      assert.equal(res.blockers.length, 1);
      assert.match(res.blockers[0]!, /40 GiB/);
    });

    it('blocks repositories exceeding the 2 GiB commit size limit', () => {
      const stats = {
        gitSizeBytes: 1024 * 1024,
        largestCommitBytes: PLATFORM_LIMITS.MAX_COMMIT_SIZE_BYTES + 1,
        largestBlobBytes: 1000,
        longestRefLength: 20,
      };

      const res = evaluateSizingLimits(stats);
      assert.equal(res.withinLimits, false);
      assert.equal(res.blockers.length, 1);
      assert.match(res.blockers[0]!, /2 GiB/);
    });

    it('blocks repositories exceeding the 400 MiB migration file size limit', () => {
      const stats = {
        gitSizeBytes: 1024 * 1024 * 500,
        largestCommitBytes: 1000,
        largestBlobBytes: PLATFORM_LIMITS.MAX_MIGRATION_BLOB_SIZE_BYTES + 1,
        longestRefLength: 20,
      };

      const res = evaluateSizingLimits(stats);
      assert.equal(res.withinLimits, false);
      assert.equal(res.blockers.length, 1);
      assert.match(res.blockers[0]!, /400 MiB/);
    });

    it('warns when file is between 100 MiB and 400 MiB (allowed in GEI, needs LFS post-migration)', () => {
      const stats = {
        gitSizeBytes: 1024 * 1024 * 500,
        largestCommitBytes: 1000,
        largestBlobBytes: 250 * 1024 * 1024, // 250 MiB
        longestRefLength: 20,
      };

      const res = evaluateSizingLimits(stats);
      assert.equal(res.withinLimits, true);
      assert.equal(res.blockers.length, 0);
      assert.equal(res.warnings.length, 1);
      assert.match(res.warnings[0]!, /100 MiB/);
      assert.match(res.warnings[0]!, /Git LFS/);
    });

    it('blocks repositories with Git reference names exceeding 255 bytes', () => {
      const stats = {
        gitSizeBytes: 1024 * 1024,
        largestCommitBytes: 1000,
        largestBlobBytes: 1000,
        longestRefLength: 256,
      };

      const res = evaluateSizingLimits(stats);
      assert.equal(res.withinLimits, false);
      assert.equal(res.blockers.length, 1);
      assert.match(res.blockers[0]!, /255 bytes/);
    });
  });
});
