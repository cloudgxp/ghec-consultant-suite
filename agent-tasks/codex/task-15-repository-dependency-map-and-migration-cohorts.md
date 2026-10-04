# Task DASH-15: Repository Dependency Map, Blast Radius & Migration Cohorts

## Objective

Add an interactive dependency-analysis workspace that turns repository relationships into migration sequencing, blast-radius, and ownership insights at enterprise scale.

## Reference Findings

The public `mona-actions/gh-repomap-dashboard` includes capabilities missing here: a 10,000+ repository WebGL graph; rich filters; direct, reverse, and transitive drill-down; critical/orphan repository insights; weak and strong connected groups; and migration cohort guidance.

Adopt and independently validate those product concepts—do not copy source or Primer styling. Use this dashboard's Tailwind/DaisyUI system and air-gapped bundle model.

## Pages & Features

### 1. Dependency Map Page

Add **Assess → Dependency Map** with synchronized:

- **Graph:** zoom, pan, fit, search, selection, neighbor highlighting, legend, viewport controls, and deterministic layout.
- **Repository List:** virtualized inventory sharing graph filters and selection.
- **Insights:** critical hubs, fan-in/out, orphans, cycles/strong components, weak components, cross-organization edges, and low-confidence relationships.

### 2. Detail and Traversal

Provide direct, reverse, and bounded transitive dependencies; relationship type/ecosystem/confidence/provenance; cycle-safe depth controls; connected-group focus; and deep links to repository, package, Actions, ownership, and readiness pages.

### 3. Migration Cohort Planner

Suggest cohorts from connected groups, cycles, boundaries, size, and blocker severity. Consultants can reorder waves and annotate rationale in memory. Explain every grouping, label suggestions advisory, and export cohorts/edges to CSV or JSON without mutating GitHub.

### 4. Contract and Input Strategy

- Model dependency nodes and directed edges with stable IDs, relationship type, ecosystem, confidence, provenance, and evidence method.
- Support a reviewed `gh-repo-map`-compatible local file merged by stable repository identity, or first-party dependency entities when available.
- Never scan local checkouts or retrieve manifests/source from the browser.
- Distinguish external/unscanned nodes and never treat a missing edge as proven independence.

### 5. Scale and Accessibility

Build graph indexes in a Web Worker; target 10,000 repositories and 100,000 edges. Use WebGL/canvas only for the visual graph and retain a keyboard-accessible DOM list/table, nonvisual summaries, reduced motion, high contrast, and no color-only encoding. Bundle libraries locally with no network requests.

## Target Files

- `packages/contracts/src/index.ts` or a versioned dependency-map schema
- `packages/analysis/src/dependency-graph.ts` _(new)_
- `apps/dashboard/src/navigation.ts`
- `apps/dashboard/src/features/DependencyMapTab.tsx` _(new)_
- `apps/dashboard/src/components/dependency-map/*` _(new)_
- `apps/dashboard/src/lib/dependency-map.worker.ts` _(new)_
- `apps/dashboard/src/lib/importer.ts`
- Export, fixture, performance, algorithm, accessibility, and UI tests

## Acceptance Criteria

1. Users can load local dependency data and explore synchronized graph, list, and insight views.
2. Direct, reverse, transitive, cycle, weak-component, and strong-component results pass deterministic tests.
3. Critical, orphan, external, and low-confidence nodes have textual distinctions.
4. Suggested cohorts are explainable, editable, and exportable without source mutations.
5. The page remains interactive at 10,000 nodes and 100,000 edges within documented budgets.
6. Every graph workflow has a keyboard-accessible list/table alternative.
7. No dependency, font, telemetry, manifest, or source request leaves the browser.

## Dependencies & Sequence

Build after DASH-11 and DASH-14 establish package and ownership relationships. Schema/algorithm work may proceed in parallel with the graph prototype.
