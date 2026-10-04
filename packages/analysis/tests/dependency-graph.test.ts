import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dependencyInsights,
  buildDependencyIndex,
  directDependencies,
  reverseDependencies,
  stronglyConnectedComponents,
  suggestMigrationCohorts,
  transitiveDependencies,
  weaklyConnectedComponents,
  type DependencyGraph,
} from '../src/dependency-graph.js';

const nodes = ['a', 'b', 'c', 'd', 'orphan'].map((id) => ({
  id,
  label: id,
  organizationId: id === 'd' ? 'south' : 'north',
  external: id === 'd',
  scanned: id !== 'd',
}));
const edges = [
  ['ab', 'a', 'b', 'high'],
  ['bc', 'b', 'c', 'high'],
  ['ca', 'c', 'a', 'medium'],
  ['cd', 'c', 'd', 'low'],
].map(([id, fromNodeId, toNodeId, confidence]) => ({
  id,
  fromNodeId,
  toNodeId,
  relationshipType: 'package',
  ecosystem: 'npm',
  confidence: confidence as 'high' | 'medium' | 'low',
  evidenceMethod: 'imported' as const,
}));
const graph: DependencyGraph = { nodes, edges };

test('direct, reverse, and bounded transitive traversal is deterministic and cycle-safe', () => {
  assert.deepEqual(
    directDependencies(graph, 'a').map((e) => e.toNodeId),
    ['b'],
  );
  assert.deepEqual(
    reverseDependencies(graph, 'a').map((e) => e.fromNodeId),
    ['c'],
  );
  assert.deepEqual(transitiveDependencies(graph, 'a', 2), ['b', 'c']);
  assert.deepEqual(transitiveDependencies(graph, 'a', 8), ['b', 'c', 'd']);
});

test('indexes 10,000 nodes and 100,000 edges within the worker budget', () => {
  const largeNodes = Array.from({ length: 10_000 }, (_, index) => ({
    id: `n${index}`,
    label: `Repository ${index}`,
    organizationId: 'scale',
    external: false,
    scanned: true,
  }));
  const largeEdges = Array.from({ length: 100_000 }, (_, index) => ({
    id: `e${index}`,
    fromNodeId: `n${index % 10_000}`,
    toNodeId: `n${(index * 17 + 1) % 10_000}`,
    relationshipType: 'package',
    ecosystem: 'npm',
    confidence: 'high' as const,
    evidenceMethod: 'imported' as const,
  }));
  const started = performance.now();
  const index = buildDependencyIndex({ nodes: largeNodes, edges: largeEdges });
  const elapsed = performance.now() - started;
  assert.equal(index.nodes.size, 10_000);
  assert.equal(
    [...index.outgoing.values()].reduce((sum, edges) => sum + edges.length, 0),
    100_000,
  );
  assert.ok(
    elapsed < 5_000,
    `Indexing exceeded 5s budget: ${elapsed.toFixed(1)}ms`,
  );
});

test('strong and weak components identify cycles and disconnected nodes', () => {
  assert.deepEqual(stronglyConnectedComponents(graph), [
    ['a', 'b', 'c'],
    ['d'],
    ['orphan'],
  ]);
  assert.deepEqual(weaklyConnectedComponents(graph), [
    ['a', 'b', 'c', 'd'],
    ['orphan'],
  ]);
});

test('insights distinguish orphan, low-confidence, external boundary, and explain cohorts', () => {
  const insights = dependencyInsights(graph);
  assert.deepEqual(insights.orphans, ['orphan']);
  assert.deepEqual(insights.lowConfidenceEdges, ['cd']);
  assert.deepEqual(insights.crossOrganizationEdges, ['cd']);
  const cohorts = suggestMigrationCohorts(graph);
  assert.ok(cohorts.every((cohort) => cohort.advisory));
  assert.match(cohorts[0]?.rationale ?? '', /Cycle/);
});
