export interface DependencyNode {
  id: string;
  label: string;
  organizationId: string;
  external: boolean;
  scanned: boolean;
}
export interface DependencyEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relationshipType: string;
  ecosystem: string | null;
  confidence: 'high' | 'medium' | 'low';
  evidenceMethod: 'first_party' | 'imported' | 'inferred';
}
export interface DependencyGraph {
  nodes: readonly DependencyNode[];
  edges: readonly DependencyEdge[];
}

export function buildDependencyIndex(graph: DependencyGraph) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, DependencyEdge[]>();
  const incoming = new Map<string, DependencyEdge[]>();
  for (const node of graph.nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (!nodes.has(edge.fromNodeId) || !nodes.has(edge.toNodeId)) continue;
    outgoing.get(edge.fromNodeId)!.push(edge);
    incoming.get(edge.toNodeId)!.push(edge);
  }
  for (const values of [...outgoing.values(), ...incoming.values()])
    values.sort((a, b) => a.id.localeCompare(b.id));
  return { nodes, outgoing, incoming };
}

export function directDependencies(graph: DependencyGraph, nodeId: string) {
  return buildDependencyIndex(graph).outgoing.get(nodeId) ?? [];
}
export function reverseDependencies(graph: DependencyGraph, nodeId: string) {
  return buildDependencyIndex(graph).incoming.get(nodeId) ?? [];
}
export function transitiveDependencies(
  graph: DependencyGraph,
  nodeId: string,
  maxDepth = 3,
  reverse = false,
): string[] {
  const index = buildDependencyIndex(graph);
  const seen = new Set<string>([nodeId]);
  let frontier = [nodeId];
  for (let depth = 0; depth < Math.max(0, maxDepth); depth++) {
    const next: string[] = [];
    for (const id of frontier)
      for (const edge of (reverse ? index.incoming : index.outgoing).get(id) ??
        []) {
        const target = reverse ? edge.fromNodeId : edge.toNodeId;
        if (!seen.has(target)) {
          seen.add(target);
          next.push(target);
        }
      }
    frontier = next.sort();
    if (!frontier.length) break;
  }
  seen.delete(nodeId);
  return [...seen].sort();
}

export function stronglyConnectedComponents(
  graph: DependencyGraph,
): string[][] {
  const index = buildDependencyIndex(graph);
  let cursor = 0;
  const order = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const active = new Set<string>();
  const result: string[][] = [];
  const visit = (id: string) => {
    order.set(id, cursor);
    low.set(id, cursor++);
    stack.push(id);
    active.add(id);
    for (const edge of index.outgoing.get(id) ?? []) {
      const next = edge.toNodeId;
      if (!order.has(next)) {
        visit(next);
        low.set(id, Math.min(low.get(id)!, low.get(next)!));
      } else if (active.has(next))
        low.set(id, Math.min(low.get(id)!, order.get(next)!));
    }
    if (low.get(id) === order.get(id)) {
      const component: string[] = [];
      let value: string;
      do {
        value = stack.pop()!;
        active.delete(value);
        component.push(value);
      } while (value !== id);
      result.push(component.sort());
    }
  };
  for (const id of [...index.nodes.keys()].sort())
    if (!order.has(id)) visit(id);
  return result.sort((a, b) => a[0]!.localeCompare(b[0]!));
}

export function weaklyConnectedComponents(graph: DependencyGraph): string[][] {
  const index = buildDependencyIndex(graph);
  const remaining = new Set(index.nodes.keys());
  const result: string[][] = [];
  while (remaining.size) {
    const start = [...remaining].sort()[0]!;
    remaining.delete(start);
    const group = [start];
    const queue = [start];
    while (queue.length) {
      const id = queue.shift()!;
      const adjacent = [
        ...(index.outgoing.get(id) ?? []).map((e) => e.toNodeId),
        ...(index.incoming.get(id) ?? []).map((e) => e.fromNodeId),
      ].sort();
      for (const next of adjacent)
        if (remaining.delete(next)) {
          group.push(next);
          queue.push(next);
        }
    }
    result.push(group.sort());
  }
  return result.sort((a, b) => a[0]!.localeCompare(b[0]!));
}

export function dependencyInsights(graph: DependencyGraph) {
  const index = buildDependencyIndex(graph);
  const hubs = graph.nodes
    .map((node) => ({
      nodeId: node.id,
      fanIn: index.incoming.get(node.id)?.length ?? 0,
      fanOut: index.outgoing.get(node.id)?.length ?? 0,
    }))
    .sort(
      (a, b) =>
        b.fanIn + b.fanOut - (a.fanIn + a.fanOut) ||
        a.nodeId.localeCompare(b.nodeId),
    );
  return {
    hubs,
    orphans: hubs
      .filter((item) => item.fanIn === 0 && item.fanOut === 0)
      .map((item) => item.nodeId),
    cycles: stronglyConnectedComponents(graph).filter(
      (group) => group.length > 1,
    ),
    weakComponents: weaklyConnectedComponents(graph),
    lowConfidenceEdges: graph.edges
      .filter((edge) => edge.confidence === 'low')
      .map((edge) => edge.id),
    crossOrganizationEdges: graph.edges
      .filter(
        (edge) =>
          index.nodes.get(edge.fromNodeId)?.organizationId !==
          index.nodes.get(edge.toNodeId)?.organizationId,
      )
      .map((edge) => edge.id),
  };
}

export function suggestMigrationCohorts(graph: DependencyGraph) {
  const cycles = stronglyConnectedComponents(graph).filter(
    (group) => group.length > 1,
  );
  const cycleNodes = new Set(cycles.flat());
  const groups = [
    ...cycles,
    ...weaklyConnectedComponents(graph).flatMap((group) => {
      const rest = group.filter((id) => !cycleNodes.has(id));
      return rest.length ? [rest] : [];
    }),
  ];
  return groups.map((nodeIds, index) => ({
    id: `cohort-${index + 1}`,
    wave: index + 1,
    nodeIds: [...nodeIds].sort(),
    rationale: cycles.some((cycle) => cycle.some((id) => nodeIds.includes(id)))
      ? 'Cycle members should migrate together.'
      : 'Connected repositories are grouped to reduce boundary risk.',
    advisory: true,
  }));
}
