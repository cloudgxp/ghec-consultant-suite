## 2023-10-05 - Performance Optimization Discovery

**Learning:** Found an O(n^2) search operation in `packages/discovery/src/collectors/packages.ts`. When processing packages, it looks up the associated repository for each package by calling `.find()` on the `repos` array. This is extremely inefficient, especially if there are many repositories and packages, because `repos` can be quite large.
**Action:** Can replace this with an O(1) hash map lookup. Create a `Map` of repositories by name before processing the packages.
