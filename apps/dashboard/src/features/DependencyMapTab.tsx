import { useEffect, useMemo, useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import {
  dependencyInsights,
  suggestMigrationCohorts,
  transitiveDependencies,
  type DependencyEdge,
  type DependencyGraph,
  type DependencyNode,
} from '@ghec/analysis';
import { DependencyCanvas } from '../components/dependency-map/DependencyCanvas.js';
import {
  FilterToolbar,
  MetricCard,
  PageHeader,
  SurfaceCard,
} from '../components/ui/index.js';
import {
  Button,
  Flash,
  IconButton,
  Label,
  Select,
  TextInput,
} from '@primer/react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DownloadIcon,
  SearchIcon,
  UploadIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@primer/octicons-react';
import {
  VirtualizedTable,
  type VirtualizedColumn,
} from '../components/VirtualizedTable.js';
import { downloadCsv, sanitizeCsvField } from '../lib/export-csv.js';
interface Props {
  bundle: DiscoveryBundle;
  selectedOrgIds: readonly string[];
}
type Cohort = ReturnType<typeof suggestMigrationCohorts>[number];

function bundleGraph(bundle: DiscoveryBundle): DependencyGraph {
  const nodes = bundle.entities
    .filter((e) => e.kind === 'dependency-node')
    .map((e): DependencyNode => ({
      id: e.id,
      label: e.label,
      organizationId: e.organizationId,
      external: e.external,
      scanned: e.scanned,
    }));
  const edges = bundle.entities
    .filter((e) => e.kind === 'dependency-edge')
    .map((e): DependencyEdge => ({
      id: e.id,
      fromNodeId: e.fromNodeId,
      toNodeId: e.toNodeId,
      relationshipType: e.relationshipType,
      ecosystem: e.ecosystem,
      confidence: e.confidence,
      evidenceMethod: e.evidenceMethod,
    }));
  return { nodes, edges };
}
function parseLocalGraph(value: unknown): DependencyGraph {
  if (!value || typeof value !== 'object')
    throw new Error('Dependency file must be a JSON object.');
  const rawGraph = value as Record<string, unknown>;
  if (
    !Array.isArray(rawGraph.nodes) ||
    !Array.isArray(rawGraph.edges) ||
    rawGraph.nodes.length > 10000 ||
    rawGraph.edges.length > 100000
  )
    throw new Error('Expected at most 10,000 nodes and 100,000 edges.');
  const nodes = rawGraph.nodes.map((raw, index): DependencyNode => {
    const n = raw as Record<string, unknown>;
    if (typeof n.id !== 'string' && typeof n.stableKey !== 'string')
      throw new Error(`Node ${index} has no stable identity.`);
    const id = String(n.id ?? n.stableKey);
    return {
      id,
      label: typeof n.label === 'string' ? n.label : id,
      organizationId:
        typeof n.organizationId === 'string' ? n.organizationId : 'external',
      external: n.external === true,
      scanned: n.scanned !== false,
    };
  });
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = rawGraph.edges.map((raw, index): DependencyEdge => {
    const e = raw as Record<string, unknown>;
    const from = String(e.fromNodeId ?? e.from ?? '');
    const to = String(e.toNodeId ?? e.to ?? '');
    if (!nodeIds.has(from) || !nodeIds.has(to))
      throw new Error(`Edge ${index} references an unknown node.`);
    const confidence =
      e.confidence === 'low' || e.confidence === 'medium'
        ? e.confidence
        : 'high';
    return {
      id: typeof e.id === 'string' ? e.id : `edge:${index}:${from}:${to}`,
      fromNodeId: from,
      toNodeId: to,
      relationshipType:
        typeof e.relationshipType === 'string' ? e.relationshipType : 'other',
      ecosystem: typeof e.ecosystem === 'string' ? e.ecosystem : null,
      confidence,
      evidenceMethod: 'imported',
    };
  });
  return { nodes, edges };
}
export function DependencyMapTab({ bundle, selectedOrgIds }: Props) {
  const [imported, setImported] = useState<DependencyGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [depth, setDepth] = useState(2);
  const [zoom, setZoom] = useState(1);
  const [confidence, setConfidence] = useState('all');
  useEffect(() => {
    const focus = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail.id;
      if (id) setSelectedId(id);
    };
    window.addEventListener('ghec:focus-entity', focus);
    return () => window.removeEventListener('ghec:focus-entity', focus);
  }, []);
  const collectedGraph = useMemo(() => bundleGraph(bundle), [bundle]);
  const graph = imported ?? collectedGraph;
  const scoped = useMemo(
    () => ({
      nodes: graph.nodes.filter(
        (n) =>
          !selectedOrgIds.length ||
          selectedOrgIds.includes(n.organizationId) ||
          n.external,
      ),
      edges: graph.edges.filter(
        (e) => confidence === 'all' || e.confidence === confidence,
      ),
    }),
    [graph, selectedOrgIds, confidence],
  );
  const filteredGraph = useMemo(() => {
    const ids = new Set(scoped.nodes.map((n) => n.id));
    return {
      nodes: scoped.nodes,
      edges: scoped.edges.filter(
        (e) => ids.has(e.fromNodeId) && ids.has(e.toNodeId),
      ),
    };
  }, [scoped]);
  const localInsights = useMemo(
    () => dependencyInsights(filteredGraph),
    [filteredGraph],
  );
  const [prevInsightsGraph, setPrevInsightsGraph] = useState(filteredGraph);
  const [workerInsights, setWorkerInsights] = useState<ReturnType<
    typeof dependencyInsights
  > | null>(null);
  if (prevInsightsGraph !== filteredGraph) {
    setPrevInsightsGraph(filteredGraph);
    setWorkerInsights(null);
  }
  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    const worker = new Worker(
      new URL('../lib/dependency-map.worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.onmessage = (
      event: MessageEvent<{ insights: ReturnType<typeof dependencyInsights> }>,
    ) => setWorkerInsights(event.data.insights);
    worker.postMessage({ graph: filteredGraph });
    return () => worker.terminate();
  }, [filteredGraph]);
  const insights = workerInsights ?? localInsights;
  const [prevGraph, setPrevGraph] = useState(filteredGraph);
  const [cohorts, setCohorts] = useState<Cohort[]>(() =>
    suggestMigrationCohorts(filteredGraph),
  );
  if (prevGraph !== filteredGraph) {
    setPrevGraph(filteredGraph);
    setCohorts(suggestMigrationCohorts(filteredGraph));
  }
  // ⚡ Bolt: Memoize rows filtering and extract toLowerCase to avoid O(N) string operations on every render
  const rows = useMemo(() => {
    const q = query?.toLowerCase() ?? '';
    return filteredGraph.nodes.filter(
      (n) => !q || n.label.toLowerCase().includes(q),
    );
  }, [filteredGraph.nodes, query]);

  // ⚡ Bolt: Optimize node lookups from O(N) to O(1) during selection and rendering
  const nodeMap = useMemo(
    () => new Map(filteredGraph.nodes.map((n) => [n.id, n])),
    [filteredGraph.nodes],
  );

  const selected = selectedId ? (nodeMap.get(selectedId) ?? null) : null;
  // ⚡ Bolt: Memoize expensive graph traversals and filtering based on selection
  const outgoing = useMemo(
    () =>
      selected
        ? filteredGraph.edges.filter((e) => e.fromNodeId === selected.id)
        : [],
    [selected, filteredGraph.edges],
  );
  const incoming = useMemo(
    () =>
      selected
        ? filteredGraph.edges.filter((e) => e.toNodeId === selected.id)
        : [],
    [selected, filteredGraph.edges],
  );
  const transitive = useMemo(
    () =>
      selected ? transitiveDependencies(filteredGraph, selected.id, depth) : [],
    [selected, filteredGraph, depth],
  );
  const columns: readonly VirtualizedColumn<DependencyNode>[] = [
    {
      header: 'Repository / node',
      width: '1.5fr',
      cell: (n) => (
        <button
          type="button"
          className="text-left font-semibold text-[var(--fgColor-accent)] hover:underline cursor-pointer"
          onClick={() => setSelectedId(n.id)}
        >
          {n.label}
        </button>
      ),
    },
    { header: 'Organization', cell: (n) => n.organizationId },
    {
      header: 'Scope',
      cell: (n) =>
        n.external ? (
          <Label size="small" variant="attention">
            External
          </Label>
        ) : n.scanned ? (
          'Scanned'
        ) : (
          'Unscanned'
        ),
    },
    {
      header: 'Fan in',
      cell: (n) =>
        filteredGraph.edges.filter((e) => e.toNodeId === n.id).length,
    },
    {
      header: 'Fan out',
      cell: (n) =>
        filteredGraph.edges.filter((e) => e.fromNodeId === n.id).length,
    },
    {
      header: 'Signals',
      cell: (n) =>
        insights.orphans.includes(n.id)
          ? 'Orphan / no observed edges'
          : insights.cycles.some((c) => c.includes(n.id))
            ? 'Cycle member'
            : 'Connected',
    },
  ];
  const exportCohorts = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { advisory: true, cohorts, edges: filteredGraph.edges },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dependency-cohorts-${bundle.scan.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dependency Map"
        description="Advisory, air-gapped dependency analysis. Missing edges never prove independence; the browser never retrieves manifests or source."
        primaryAction={
          <label className="cursor-pointer">
            <Button
              as="span"
              variant="primary"
              size="small"
              leadingVisual={UploadIcon}
            >
              Load local dependency JSON
            </Button>
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                try {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setImported(parseLocalGraph(JSON.parse(await file.text())));
                  setError(null);
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : 'Invalid dependency file.',
                  );
                }
              }}
            />
          </label>
        }
        secondaryActions={
          <>
            <Button
              size="small"
              leadingVisual={DownloadIcon}
              onClick={exportCohorts}
            >
              Export cohorts JSON
            </Button>
            <Button
              size="small"
              leadingVisual={DownloadIcon}
              onClick={() =>
                downloadCsv(
                  `dependency-edges-${bundle.scan.id}.csv`,
                  [
                    'From,To,Type,Ecosystem,Confidence,Method',
                    ...filteredGraph.edges.map((e) =>
                      [
                        e.fromNodeId,
                        e.toNodeId,
                        e.relationshipType,
                        e.ecosystem ?? '',
                        e.confidence,
                        e.evidenceMethod,
                      ]
                        .map(sanitizeCsvField)
                        .join(','),
                    ),
                  ].join('\r\n'),
                )
              }
            >
              Export edges CSV
            </Button>
          </>
        }
      />
      {error && (
        <Flash variant="danger">
          <div className="text-sm">{error}</div>
        </Flash>
      )}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Nodes" value={filteredGraph.nodes.length} />
        <MetricCard label="Edges" value={filteredGraph.edges.length} />
        <MetricCard
          label="Critical hubs"
          value={insights.hubs.filter((h) => h.fanIn + h.fanOut >= 5).length}
        />
        <MetricCard
          label="Orphans"
          value={insights.orphans.length}
          tone="warning"
        />
        <MetricCard
          label="Cycles"
          value={insights.cycles.length}
          tone="warning"
        />
        <MetricCard
          label="Low confidence"
          value={insights.lowConfidenceEdges.length}
          tone="warning"
        />
      </div>
      <FilterToolbar className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex items-center gap-2">
          <span>Search</span>
          <TextInput
            leadingVisual={SearchIcon}
            type="search"
            aria-label="Search nodes"
            placeholder="Search nodes…"
            size="small"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex items-center gap-2">
          <span>Confidence</span>
          <Select
            size="small"
            aria-label="Filter by confidence"
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
          >
            <Select.Option value="all">All</Select.Option>
            <Select.Option value="high">High</Select.Option>
            <Select.Option value="medium">Medium</Select.Option>
            <Select.Option value="low">Low</Select.Option>
          </Select>
        </label>
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex items-center gap-2">
          <span>Traversal depth</span>
          <TextInput
            type="number"
            min="1"
            max="8"
            aria-label="Traversal depth"
            size="small"
            className="w-20"
            value={String(depth)}
            onChange={(e) =>
              setDepth(Math.max(1, Math.min(8, Number(e.target.value))))
            }
          />
        </label>
        <div className="flex items-center gap-1">
          <Button
            size="small"
            leadingVisual={ZoomOutIcon}
            onClick={() => setZoom(Math.max(0.5, zoom - 0.2))}
          >
            Zoom −
          </Button>
          <Button
            size="small"
            leadingVisual={ZoomInIcon}
            onClick={() => setZoom(Math.min(1.8, zoom + 0.2))}
          >
            Zoom +
          </Button>
          <Button size="small" onClick={() => setZoom(1)}>
            Fit
          </Button>
        </div>
      </FilterToolbar>
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div>
          <DependencyCanvas
            graph={filteredGraph}
            selectedId={selectedId}
            zoom={zoom}
          />
          <p className="mt-2 text-xs text-[var(--fgColor-muted)]">
            Deterministic overview. Dashed amber edges are low confidence; amber
            nodes are external. Use the synchronized table for keyboard access.
          </p>
        </div>
        <SurfaceCard className="p-5">
          <h3 className="font-bold">Selection & traversal</h3>
          {selected ? (
            <div className="mt-3 space-y-2 text-sm">
              <p className="text-lg font-semibold">{selected.label}</p>
              <p>Direct dependencies: {outgoing.length}</p>
              <p>Reverse dependencies: {incoming.length}</p>
              <p>
                Transitive within depth {depth}: {transitive.length}
              </p>
              <ul className="max-h-52 overflow-auto">
                {transitive.map((id) => (
                  <li key={id}>{nodeMap.get(id)?.label ?? id}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--fgColor-muted)]">
              Select a repository from the accessible table.
            </p>
          )}
        </SurfaceCard>
      </div>
      <VirtualizedTable
        ariaLabel="Dependency repository list"
        rows={rows}
        columns={columns}
        getRowKey={(n) => n.id}
        emptyMessage="Load a local dependency map or collect first-party dependency entities."
        minWidth={950}
      />
      <SurfaceCard className="p-5">
        <h3 className="font-bold text-sm text-[var(--fgColor-default)]">
          Advisory migration cohorts
        </h3>
        <p className="text-sm text-[var(--fgColor-muted)]">
          Cycles stay together; connected repositories are grouped to reduce
          boundary risk. Reorder and annotate in memory.
        </p>
        <div className="mt-4 space-y-3">
          {cohorts.map((cohort, index) => (
            <div
              key={cohort.id}
              className="rounded border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] p-3"
            >
              <div className="flex items-center gap-2">
                <strong>Wave {index + 1}</strong>
                <Label size="small" variant="accent">
                  Advisory
                </Label>
                <div className="ml-auto flex items-center gap-1">
                  <IconButton
                    size="small"
                    variant="invisible"
                    aria-label={`Move wave ${index + 1} up`}
                    icon={ArrowUpIcon}
                    disabled={!index}
                    onClick={() =>
                      setCohorts((items) => {
                        const copy = [...items];
                        [copy[index - 1], copy[index]] = [
                          copy[index]!,
                          copy[index - 1]!,
                        ];
                        return copy;
                      })
                    }
                  />
                  <IconButton
                    size="small"
                    variant="invisible"
                    aria-label={`Move wave ${index + 1} down`}
                    icon={ArrowDownIcon}
                    disabled={index === cohorts.length - 1}
                    onClick={() =>
                      setCohorts((items) => {
                        const copy = [...items];
                        [copy[index], copy[index + 1]] = [
                          copy[index + 1]!,
                          copy[index]!,
                        ];
                        return copy;
                      })
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-[var(--fgColor-muted)] mt-1">
                {cohort.nodeIds.length} nodes · {cohort.rationale}
              </p>
              <TextInput
                block
                size="small"
                aria-label={`Wave ${index + 1} rationale`}
                className="mt-2"
                value={cohort.rationale}
                onChange={(e) =>
                  setCohorts((items) =>
                    items.map((item, i) =>
                      i === index
                        ? { ...item, rationale: e.target.value }
                        : item,
                    ),
                  )
                }
              />
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );
}
