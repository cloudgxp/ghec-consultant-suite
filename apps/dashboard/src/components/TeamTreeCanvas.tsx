import React, { useMemo, useState } from 'react';
import { Button, Label, TextInput } from '@primer/react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  LockIcon,
  PeopleIcon,
  RepoIcon,
  SearchIcon,
  XIcon,
} from '@primer/octicons-react';
import {
  buildTeamTree,
  filterTeamTree,
  generateTeamTreeSvg,
  type RawTeamEntity,
  type TeamTreeNode,
} from '../lib/team-tree.js';

export interface TeamTreeCanvasProps {
  teams: RawTeamEntity[];
  onSelectTeam?: ((team: TeamTreeNode) => void) | undefined;
}

export const TeamTreeCanvas: React.FC<TeamTreeCanvasProps> = ({
  teams,
  onSelectTeam,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(
    new Set(),
  );
  const [manuallyExpandedNodeIds, setManuallyExpandedNodeIds] = useState<
    Set<string>
  >(new Set());

  // Build root trees
  const initialRoots = useMemo(() => buildTeamTree(teams), [teams]);

  // Apply search filter and ancestor auto-expansion
  const { filteredRoots, matchedNodeIds, autoExpandedNodeIds } = useMemo(() => {
    const res = filterTeamTree(initialRoots, searchQuery);
    return {
      filteredRoots: res.filteredRoots,
      matchedNodeIds: res.matchedNodeIds,
      autoExpandedNodeIds: res.expandedNodeIds,
    };
  }, [initialRoots, searchQuery]);

  const isNodeExpanded = (nodeId: string): boolean => {
    if (collapsedNodeIds.has(nodeId)) return false;
    if (manuallyExpandedNodeIds.has(nodeId)) return true;
    if (autoExpandedNodeIds.has(nodeId)) return true;
    return false;
  };

  const toggleNode = (nodeId: string) => {
    const currentlyExpanded = isNodeExpanded(nodeId);
    if (currentlyExpanded) {
      setCollapsedNodeIds((prev) => new Set(prev).add(nodeId));
      setManuallyExpandedNodeIds((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    } else {
      setManuallyExpandedNodeIds((prev) => new Set(prev).add(nodeId));
      setCollapsedNodeIds((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }
  };

  const expandAll = () => {
    const all = new Set<string>();
    function collect(nList: TeamTreeNode[]) {
      for (const n of nList) {
        if (n.children.length > 0) all.add(n.id);
        collect(n.children);
      }
    }
    collect(filteredRoots);
    setManuallyExpandedNodeIds(all);
    setCollapsedNodeIds(new Set());
  };

  const collapseAll = () => {
    const all = new Set<string>();
    function collect(nList: TeamTreeNode[]) {
      for (const n of nList) {
        if (n.children.length > 0) all.add(n.id);
        collect(n.children);
      }
    }
    collect(filteredRoots);
    setCollapsedNodeIds(all);
    setManuallyExpandedNodeIds(new Set());
  };

  const handleExportSvg = () => {
    const svg = generateTeamTreeSvg(filteredRoots);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'team-hierarchy-tree.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderNode = (node: TeamTreeNode) => {
    const isExpanded = isNodeExpanded(node.id);
    const hasChildren = node.children.length > 0;
    const isMatched = matchedNodeIds.has(node.id);

    return (
      <div key={node.id} className="relative">
        <div
          className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
            isMatched
              ? 'border-[var(--borderColor-accent-emphasis)] bg-[var(--canvas-subtle)] shadow-xs ring-1 ring-[var(--borderColor-accent-emphasis)]'
              : 'border-[var(--borderColor-default)] bg-[var(--canvas-default)] hover:border-[var(--borderColor-muted)]'
          }`}
        >
          {/* Toggle or Bullet */}
          <div className="pt-0.5">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleNode(node.id)}
                className="text-[var(--fgColor-muted)] hover:text-[var(--fgColor-default)] focus:outline-none p-0.5 rounded hover:bg-[var(--canvas-subtle)]"
                aria-label={
                  isExpanded ? 'Collapse team children' : 'Expand team children'
                }
              >
                {isExpanded ? (
                  <ChevronDownIcon size={16} />
                ) : (
                  <ChevronRightIcon size={16} />
                )}
              </button>
            ) : (
              <div className="w-5 h-5 flex items-center justify-center text-[var(--fgColor-muted)]">
                •
              </div>
            )}
          </div>

          {/* Node Content */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onSelectTeam?.(node)}
                className="font-bold text-sm text-[var(--fgColor-default)] hover:underline text-left"
              >
                {node.name}
              </button>
              <span className="font-mono text-xs text-[var(--fgColor-muted)]">
                @{node.slug}
              </span>
              {node.privacy === 'secret' ? (
                <Label
                  variant="secondary"
                  className="text-[10px] inline-flex items-center gap-1"
                >
                  <LockIcon size={10} /> Secret
                </Label>
              ) : (
                <Label variant="secondary" className="text-[10px]">
                  Closed
                </Label>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-[var(--fgColor-muted)]">
              <span className="flex items-center gap-1">
                <PeopleIcon size={14} />
                <span className="font-semibold text-[var(--fgColor-default)]">
                  {node.membershipCount}
                </span>{' '}
                direct members
                {node.totalMembersInSubtree > node.membershipCount && (
                  <span> ({node.totalMembersInSubtree} in subtree)</span>
                )}
              </span>

              {hasChildren && (
                <span>
                  <span className="font-semibold text-[var(--fgColor-default)]">
                    {node.children.length}
                  </span>{' '}
                  sub-teams ({node.totalDescendantCount} total)
                </span>
              )}

              {node.repositoryAccess && node.repositoryAccess.length > 0 && (
                <span className="flex items-center gap-1">
                  <RepoIcon size={14} />
                  <span className="font-semibold text-[var(--fgColor-default)]">
                    {node.repositoryAccess.length}
                  </span>{' '}
                  repositories
                </span>
              )}
            </div>

            {/* Direct Repository Access Badges */}
            {node.repositoryAccess && node.repositoryAccess.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {node.repositoryAccess.slice(0, 4).map((access, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)]"
                  >
                    <RepoIcon size={10} />
                    <span className="text-[var(--fgColor-default)]">
                      {access.repositoryId.replace(/^.*:/, '')}
                    </span>
                    <span className="text-[var(--fgColor-accent)] font-semibold">
                      ({access.permission})
                    </span>
                  </span>
                ))}
                {node.repositoryAccess.length > 4 && (
                  <span className="px-1.5 py-0.5 text-[10px] text-[var(--fgColor-muted)]">
                    +{node.repositoryAccess.length - 4} more
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Children Render with Indentation and Left Border */}
        {hasChildren && isExpanded && (
          <div className="ml-6 pl-4 border-l-2 border-[var(--borderColor-muted)] mt-2 space-y-2">
            {node.children.map((child) => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search and Tree Controls */}
      <div className="p-3 rounded-lg border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[260px] max-w-md">
          <TextInput
            leadingVisual={SearchIcon}
            placeholder="Search teams by name, slug, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search teams"
            {...(searchQuery
              ? {
                  trailingAction: (
                    <TextInput.Action
                      icon={XIcon}
                      aria-label="Clear search"
                      onClick={() => setSearchQuery('')}
                    />
                  ),
                }
              : {})}
            block
          />
        </div>

        <div className="flex items-center gap-2">
          <Button size="small" onClick={expandAll}>
            Expand All
          </Button>
          <Button size="small" onClick={collapseAll}>
            Collapse All
          </Button>
          <Button
            size="small"
            leadingVisual={DownloadIcon}
            onClick={handleExportSvg}
          >
            Export SVG
          </Button>
        </div>
      </div>

      {/* Hierarchy Tree Canvas Box */}
      <div className="p-4 rounded-lg border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)]">
        {filteredRoots.length === 0 ? (
          <div className="py-12 text-center text-xs text-[var(--fgColor-muted)]">
            No teams found matching &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRoots.map((root) => renderNode(root))}
          </div>
        )}
      </div>
    </div>
  );
};
