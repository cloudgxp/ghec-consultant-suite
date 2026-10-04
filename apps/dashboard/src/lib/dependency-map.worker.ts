/// <reference lib="webworker" />
import {
  dependencyInsights,
  suggestMigrationCohorts,
  type DependencyGraph,
} from '@ghec/analysis';
self.onmessage = (event: MessageEvent<{ graph: DependencyGraph }>) => {
  const started = performance.now();
  self.postMessage({
    insights: dependencyInsights(event.data.graph),
    cohorts: suggestMigrationCohorts(event.data.graph),
    durationMs: performance.now() - started,
  });
};
