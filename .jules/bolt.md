## 2023-10-05 - Performance Optimization Discovery

**Learning:** Found an O(n^2) search operation in `packages/discovery/src/collectors/packages.ts`. When processing packages, it looks up the associated repository for each package by calling `.find()` on the `repos` array. This is extremely inefficient, especially if there are many repositories and packages, because `repos` can be quite large.
**Action:** Can replace this with an O(1) hash map lookup. Create a `Map` of repositories by name before processing the packages.

## 2023-10-06 - [Optimized formatters O(N) array search with WeakMap]

**Learning:** In frontend list views, formatting components often perform `Array.prototype.find()` lookups on dictionary arrays (like organizations or metadata). This leads to O(N * M) performance scaling issues when rendering large tables.
**Action:** Used `WeakMap` keyed by the source dictionary array to cache an O(1) `Map` lookup table. This ensures O(N + M) complexity and allows the cache to be safely garbage-collected once the bundle object reference is dropped.

## 2024-05-15 - React Component Render Optimization

**Learning:** In React components rendering large tables/lists (like `DependencyMapTab`), mapping over arrays to find elements (using `.find()`) inside the render loop leads to O(N^2) complexity, causing significant UI lag on large datasets. Re-renders will hit this lookup multiple times, magnifying the problem.
**Action:** Always precompute a `Map` (using `useMemo` so it's not recreated on every render unless dependencies change) for O(1) lookups inside the render loop when searching arrays.

## 2024-05-16 - O(N*M) Unmemoized Multiple Array Passes in Render Loop

**Learning:** When generating metrics or aggregating counts from a large dataset for UI cards (like `MetricCard`), performing multiple `.filter(...).length` and `.reduce(...)` passes over the exact same array within the render loop leads to severe performance degradation due to redundant iterations, especially when these computations are triggered repeatedly by state updates like search inputs.
**Action:** Replace multiple sequential array passes with a single `useMemo` block that iterates through the data once, tracking all necessary metric counters in a single pass (O(N)), avoiding redundant array allocations and operations.

## 2024-05-18 - Safe String Nullability in React

**Learning:** Extracting `query.toLowerCase()` outside of `.filter()` to prevent O(N) operations is a great optimization, but be extremely careful with strings that might be implicitly null or undefined. The previous implementation relied on the `!query || ...` short-circuit guard.
**Action:** When extracting functions out of a loop/filter, always ensure you use optional chaining and null coalescing (e.g. `query?.toLowerCase() ?? ""`) to guarantee safety.
