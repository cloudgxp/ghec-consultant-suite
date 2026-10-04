import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import type { GitHubReadAdapter } from '@ghec/github-client';
import {
  COMMIT_AUTHORSHIP_LIMITATION_NOTICE,
  createDefaultModuleRegistry,
  executeMannequinReclamation,
  exportMannequinInventory,
  IdentityMappingEngine,
  MannequinReclamationEngine,
  parseMannequinCsv,
  serializeMannequinCsv,
  type GeiCommandRunner,
  type MannequinRecord,
  type MigrationContext,
} from '../../src/index.js';

function createMockReadAdapter(): GitHubReadAdapter {
  return {
    rest: async () => ({ status: 200, headers: {}, data: [] }),
    paginate: async () => [],
    graphql: async () => ({}),
  };
}

describe('Mannequin Reclamation & Attribution Engine (Task 027)', () => {
  describe('parseMannequinCsv & serializeMannequinCsv', () => {
    it('parses standard GEI mannequin CSV output', () => {
      const csv = [
        'mannequin-user,mannequin-id,target-user',
        'monalisa,MDQ6VXNlcjE=,',
        'hubot,MDQ6VXNlcjI=,hubot_acme',
        'octocat,MDQ6VXNlcjM=,',
      ].join('\n');

      const records = parseMannequinCsv(csv);
      assert.equal(records.length, 3);
      assert.deepEqual(records[0], {
        mannequinUser: 'monalisa',
        mannequinId: 'MDQ6VXNlcjE=',
        status: 'pending',
      });
      assert.deepEqual(records[1], {
        mannequinUser: 'hubot',
        mannequinId: 'MDQ6VXNlcjI=',
        targetUser: 'hubot_acme',
        status: 'completed',
      });
    });

    it('handles quoted fields, whitespace, and alternate header casing', () => {
      const csv = [
        '"mannequin_user" , "mannequin_id" , "target_user"',
        '"dev-one, sr" , "ID-100" , ""',
        '"dev-two" , "ID-200" , "dev-two_corp"',
      ].join('\r\n');

      const records = parseMannequinCsv(csv);
      assert.equal(records.length, 2);
      assert.equal(records[0]?.mannequinUser, 'dev-one, sr');
      assert.equal(records[0]?.mannequinId, 'ID-100');
      assert.equal(records[1]?.targetUser, 'dev-two_corp');
    });

    it('throws on invalid header missing required columns', () => {
      const badCsv = 'username,user_id\nmonalisa,123';
      assert.throws(
        () => parseMannequinCsv(badCsv),
        /Invalid mannequin CSV header/,
      );
    });

    it('serializes records to RFC 4180 compliant CSV', () => {
      const records: MannequinRecord[] = [
        { mannequinUser: 'alice', mannequinId: 'ID1', targetUser: 'alice_emu' },
        { mannequinUser: 'bob, jr', mannequinId: 'ID2', targetUser: 'bob_emu' },
      ];

      const serialized = serializeMannequinCsv(records);
      assert.equal(
        serialized,
        'mannequin-user,mannequin-id,target-user\nalice,ID1,alice_emu\n"bob, jr",ID2,bob_emu',
      );
    });
  });

  describe('Identity Mapping & Command Execution', () => {
    it('translates mannequin users using suffix and dictionary mappings', async () => {
      const mapper = new IdentityMappingEngine({
        strategy: 'emu-saml',
        suffix: '_acme',
        mappings: {
          octocat: 'the-real-octocat_acme',
        },
      });

      const tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'mannequin-test-'),
      );
      const sampleCsv = path.join(tempDir, 'mannequins.csv');
      await fs.writeFile(
        sampleCsv,
        'mannequin-user,mannequin-id,target-user\nmonalisa,ID1,\noctocat,ID2,\n',
      );

      const executedCommands: Array<{ command: string; args: string[] }> = [];
      const mockRunner: GeiCommandRunner = async (command, args) => {
        executedCommands.push({ command, args: [...args] });
        return { exitCode: 0, stdout: 'Reclaimed 2 mannequins', stderr: '' };
      };

      const engine = new MannequinReclamationEngine({
        targetOrg: 'acme-dest',
        csvPath: sampleCsv,
        identityMapper: mapper,
        geiRunner: mockRunner,
        isEmu: true,
      });

      const report = await engine.reclaim();

      assert.equal(report.totalMannequins, 2);
      assert.equal(report.reclaimedCount, 2);
      assert.equal(report.unmappedCount, 0);
      assert.equal(report.records[0]?.targetUser, 'monalisa_acme');
      assert.equal(report.records[1]?.targetUser, 'the-real-octocat_acme');
      assert.match(report.limitationsNotice, /DEC-013/);

      // Verify command had --skip-invitation
      assert.equal(executedCommands.length, 1);
      assert.equal(executedCommands[0]?.command, 'gh');
      assert.ok(executedCommands[0]?.args.includes('--skip-invitation'));
      assert.ok(executedCommands[0]?.args.includes('--csv'));

      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('omits --skip-invitation in non-EMU environments and tracks invited status', async () => {
      const mapper = new IdentityMappingEngine({
        strategy: 'pass-through',
      });

      const tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'mannequin-test-'),
      );
      const sampleCsv = path.join(tempDir, 'mannequins.csv');
      await fs.writeFile(
        sampleCsv,
        'mannequin-user,mannequin-id,target-user\nalice,ID1,\n',
      );

      const executedCommands: Array<{ command: string; args: string[] }> = [];
      const mockRunner: GeiCommandRunner = async (command, args) => {
        executedCommands.push({ command, args: [...args] });
        return { exitCode: 0, stdout: 'Invitations sent', stderr: '' };
      };

      const engine = new MannequinReclamationEngine({
        targetOrg: 'standard-dest',
        csvPath: sampleCsv,
        identityMapper: mapper,
        geiRunner: mockRunner,
        isEmu: false,
      });

      const report = await engine.reclaim();
      assert.equal(report.invitedCount, 1);
      assert.equal(report.reclaimedCount, 0);

      assert.equal(executedCommands.length, 1);
      assert.ok(!executedCommands[0]?.args.includes('--skip-invitation'));

      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('flags unmapped contributors when manual strategy lacks explicit mapping', async () => {
      const mapper = new IdentityMappingEngine({
        strategy: 'manual',
        mappings: {
          knownUser: 'knownUser_emu',
        },
      });

      const tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'mannequin-test-'),
      );
      const sampleCsv = path.join(tempDir, 'mannequins.csv');
      await fs.writeFile(
        sampleCsv,
        'mannequin-user,mannequin-id,target-user\nknownUser,ID1,\nunknownUser,ID2,\n',
      );

      const engine = new MannequinReclamationEngine({
        targetOrg: 'acme-dest',
        csvPath: sampleCsv,
        identityMapper: mapper,
        geiRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
        isEmu: true,
      });

      const report = await engine.reclaim();
      assert.equal(report.reclaimedCount, 1);
      assert.equal(report.unmappedCount, 1);
      assert.deepEqual(report.unmappedUsers, ['unknownUser']);

      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('exportMannequinInventory and executeMannequinReclamation execute commands as expected', async () => {
      const tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'mannequin-export-'),
      );
      const exportPath = path.join(tempDir, 'exported.csv');

      const mockRunner: GeiCommandRunner = async (cmd, args) => {
        if (args.includes('generate-mannequin-csv')) {
          await fs.writeFile(
            exportPath,
            'mannequin-user,mannequin-id,target-user\nuser1,ID1,\n',
          );
          return { exitCode: 0, stdout: 'Generated', stderr: '' };
        }
        return { exitCode: 0, stdout: 'Reclaimed', stderr: '' };
      };

      const exported = await exportMannequinInventory({
        targetOrg: 'test-org',
        outputPath: exportPath,
        geiRunner: mockRunner,
        token: 'ghp_secret',
      });

      assert.equal(exported.length, 1);
      assert.equal(exported[0]?.mannequinUser, 'user1');

      const reclaimResult = await executeMannequinReclamation({
        targetOrg: 'test-org',
        csvPath: exportPath,
        isEmu: true,
        geiRunner: mockRunner,
      });

      assert.equal(reclaimResult.exitCode, 0);

      await fs.rm(tempDir, { recursive: true, force: true });
    });
  });

  describe('Full Module Lifecycle (discover, plan, apply, verify)', () => {
    it('registers in ModuleRegistry and executes 4-stage lifecycle', async () => {
      const registry = createDefaultModuleRegistry();
      assert.ok(registry.has('post-migration-mannequins'));

      const mod = registry.getOrThrow(
        'post-migration-mannequins',
      ) as MannequinReclamationEngine;
      assert.equal(mod.id, 'post-migration-mannequins');
      assert.equal(mod.scopeLevel, 'organization');

      const ctx: MigrationContext = {
        runId: 'test-run-1',
        scope: {
          level: 'organization',
          sourceOrg: 'src-org',
          targetOrg: 'dest-org',
        },
        sourceClient: createMockReadAdapter(),
        targetClient: createMockReadAdapter(),
        signal: new AbortController().signal,
        dryRun: false,
        continueOnError: true,
        logger: {
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
        },
      };

      // 1. Discover using cached data
      const discovered = await mod.discover(ctx, {
        records: [
          { mannequinUser: 'coder1', mannequinId: 'M1' },
          { mannequinUser: 'coder2', mannequinId: 'M2' },
        ],
      });
      assert.equal(discovered.records.length, 2);

      // 2. Plan
      const plan = await mod.plan(ctx, discovered);
      assert.equal(plan.moduleId, 'post-migration-mannequins');
      assert.equal(plan.operations.length, 2);
      assert.ok(
        plan.warnings.some((w) =>
          w.includes(COMMIT_AUTHORSHIP_LIMITATION_NOTICE),
        ),
      );

      // 3. Apply with mock runner
      const lifecycleRunner: GeiCommandRunner = async () => ({
        exitCode: 0,
        stdout: 'Success',
        stderr: '',
      });
      const engineWithRunner = new MannequinReclamationEngine({
        geiRunner: lifecycleRunner,
        targetOrg: 'dest-org',
      });

      const applyResult = await engineWithRunner.apply(ctx, plan);
      assert.equal(applyResult.status, 'complete');
      assert.equal(applyResult.results.length, 2);
      assert.ok(applyResult.results.every((r) => r.status === 'succeeded'));

      // 4. Verify
      const verifyResult = await mod.verify(ctx, plan);
      assert.equal(verifyResult.verified, true);
      assert.equal(verifyResult.discrepancies.length, 0);
    });

    it('reports discrepancies during verify when unmapped mannequins exist', async () => {
      const mod = new MannequinReclamationEngine();
      const ctx: MigrationContext = {
        runId: 'test-run-2',
        scope: {
          level: 'organization',
          sourceOrg: 'src-org',
          targetOrg: 'dest-org',
        },
        sourceClient: createMockReadAdapter(),
        targetClient: createMockReadAdapter(),
        signal: new AbortController().signal,
        dryRun: false,
        continueOnError: true,
        logger: {
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
        },
      };

      const plan = {
        moduleId: 'post-migration-mannequins',
        scopeLevel: 'organization' as const,
        targetIdentifier: 'dest-org',
        operations: [
          {
            id: 'op-warn-unmapped-ghost',
            resourceType: 'mannequin',
            resourceName: 'ghost-contributor',
            operation: 'warn' as const,
            reason: 'No matching user',
          },
        ],
        warnings: [],
      };

      const verifyResult = await mod.verify(ctx, plan);
      assert.equal(verifyResult.verified, false);
      assert.equal(verifyResult.discrepancies.length, 1);
      assert.equal(
        verifyResult.discrepancies[0]?.resourceName,
        'ghost-contributor',
      );
      assert.match(
        verifyResult.discrepancies[0]!.message,
        /could not be mapped/,
      );
    });
  });
});
