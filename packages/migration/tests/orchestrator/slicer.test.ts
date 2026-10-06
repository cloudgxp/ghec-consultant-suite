import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIGRATION_SCHEMA_VERSION,
  type MigrationScope,
  validateMigrationScope,
} from '@ghec/contracts';
import type { DependencyGraph } from '@ghec/analysis';
import {
  ScopeMatrixSlicer,
  type CohortExecutionResult,
} from '../../src/index.js';

function createSampleScope(repoCount: number): MigrationScope {
  return {
    version: MIGRATION_SCHEMA_VERSION,
    name: 'enterprise-migration',
    organizations: [{ source: 'src-org', target: 'dst-org' }],
    repositories: Array.from({ length: repoCount }, (_, i) => ({
      sourceOrg: 'src-org',
      sourceRepo: `repo-${i + 1}`,
      targetOrg: 'dst-org',
      targetRepo: `repo-${i + 1}`,
      useGei: true,
      modules: ['repo-variables', 'rulesets'],
    })),
  };
}

test('ScopeMatrixSlicer partitions independent repositories into balanced cohorts', () => {
  const scope = createSampleScope(7);
  const matrix = ScopeMatrixSlicer.slice(scope, { batchSize: 3 });

  assert.equal(matrix.include.length, 3);

  const cohort1 = matrix.include[0]!;
  assert.equal(cohort1.cohortId, 'cohort-1');
  assert.equal(cohort1.repoCount, 3);
  assert.deepEqual(cohort1.repositories, [
    'src-org/repo-1',
    'src-org/repo-2',
    'src-org/repo-3',
  ]);

  const cohort2 = matrix.include[1]!;
  assert.equal(cohort2.cohortId, 'cohort-2');
  assert.equal(cohort2.repoCount, 3);
  assert.deepEqual(cohort2.repositories, [
    'src-org/repo-4',
    'src-org/repo-5',
    'src-org/repo-6',
  ]);

  const cohort3 = matrix.include[2]!;
  assert.equal(cohort3.cohortId, 'cohort-3');
  assert.equal(cohort3.repoCount, 1);
  assert.deepEqual(cohort3.repositories, ['src-org/repo-7']);

  // Verify all scoped sub-scopes pass schema validation
  for (const cohort of matrix.include) {
    const validated = validateMigrationScope(cohort.scope);
    assert.equal(validated.success, true);
    assert.deepEqual(JSON.parse(cohort.scopeJson), cohort.scope);
  }
});

test('ScopeMatrixSlicer keeps strongly connected cycles together in the same cohort', () => {
  const scope: MigrationScope = {
    version: MIGRATION_SCHEMA_VERSION,
    name: 'coupled-migration',
    organizations: [{ source: 'org', target: 'org' }],
    repositories: [
      {
        sourceOrg: 'org',
        sourceRepo: 'core-a',
        targetOrg: 'org',
        targetRepo: 'core-a',
      },
      {
        sourceOrg: 'org',
        sourceRepo: 'core-b',
        targetOrg: 'org',
        targetRepo: 'core-b',
      },
      {
        sourceOrg: 'org',
        sourceRepo: 'lib-x',
        targetOrg: 'org',
        targetRepo: 'lib-x',
      },
      {
        sourceOrg: 'org',
        sourceRepo: 'lib-y',
        targetOrg: 'org',
        targetRepo: 'lib-y',
      },
    ],
  };

  // core-a and core-b form a cyclic dependency
  const dependencyGraph: DependencyGraph = {
    nodes: [
      {
        id: 'org/core-a',
        label: 'core-a',
        organizationId: 'org',
        external: false,
        scanned: true,
      },
      {
        id: 'org/core-b',
        label: 'core-b',
        organizationId: 'org',
        external: false,
        scanned: true,
      },
      {
        id: 'org/lib-x',
        label: 'lib-x',
        organizationId: 'org',
        external: false,
        scanned: true,
      },
      {
        id: 'org/lib-y',
        label: 'lib-y',
        organizationId: 'org',
        external: false,
        scanned: true,
      },
    ],
    edges: [
      {
        id: 'e1',
        fromNodeId: 'org/core-a',
        toNodeId: 'org/core-b',
        relationshipType: 'package',
        ecosystem: 'npm',
        confidence: 'high',
        evidenceMethod: 'imported',
      },
      {
        id: 'e2',
        fromNodeId: 'org/core-b',
        toNodeId: 'org/core-a',
        relationshipType: 'package',
        ecosystem: 'npm',
        confidence: 'high',
        evidenceMethod: 'imported',
      },
    ],
  };

  const matrix = ScopeMatrixSlicer.slice(scope, {
    batchSize: 2,
    dependencyGraph,
  });

  // core-a and core-b must be in the same cohort
  const cycleCohort = matrix.include.find(
    (c) =>
      c.repositories.includes('org/core-a') &&
      c.repositories.includes('org/core-b'),
  );
  assert.ok(cycleCohort, 'Cyclic repositories must be in the same cohort');
  assert.ok(cycleCohort.rationale?.includes('Cycle'));
});

test('ScopeMatrixSlicer handles oversized cycles without breaking atomic dependency boundaries', () => {
  const scope: MigrationScope = {
    version: MIGRATION_SCHEMA_VERSION,
    name: 'large-cycle',
    organizations: [{ source: 'org', target: 'org' }],
    repositories: [
      {
        sourceOrg: 'org',
        sourceRepo: 'sub-1',
        targetOrg: 'org',
        targetRepo: 'sub-1',
      },
      {
        sourceOrg: 'org',
        sourceRepo: 'sub-2',
        targetOrg: 'org',
        targetRepo: 'sub-2',
      },
      {
        sourceOrg: 'org',
        sourceRepo: 'sub-3',
        targetOrg: 'org',
        targetRepo: 'sub-3',
      },
      {
        sourceOrg: 'org',
        sourceRepo: 'independent-1',
        targetOrg: 'org',
        targetRepo: 'independent-1',
      },
    ],
  };

  // 3-way circular dependency: sub-1 -> sub-2 -> sub-3 -> sub-1
  const dependencyGraph: DependencyGraph = {
    nodes: [
      {
        id: 'sub-1',
        label: 'sub-1',
        organizationId: 'org',
        external: false,
        scanned: true,
      },
      {
        id: 'sub-2',
        label: 'sub-2',
        organizationId: 'org',
        external: false,
        scanned: true,
      },
      {
        id: 'sub-3',
        label: 'sub-3',
        organizationId: 'org',
        external: false,
        scanned: true,
      },
      {
        id: 'independent-1',
        label: 'independent-1',
        organizationId: 'org',
        external: false,
        scanned: true,
      },
    ],
    edges: [
      {
        id: 'e1',
        fromNodeId: 'sub-1',
        toNodeId: 'sub-2',
        relationshipType: 'package',
        ecosystem: 'npm',
        confidence: 'high',
        evidenceMethod: 'imported',
      },
      {
        id: 'e2',
        fromNodeId: 'sub-2',
        toNodeId: 'sub-3',
        relationshipType: 'package',
        ecosystem: 'npm',
        confidence: 'high',
        evidenceMethod: 'imported',
      },
      {
        id: 'e3',
        fromNodeId: 'sub-3',
        toNodeId: 'sub-1',
        relationshipType: 'package',
        ecosystem: 'npm',
        confidence: 'high',
        evidenceMethod: 'imported',
      },
    ],
  };

  // Request batchSize of 2, which is smaller than the 3-node cycle
  const matrix = ScopeMatrixSlicer.slice(scope, {
    batchSize: 2,
    dependencyGraph,
  });

  const cycleCohort = matrix.include.find((c) =>
    c.repositories.includes('org/sub-1'),
  );
  assert.ok(cycleCohort);
  assert.equal(cycleCohort.repoCount, 3);
  assert.ok(cycleCohort.repositories.includes('org/sub-2'));
  assert.ok(cycleCohort.repositories.includes('org/sub-3'));
  assert.ok(cycleCohort.rationale?.includes('Cycle of 3'));

  const independentCohort = matrix.include.find((c) =>
    c.repositories.includes('org/independent-1'),
  );
  assert.ok(independentCohort);
  assert.equal(independentCohort.repoCount, 1);
});

test('ScopeMatrixSlicer generates conformant GitHub Actions matrix payload', () => {
  const scope = createSampleScope(4);
  const matrix = ScopeMatrixSlicer.slice(scope, {
    batchSize: 2,
    namingPrefix: 'runner-job',
  });

  assert.equal(matrix.include.length, 2);
  assert.equal(matrix.include[0]?.cohortId, 'runner-job-1');
  assert.equal(matrix.include[1]?.cohortId, 'runner-job-2');

  const serialized = JSON.stringify(matrix);
  const parsed = JSON.parse(serialized);
  assert.ok(Array.isArray(parsed.include));
  assert.equal(parsed.include.length, 2);
});

test('ScopeMatrixSlicer.aggregateCohortResults consolidates parallel cohort outcomes', () => {
  const cohortResults: CohortExecutionResult[] = [
    {
      cohortId: 'cohort-1',
      status: 'complete',
      repositoryCount: 3,
      completedRepositories: ['org/repo-1', 'org/repo-2', 'org/repo-3'],
      durationMs: 1200,
    },
    {
      cohortId: 'cohort-2',
      status: 'complete',
      repositoryCount: 2,
      completedRepositories: ['org/repo-4', 'org/repo-5'],
      durationMs: 950,
    },
    {
      cohortId: 'cohort-3',
      status: 'failed',
      repositoryCount: 2,
      completedRepositories: ['org/repo-6'],
      failedRepositories: ['org/repo-7'],
      error: 'Secondary rate limit triggered on target enterprise',
      durationMs: 400,
    },
  ];

  const summary = ScopeMatrixSlicer.aggregateCohortResults(cohortResults);

  assert.equal(summary.status, 'partial');
  assert.equal(summary.totalCohorts, 3);
  assert.equal(summary.completedCohorts, 2);
  assert.equal(summary.failedCohorts, 1);
  assert.equal(summary.totalRepositories, 7);
  assert.equal(summary.completedRepositories, 6);
  assert.equal(summary.failedRepositories, 1);
  assert.equal(summary.errors.length, 1);
  assert.ok(summary.errors[0]?.includes('Secondary rate limit'));
  assert.equal(summary.durationMs, 1200);
});

test('ScopeMatrixSlicer.aggregateCohortResults reports complete when all cohorts succeed', () => {
  const cohortResults: CohortExecutionResult[] = [
    {
      cohortId: 'cohort-1',
      status: 'complete',
      repositoryCount: 2,
      completedRepositories: ['org/repo-1', 'org/repo-2'],
      durationMs: 500,
    },
    {
      cohortId: 'cohort-2',
      status: 'complete',
      repositoryCount: 1,
      completedRepositories: ['org/repo-3'],
      durationMs: 300,
    },
  ];

  const summary = ScopeMatrixSlicer.aggregateCohortResults(cohortResults);
  assert.equal(summary.status, 'complete');
  assert.equal(summary.completedCohorts, 2);
  assert.equal(summary.failedCohorts, 0);
  assert.equal(summary.errors.length, 0);
});

test('ScopeMatrixSlicer generates exactly 1 sequential cohort when runnerCapacity is 1', () => {
  const scope = createSampleScope(12);
  const matrix = ScopeMatrixSlicer.slice(scope, { runnerCapacity: 1 });

  assert.equal(matrix.include.length, 1);
  assert.equal(matrix.include[0]?.cohortId, 'cohort-1');
  assert.equal(matrix.include[0]?.repoCount, 12);
  assert.equal(matrix.include[0]?.repositories.length, 12);
  assert.match(matrix.include[0]?.rationale ?? '', /Single runner/);
});

test('ScopeMatrixSlicer dynamically fans out to up to N cohorts when runnerCapacity is N', () => {
  const scope = createSampleScope(10);
  // 10 repos with capacity 4 -> batchSize = ceil(10/4) = 3 -> cohorts: 3, 3, 3, 1 (4 cohorts)
  const matrix = ScopeMatrixSlicer.slice(scope, { runnerCapacity: 4 });

  assert.ok(
    matrix.include.length <= 4,
    `Cohorts ${matrix.include.length} should be <= 4`,
  );
  assert.equal(
    matrix.include.reduce((sum, c) => sum + c.repoCount, 0),
    10,
  );
});

test('ScopeMatrixSlicer cleanly handles more runners than repositories', () => {
  const scope = createSampleScope(3);
  // 3 repos with capacity 10 -> at most 3 cohorts (1 repo each)
  const matrix = ScopeMatrixSlicer.slice(scope, { runnerCapacity: 10 });

  assert.equal(matrix.include.length, 3);
  for (const cohort of matrix.include) {
    assert.equal(cohort.repoCount, 1);
  }
});
