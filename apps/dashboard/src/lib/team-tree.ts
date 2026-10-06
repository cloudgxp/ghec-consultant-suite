export interface RawTeamEntity {
  id: string;
  name: string;
  parentTeamId?: string | null | undefined;
  membershipCount?:
    | number
    | {
        value?: number | null | undefined;
        reason?: string | null | undefined;
        unit?: string | undefined;
        availability?: string | undefined;
      }
    | null
    | undefined;
  privacy?: 'closed' | 'secret' | undefined;
  repositoryAccess?:
    | Array<{
        repositoryId: string;
        permission: string;
      }>
    | undefined;
}

export interface TeamTreeNode {
  id: string;
  name: string;
  slug: string;
  parentTeamId: string | null;
  depth: number;
  membershipCount: number;
  children: TeamTreeNode[];
  totalDescendantCount: number;
  totalMembersInSubtree: number;
  repositoryAccess: Array<{
    repositoryId: string;
    permission: string;
  }>;
  privacy: 'closed' | 'secret';
}

export interface CollaboratorGrantItem {
  repositoryId: string;
  permission: 'read' | 'triage' | 'write' | 'maintain' | 'admin' | string;
}

export interface OutsideCollaboratorReconciliation {
  id: string;
  pseudonym: string;
  sourceLogin: string;
  predictedTargetLogin: string;
  ssoStatus: 'linked' | 'unlinked' | 'unknown';
  repositoryGrants: CollaboratorGrantItem[];
  reconciliationStatus: 'ready' | 'needs_invitation' | 'blocked';
}

export function slugifyTeamName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Builds a directed hierarchical tree from flat team entities.
 */
export function buildTeamTree(teams: RawTeamEntity[]): TeamTreeNode[] {
  const nodeMap = new Map<string, TeamTreeNode>();

  // Initialize node objects
  for (const t of teams) {
    const rawCount = t.membershipCount;
    const count =
      typeof rawCount === 'number'
        ? rawCount
        : typeof rawCount === 'object' &&
            rawCount !== null &&
            typeof rawCount.value === 'number'
          ? rawCount.value
          : 0;

    const node: TeamTreeNode = {
      id: t.id,
      name: t.name,
      slug: slugifyTeamName(t.name),
      parentTeamId: t.parentTeamId ?? null,
      depth: 0,
      membershipCount: count,
      children: [],
      totalDescendantCount: 0,
      totalMembersInSubtree: count,
      repositoryAccess: t.repositoryAccess ?? [],
      privacy: t.privacy ?? 'closed',
    };
    nodeMap.set(t.id, node);
  }

  const rootNodes: TeamTreeNode[] = [];

  // Build parent-child relationships
  for (const node of nodeMap.values()) {
    if (node.parentTeamId && nodeMap.has(node.parentTeamId)) {
      const parent = nodeMap.get(node.parentTeamId)!;
      parent.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  // Calculate depths and subtree metrics using recursive DFS
  function computeSubtreeMetrics(
    node: TeamTreeNode,
    currentDepth: number,
  ): void {
    node.depth = currentDepth;
    let descendantCount = 0;
    let subtreeMembers = node.membershipCount;

    for (const child of node.children) {
      computeSubtreeMetrics(child, currentDepth + 1);
      descendantCount += 1 + child.totalDescendantCount;
      subtreeMembers += child.totalMembersInSubtree;
    }

    node.totalDescendantCount = descendantCount;
    node.totalMembersInSubtree = subtreeMembers;
  }

  for (const root of rootNodes) {
    computeSubtreeMetrics(root, 0);
  }

  return rootNodes;
}

/**
 * Filters a team tree while preserving ancestor chains for matching nodes.
 */
export function filterTeamTree(
  roots: TeamTreeNode[],
  query: string,
): {
  filteredRoots: TeamTreeNode[];
  matchedNodeIds: Set<string>;
  expandedNodeIds: Set<string>;
} {
  const q = query.trim().toLowerCase();
  const matchedNodeIds = new Set<string>();
  const expandedNodeIds = new Set<string>();

  if (!q) {
    return {
      filteredRoots: roots,
      matchedNodeIds,
      expandedNodeIds,
    };
  }

  function filterNode(node: TeamTreeNode): TeamTreeNode | null {
    const isDirectMatch =
      node.name.toLowerCase().includes(q) ||
      node.slug.toLowerCase().includes(q) ||
      node.id.toLowerCase().includes(q);

    if (isDirectMatch) {
      matchedNodeIds.add(node.id);
    }

    const filteredChildren: TeamTreeNode[] = [];
    for (const child of node.children) {
      const filteredChild = filterNode(child);
      if (filteredChild) {
        filteredChildren.push(filteredChild);
      }
    }

    if (isDirectMatch || filteredChildren.length > 0) {
      if (filteredChildren.length > 0) {
        expandedNodeIds.add(node.id);
      }
      return {
        ...node,
        children: filteredChildren,
      };
    }

    return null;
  }

  const filteredRoots: TeamTreeNode[] = [];
  for (const root of roots) {
    const res = filterNode(root);
    if (res) filteredRoots.push(res);
  }

  return {
    filteredRoots,
    matchedNodeIds,
    expandedNodeIds,
  };
}

/**
 * Predicts destination EMU enterprise username using configured suffix rules.
 */
export function predictEmuUsername(
  sourceUsername: string,
  suffix: string = '_gxp',
): string {
  const trimmed = sourceUsername.trim();
  if (!trimmed) return trimmed;
  const normalizedSuffix = suffix.startsWith('_') ? suffix : `_${suffix}`;
  return `${trimmed}${normalizedSuffix}`;
}

/**
 * Categorizes repository grants by permission tier.
 */
export function categorizeCollaboratorGrants(
  grants: Array<{ repositoryId: string; permission: string }>,
): Record<
  'admin' | 'write' | 'read' | 'triage' | 'maintain' | 'other',
  string[]
> {
  const result: Record<
    'admin' | 'write' | 'read' | 'triage' | 'maintain' | 'other',
    string[]
  > = {
    admin: [],
    write: [],
    read: [],
    triage: [],
    maintain: [],
    other: [],
  };

  for (const g of grants) {
    const perm = g.permission.toLowerCase();
    if (perm === 'admin') result.admin.push(g.repositoryId);
    else if (perm === 'write' || perm === 'push')
      result.write.push(g.repositoryId);
    else if (perm === 'read' || perm === 'pull')
      result.read.push(g.repositoryId);
    else if (perm === 'triage') result.triage.push(g.repositoryId);
    else if (perm === 'maintain') result.maintain.push(g.repositoryId);
    else result.other.push(g.repositoryId);
  }

  return result;
}

/**
 * Generates an SVG representation of the team tree hierarchy for export.
 */
export function generateTeamTreeSvg(roots: TeamTreeNode[]): string {
  const nodeWidth = 220;
  const nodeHeight = 60;
  const horizontalGap = 40;
  const verticalGap = 80;

  // Flatten tree into visual levels
  const levels: TeamTreeNode[][] = [];
  function collectLevels(node: TeamTreeNode, depth: number) {
    if (!levels[depth]) levels[depth] = [];
    levels[depth]!.push(node);
    for (const c of node.children) {
      collectLevels(c, depth + 1);
    }
  }

  for (const r of roots) {
    collectLevels(r, 0);
  }

  const maxLevelWidth = Math.max(1, ...levels.map((l) => l.length));
  const svgWidth = Math.max(
    800,
    maxLevelWidth * (nodeWidth + horizontalGap) + 100,
  );
  const svgHeight = Math.max(
    400,
    levels.length * (nodeHeight + verticalGap) + 100,
  );

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">`,
    '  <style>',
    '    .node-box { fill: rgb(246, 248, 250); stroke: rgb(208, 215, 222); stroke-width: 1.5; rx: 6; }',
    '    .node-title { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; font-weight: 600; fill: rgb(31, 35, 40); }',
    '    .node-sub { font-family: monospace; font-size: 11px; fill: rgb(101, 109, 118); }',
    '    .connector { stroke: rgb(208, 215, 222); stroke-width: 1.5; fill: none; }',
    '  </style>',
  ];

  // Map each node to its coordinates
  const coords = new Map<string, { x: number; y: number }>();

  for (let depth = 0; depth < levels.length; depth++) {
    const nodesInLevel = levels[depth]!;
    const levelWidth =
      nodesInLevel.length * (nodeWidth + horizontalGap) - horizontalGap;
    const startX = (svgWidth - levelWidth) / 2;
    const y = 50 + depth * (nodeHeight + verticalGap);

    nodesInLevel.forEach((n, idx) => {
      const x = startX + idx * (nodeWidth + horizontalGap);
      coords.set(n.id, { x, y });
    });
  }

  // Draw connectors
  for (const node of coords.keys()) {
    const parentCoord = coords.get(node);
    if (!parentCoord) continue;

    // Find node object to see its children
    function findNode(nList: TeamTreeNode[]): TeamTreeNode | null {
      for (const n of nList) {
        if (n.id === node) return n;
        const sub = findNode(n.children);
        if (sub) return sub;
      }
      return null;
    }
    const current = findNode(roots);
    if (current) {
      for (const child of current.children) {
        const childCoord = coords.get(child.id);
        if (childCoord) {
          const fromX = parentCoord.x + nodeWidth / 2;
          const fromY = parentCoord.y + nodeHeight;
          const toX = childCoord.x + nodeWidth / 2;
          const toY = childCoord.y;
          const midY = (fromY + toY) / 2;
          lines.push(
            `  <path d="M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}" class="connector" />`,
          );
        }
      }
    }
  }

  // Draw node boxes
  for (const [id, c] of coords.entries()) {
    function findNodeById(nList: TeamTreeNode[]): TeamTreeNode | null {
      for (const n of nList) {
        if (n.id === id) return n;
        const sub = findNodeById(n.children);
        if (sub) return sub;
      }
      return null;
    }
    const node = findNodeById(roots);
    if (node) {
      lines.push(
        `  <rect x="${c.x}" y="${c.y}" width="${nodeWidth}" height="${nodeHeight}" class="node-box" />`,
      );
      lines.push(
        `  <text x="${c.x + 12}" y="${c.y + 24}" class="node-title">${node.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`,
      );
      lines.push(
        `  <text x="${c.x + 12}" y="${c.y + 44}" class="node-sub">Members: ${node.membershipCount} | Children: ${node.children.length}</text>`,
      );
    }
  }

  lines.push('</svg>');
  return lines.join('\n');
}
