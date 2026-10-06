import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTeamTree,
  filterTeamTree,
  predictEmuUsername,
  categorizeCollaboratorGrants,
  generateTeamTreeSvg,
  type RawTeamEntity,
} from '../src/lib/team-tree.js';

describe('Task 042 (DASH-27): Teams, Outside Collaborators & EMU Identity Visualizer', () => {
  const sampleTeams: RawTeamEntity[] = [
    {
      id: 'team-engineering',
      name: 'Engineering',
      parentTeamId: null,
      membershipCount: 20,
      privacy: 'closed',
      repositoryAccess: [{ repositoryId: 'repo-core', permission: 'admin' }],
    },
    {
      id: 'team-backend',
      name: 'Backend Services',
      parentTeamId: 'team-engineering',
      membershipCount: 12,
      privacy: 'closed',
      repositoryAccess: [{ repositoryId: 'repo-api', permission: 'write' }],
    },
    {
      id: 'team-core-infra',
      name: 'Core Infrastructure',
      parentTeamId: 'team-backend',
      membershipCount: 5,
      privacy: 'secret',
      repositoryAccess: [{ repositoryId: 'repo-infra', permission: 'admin' }],
    },
    {
      id: 'team-security',
      name: 'Security & Compliance',
      parentTeamId: null,
      membershipCount: 8,
      privacy: 'secret',
      repositoryAccess: [{ repositoryId: 'repo-audit', permission: 'read' }],
    },
  ];

  describe('buildTeamTree Hierarchy Builder', () => {
    it('constructs a nested directed tree and computes accurate depths and counts', () => {
      const roots = buildTeamTree(sampleTeams);

      assert.equal(roots.length, 2);

      const eng = roots.find((r) => r.id === 'team-engineering');
      assert.ok(eng);
      assert.equal(eng?.depth, 0);
      assert.equal(eng?.children.length, 1);
      assert.equal(eng?.totalDescendantCount, 2); // backend + core-infra
      assert.equal(eng?.totalMembersInSubtree, 37); // 20 + 12 + 5

      const backend = eng?.children[0];
      assert.ok(backend);
      assert.equal(backend?.id, 'team-backend');
      assert.equal(backend?.depth, 1);
      assert.equal(backend?.children.length, 1);
      assert.equal(backend?.totalDescendantCount, 1); // core-infra
      assert.equal(backend?.totalMembersInSubtree, 17); // 12 + 5

      const infra = backend?.children[0];
      assert.ok(infra);
      assert.equal(infra?.id, 'team-core-infra');
      assert.equal(infra?.depth, 2);
      assert.equal(infra?.children.length, 0);
      assert.equal(infra?.totalDescendantCount, 0);
      assert.equal(infra?.totalMembersInSubtree, 5);

      const sec = roots.find((r) => r.id === 'team-security');
      assert.ok(sec);
      assert.equal(sec?.depth, 0);
      assert.equal(sec?.children.length, 0);
      assert.equal(sec?.totalDescendantCount, 0);
    });

    it('treats teams with nonexistent parentTeamId as root nodes gracefully', () => {
      const orphanTeams: RawTeamEntity[] = [
        {
          id: 'team-orphan',
          name: 'Orphan Team',
          parentTeamId: 'nonexistent-parent',
          membershipCount: 3,
        },
      ];

      const roots = buildTeamTree(orphanTeams);
      assert.equal(roots.length, 1);
      assert.equal(roots[0]?.id, 'team-orphan');
      assert.equal(roots[0]?.depth, 0);
    });
  });

  describe('filterTeamTree & Ancestor Auto-Expansion', () => {
    it('filters matching child team and retains all its ancestor chain', () => {
      const roots = buildTeamTree(sampleTeams);
      const { filteredRoots, matchedNodeIds, expandedNodeIds } = filterTeamTree(
        roots,
        'infra',
      );

      assert.equal(filteredRoots.length, 1);
      assert.equal(filteredRoots[0]?.id, 'team-engineering');
      assert.ok(matchedNodeIds.has('team-core-infra'));
      assert.ok(expandedNodeIds.has('team-engineering'));
      assert.ok(expandedNodeIds.has('team-backend'));
      assert.equal(matchedNodeIds.size, 1);

      // Verify filtered tree structure
      const eng = filteredRoots[0]!;
      assert.equal(eng.children.length, 1);
      const backend = eng.children[0]!;
      assert.equal(backend.id, 'team-backend');
      assert.equal(backend.children.length, 1);
      assert.equal(backend.children[0]!.id, 'team-core-infra');
    });

    it('returns empty result when no teams match query', () => {
      const roots = buildTeamTree(sampleTeams);
      const { filteredRoots, matchedNodeIds } = filterTeamTree(
        roots,
        'nonexistent-term-xyz',
      );

      assert.equal(filteredRoots.length, 0);
      assert.equal(matchedNodeIds.size, 0);
    });
  });

  describe('EMU SAML Username Prediction', () => {
    it('appends default _gxp suffix to source usernames', () => {
      assert.equal(predictEmuUsername('jdoe'), 'jdoe_gxp');
      assert.equal(predictEmuUsername('alice.smith'), 'alice.smith_gxp');
    });

    it('handles custom suffix with or without leading underscore', () => {
      assert.equal(predictEmuUsername('jdoe', 'acme'), 'jdoe_acme');
      assert.equal(predictEmuUsername('jdoe', '_corp'), 'jdoe_corp');
    });

    it('handles whitespace cleanly', () => {
      assert.equal(predictEmuUsername('  bob  '), 'bob_gxp');
      assert.equal(predictEmuUsername(''), '');
    });
  });

  describe('Outside Collaborator Grant Categorization', () => {
    it('groups repository access grants accurately by permission tier', () => {
      const grants = [
        { repositoryId: 'repo-1', permission: 'admin' },
        { repositoryId: 'repo-2', permission: 'write' },
        { repositoryId: 'repo-3', permission: 'push' },
        { repositoryId: 'repo-4', permission: 'pull' },
        { repositoryId: 'repo-5', permission: 'read' },
        { repositoryId: 'repo-6', permission: 'maintain' },
        { repositoryId: 'repo-7', permission: 'triage' },
      ];

      const categorized = categorizeCollaboratorGrants(grants);
      assert.deepEqual(categorized.admin, ['repo-1']);
      assert.deepEqual(categorized.write, ['repo-2', 'repo-3']);
      assert.deepEqual(categorized.read, ['repo-4', 'repo-5']);
      assert.deepEqual(categorized.maintain, ['repo-6']);
      assert.deepEqual(categorized.triage, ['repo-7']);
    });
  });

  describe('Team Tree SVG Generation', () => {
    it('generates valid SVG diagram string with correct structure', () => {
      const roots = buildTeamTree(sampleTeams);
      const svg = generateTeamTreeSvg(roots);

      assert.ok(svg.startsWith('<svg'));
      assert.ok(svg.endsWith('</svg>'));
      assert.ok(svg.includes('Engineering'));
      assert.ok(svg.includes('Backend Services'));
      assert.ok(svg.includes('class="node-box"'));
      assert.ok(svg.includes('class="connector"'));
    });
  });
});
