## 2023-10-05 - Performance Optimization Discovery

**Learning:** Found an O(n^2) search operation in `packages/discovery/src/collectors/packages.ts`. When processing packages, it looks up the associated repository for each package by calling `.find()` on the `repos` array. This is extremely inefficient, especially if there are many repositories and packages, because `repos` can be quite large.
**Action:** Can replace this with an O(1) hash map lookup. Create a `Map` of repositories by name before processing the packages.

## 2023-10-06 - [Optimized formatters O(N) array search with WeakMap]

**Learning:** In frontend list views, formatting components often perform `Array.prototype.find()` lookups on dictionary arrays (like organizations or metadata). This leads to O(N \* M) performance scaling issues when rendering large tables.
**Action:** Used `WeakMap` keyed by the source dictionary array to cache an O(1) `Map` lookup table. This ensures O(N + M) complexity and allows the cache to be safely garbage-collected once the bundle object reference is dropped.

## 2024-05-15 - React Component Render Optimization

**Learning:** In React components rendering large tables/lists (like `DependencyMapTab`), mapping over arrays to find elements (using `.find()`) inside the render loop leads to O(N^2) complexity, causing significant UI lag on large datasets. Re-renders will hit this lookup multiple times, magnifying the problem.
**Action:** Always precompute a `Map` (using `useMemo` so it's not recreated on every render unless dependencies change) for O(1) lookups inside the render loop when searching arrays.

## 2024-05-16 - O(N\*M) Unmemoized Multiple Array Passes in Render Loop

**Learning:** When generating metrics or aggregating counts from a large dataset for UI cards (like `MetricCard`), performing multiple `.filter(...).length` and `.reduce(...)` passes over the exact same array within the render loop leads to severe performance degradation due to redundant iterations, especially when these computations are triggered repeatedly by state updates like search inputs.
**Action:** Replace multiple sequential array passes with a single `useMemo` block that iterates through the data once, tracking all necessary metric counters in a single pass (O(N)), avoiding redundant array allocations and operations.

## 2024-05-17 - O(N\*M) Multiple Array Passes in UI Render Loops

**Learning:** Just like `MetricCard` earlier, generating complex UI configurations (such as export tables or charts) that require different filtered lengths from a single large list (`bundle.entities`) frequently defaults to multiple `.filter(...).length` iterations. In `ExportCenterTab.tsx`, 6 unmemoized passes over `bundle.entities` were being performed to compute basic metadata rows limits for CSVs. This results in severe UI blocking lag due to 6x O(N) evaluations in rendering paths when users zoom/filter scope.
**Action:** Replaced multiple filter queries with a single, grouped pass (`for...of`) and a `counts` dictionary within a single `useMemo` block. Memoize the top level configurations output referencing the computed properties.

## 2024-05-17 - Decouple Sorting from Data Aggregation

**Learning:** When sorting a list of dynamically generated complex data (e.g., aggregated metrics using `.reduce()` and `.filter()`), keeping the generation logic and sorting logic in a single `useMemo` causes the expensive operations to run unnecessarily every time the user just clicks to reverse the sorting direction.
**Action:** Decouple the sorting block into its own `useMemo` block separate from the array data processing logic, taking the calculated `rawRows` array as a dependency.

## 2024-05-18 - Safe String Nullability in React

**Learning:** Extracting `query.toLowerCase()` outside of `.filter()` to prevent O(N) operations is a great optimization, but be extremely careful with strings that might be implicitly null or undefined. The previous implementation relied on the `!query || ...` short-circuit guard.
**Action:** When extracting functions out of a loop/filter, always ensure you use optional chaining and null coalescing (e.g. `query?.toLowerCase() ?? ""`) to guarantee safety.

## 2024-05-18 - Optimize Node Lookup in Graph Iteration

**Learning:** React component re-renders that filter over large collections of graph edges repeatedly (e.g. `graph.edges.filter(e => e.toNodeId === id)`) lead to O(E) complexity and noticeable lag on large datasets.
**Action:** Always precompute lookups or use `buildDependencyIndex` to transform the structure and cache relationships as Maps for O(1) rendering lookups.
