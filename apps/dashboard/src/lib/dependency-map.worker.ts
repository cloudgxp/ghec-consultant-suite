/// <reference lib="webworker" />
import {
  dependencyInsights,
  suggestMigrationCohorts,
  type DependencyGraph,
} from '@ghec/analysis';
self.onmessage = (event: MessageEvent<{ graph: DependencyGraph }>) => {
  // Defensive origin check: dedicated workers only accept messages from own origin or empty origin
  if (event.origin && event.origin !== self.location.origin) {
    return;
  }
  if (
    !event.data ||
    typeof event.data !== 'object' ||
    !('graph' in event.data)
  ) {
    return;
  }

  const started = performance.now();
  self.postMessage({
    insights: dependencyInsights(event.data.graph),
    cohorts: suggestMigrationCohorts(event.data.graph),
    durationMs: performance.now() - started,
  });
};
