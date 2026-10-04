# Task: Harden Web Worker Message Verification and Address Origin Checks

## Title

Defensively Harden Message Event Verification in Dashboard Web Workers (`apps/dashboard/src/lib/*.worker.ts`)

## Priority

**Low / Defense-in-Depth (Suspected CodeQL Static Analysis False Positive)**  
_Rationale:_ CodeQL rule `js/missing-origin-check` is designed to flag `window.postMessage` listeners on `window` or `iframe` contexts where untrusted third-party origins can post messages. In dedicated web workers (`DedicatedWorkerGlobalScope`), the worker is instantiated by a same-origin script via `new Worker(...)`, and the HTML Living Standard specifies that dedicated workers can only receive messages from their creator document (`event.origin` is empty string `""` or same-origin). While this is technically a false positive for dedicated workers, adding explicit origin guards and strict message shape validation strengthens defense-in-depth and clears the static analysis alerts.

---

## Related CodeQL Alerts

This single task remediates **2 open CodeQL alerts**:

| Alert Number | Rule ID                   | Severity         | File & Lines                                        | GitHub Alert Link                                                                        |
| :----------- | :------------------------ | :--------------- | :-------------------------------------------------- | :--------------------------------------------------------------------------------------- |
| **#12**      | `js/missing-origin-check` | Medium (Warning) | `apps/dashboard/src/lib/dependency-map.worker.ts:7` | [Alert #12](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/12) |
| **#13**      | `js/missing-origin-check` | Medium (Warning) | `apps/dashboard/src/lib/importer.worker.ts:23`      | [Alert #13](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/13) |

---

## False Positive Analysis & Justification

- **Standard Behavior:** According to MDN and the W3C/WHATWG Web Worker specification, `self.onmessage` in a dedicated worker only receives events dispatched via `worker.postMessage()` from the owner script. There is no cross-origin postMessage routing mechanism to a dedicated worker.
- **CodeQL Rule Design:** CodeQL's heuristic pattern matches any top-level `onmessage = (event) => { ... }` or `addEventListener('message', ...)` that does not inspect `event.origin`. Because it does not distinguish between `Window` and `DedicatedWorkerGlobalScope`, it generates false positive alerts on standard web workers.
- **Remediation Strategy:** Rather than simply dismissing the alert in GitHub Security, we can add a lightweight defensive check confirming `event.origin` conforms to the worker's execution context, along with type-guard validation of the incoming message data.

---

## Problem

In `apps/dashboard/src/lib/dependency-map.worker.ts`:

```typescript
self.onmessage = (event: MessageEvent<{ graph: DependencyGraph }>) => {
  const started = performance.now();
  self.postMessage({
    insights: dependencyInsights(event.data.graph),
    cohorts: suggestMigrationCohorts(event.data.graph),
    durationMs: performance.now() - started,
  });
};
```

In `apps/dashboard/src/lib/importer.worker.ts`:

```typescript
self.onmessage = async (event: MessageEvent<File>) => {
  try {
    post({ status: 'reading', progress: 5 });
    const text = await event.data.text();
    // ...
```

Neither worker checks `event.origin`, prompting CodeQL to flag CWE-345 / CWE-346.

---

## Root Cause

Static analysis pattern flagging `self.onmessage` event handlers lacking an origin validation clause.

---

## Relevant Code

- `apps/dashboard/src/lib/dependency-map.worker.ts`
- `apps/dashboard/src/lib/importer.worker.ts`

---

## Recommended Remediation

1. **Add Origin Guard Clause:**
   In both workers, add an explicit defensive guard checking `event.origin`:
   ```typescript
   // In Dedicated Workers, event.origin is either empty string "" or matches self.location.origin
   if (event.origin && event.origin !== self.location.origin) {
     return;
   }
   ```
2. **Add Message Payload Type Guards:**
   - In `dependency-map.worker.ts`, ensure `event.data && typeof event.data === 'object' && 'graph' in event.data` before passing to analysis algorithms.
   - In `importer.worker.ts`, ensure `event.data instanceof Blob || (event.data && typeof (event.data as any).text === 'function')` before calling `.text()`.

---

## Implementation Considerations

- **Worker Runtime:** In production bundled environments (Vite / Webpack), Web Workers may execute as blob URLs or relative scripts. Checking `if (event.origin && event.origin !== self.location.origin) return;` safely accommodates both dedicated worker defaults (`origin: ""`) and explicit origins without breaking execution.
- **Performance:** Origin checking in memory workers introduces virtually zero latency ($< 0.001\text{ms}$).

---

## Acceptance Criteria

- [x] Both worker files include defensive origin guard clauses.
- [x] Input message payloads are validated before processing.
- [x] Dashboard bundle import and dependency map calculations work without regressions.
- [x] CodeQL alerts #12 and #13 are resolved upon re-analysis.

### Implementation Notes

1. **Origin Verification Guards:** Added defensive check `if (event.origin && event.origin !== self.location.origin) return;` to `apps/dashboard/src/lib/dependency-map.worker.ts` and `apps/dashboard/src/lib/importer.worker.ts`.
2. **Strict Message Payload Validation:** Added type and shape validation for incoming worker events (`graph in event.data` in `dependency-map.worker.ts`, and `typeof text === 'function'` in `importer.worker.ts`) before processing.
3. **Verification:** Validated that dashboard builds and passes bundle limits and all tests pass cleanly. Resolves CodeQL alerts #12 and #13 (`js/missing-origin-check`).

---

## Testing Strategy

- **Worker Functional Tests:** Run dashboard tests in `apps/dashboard/tests/` to verify that worker messaging and report processing succeed.
- **Negative Test:** Send a synthetic message with a mismatched foreign origin and assert the handler safely ignores it.

---

## Validation Commands

```bash
# Run dashboard unit tests
npm test apps/dashboard/tests/

# Run monorepo check
npm run check

# CodeQL re-analysis verification
gh run list --workflow codeql --limit 5
gh run view <run-id>
gh api "repos/cloudgxp/ghec-consultant-suite/code-scanning/alerts?state=open" --jq 'map(select(.rule.id == "js/missing-origin-check")) | length'
```
