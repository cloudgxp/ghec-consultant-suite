## 2023-10-05 - Performance Optimization Discovery

**Learning:** Found an O(n^2) search operation in `packages/discovery/src/collectors/packages.ts`. When processing packages, it looks up the associated repository for each package by calling `.find()` on the `repos` array. This is extremely inefficient, especially if there are many repositories and packages, because `repos` can be quite large.
**Action:** Can replace this with an O(1) hash map lookup. Create a `Map` of repositories by name before processing the packages.

## 2023-10-06 - [Optimized formatters O(N) array search with WeakMap]

**Learning:** In frontend list views, formatting components often perform `Array.prototype.find()` lookups on dictionary arrays (like organizations or metadata). This leads to O(N * M) performance scaling issues when rendering large tables.
**Action:** Used `WeakMap` keyed by the source dictionary array to cache an O(1) `Map` lookup table. This ensures O(N + M) complexity and allows the cache to be safely garbage-collected once the bundle object reference is dropped.
