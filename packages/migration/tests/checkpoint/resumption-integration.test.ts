import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { MigrationScope, ModuleExecutionResult } from '@ghec/contracts';
import { MigrationCheckpointManager } from '../../src/checkpoint/manager.js';

describe('Checkpoint Resumption State Detection & Module Skipping (US5)', () => {
  const scope: MigrationScope = {
    version: '1.0.0',
    name: 'wave-resumption-test',
    organizations: [{ source: 'src-org', target: 'tgt-org' }],
    repositories: [
      {
        sourceOrg: 'src-org',
        sourceRepo: 'large-repo',
        targetOrg: 'tgt-org',
        targetRepo: 'large-repo',
        useGei: true,
      },
    ],
  };

  it('detects completed stages and skips already finished modules on resumption', () => {
    const root = mkdtempSync(join(tmpdir(), 'ghec-checkpoint-resumption-'));
    try {
      const runId = 'wave-run-42';
      const manager = new MigrationCheckpointManager(runId, scope, {
        rootDirectory: root,
      });

      // 1. Mark gei stage completed
      manager.recordStageResult('large-repo', 'gei', {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });

      // 2. Mark releases-fallback strategy completed
      manager.recordStageResult('large-repo', 'specializedStrategies', {
        'releases-fallback': {
          status: 'completed',
          completedAt: new Date().toISOString(),
        },
      });

      // 3. Mark 'teams' module execution completed
      const teamsResult: ModuleExecutionResult = {
        schemaVersion: '1.0.0',
        moduleId: 'teams',
        status: 'complete',
        durationMs: 150,
        results: [],
      };
      manager.recordModuleResult('large-repo', 'teams', teamsResult);

      // 4. Re-instantiate checkpoint manager using static resume to simulate resume dispatch
      const resumedManager = MigrationCheckpointManager.resume(
        manager.getCheckpointDirectory(),
      );
      assert.ok(
        resumedManager,
        'Should successfully load existing checkpoint run',
      );

      // 5. Assert completed stages are detected
      const geiCompleted = resumedManager.isStageCompleted('large-repo', 'gei');
      assert.equal(
        geiCompleted,
        true,
        'gei stage should be detected as completed',
      );

      const teamsCompleted = resumedManager.isModuleCompleted(
        'large-repo',
        'teams',
      );
      assert.equal(
        teamsCompleted,
        true,
        'teams module should be detected as completed',
      );

      // 6. Incomplete downstream module (rulesets) must be detected as incomplete
      const rulesetsCompleted = resumedManager.isModuleCompleted(
        'large-repo',
        'rulesets',
      );
      assert.equal(
        rulesetsCompleted,
        false,
        'rulesets module should evaluate as incomplete',
      );

      // 7. Resumption filtering: Determine which modules need execution
      const modulesToRun = ['teams', 'rulesets', 'webhooks'];
      const pendingModules = modulesToRun.filter(
        (mod) => !resumedManager.isModuleCompleted('large-repo', mod),
      );

      assert.deepEqual(pendingModules, ['rulesets', 'webhooks']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
