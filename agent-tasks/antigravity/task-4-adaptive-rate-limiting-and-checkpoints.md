# Task CLI-4: Adaptive Rate Limiting, Backoff & Resilient Checkpointing

## Objective

Implement adaptive concurrency and throttling based on GraphQL point costs and REST quotas, along with a disk-based checkpointing mechanism to pause and resume long-running enterprise discovery scans.

---

## Business & Technical Rationale

Discovering large GitHub Enterprise Cloud instances involves thousands of repositories and tens of thousands of entities.

- GitHub applies both **primary rate limits** (GraphQL points per hour, REST requests per hour) and **secondary rate limits** (concurrent requests and CPU consumption triggers). Exceeding these triggers an HTTP 403 or 429 with `retry-after`.
- If an enterprise scan encounters network disruption or rate-limit exhaustion after 90 minutes of execution, losing all intermediate progress in memory is unacceptable.
- The CLI needs an adaptive throttling engine that slows down before hitting zero points and a checkpointing/resume mechanism allowing scans to continue from the last successful module.

---

## Technical Specifications & Scope

### 1. Adaptive GraphQL & REST Throttling

Update [apps/cli/src/github/http.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/github/http.ts):

- Track both GraphQL rate limit points and REST quotas:
  - After every GraphQL query, inspect `rateLimit { remaining, resetAt, cost }`.
  - After every REST call, inspect `x-ratelimit-remaining` and `x-ratelimit-reset`.
- Implement dynamic pacing:
  - If `remaining < 500` points/requests: reduce concurrency to 1 and inject a 500ms sleep between requests.
  - If `remaining < 100` points/requests: calculate time until `resetAt` and pause execution (with informative terminal output), automatically resuming once the quota resets.
- Handle secondary rate limits (HTTP 429 or 403 with `retry-after` header):
  - Parse `retry-after` (seconds) and sleep until safe.
  - Apply exponential backoff with full jitter for 5xx server errors (maximum 4 retries, max cumulative delay 300 seconds).

### 2. Disk Checkpointing and State Persistence

Create `apps/cli/src/engine/checkpoint.ts`:

- Checkpoint directory: `./scans/.checkpoint-<runId>/`
  - Created with restricted permissions (`0700`).
  - Contains:
    - `manifest.json`: Scan configuration, started timestamp, target scope, completed modules by organization.
    - `entities-<org>-<module>.json`: Serialized entity arrays for completed collectors.
    - `executions-<org>.json`: Collector execution audit records.
- After each module finishes collection successfully, flush its result to the checkpoint directory atomically.

### 3. Scan Resume Capability (`--resume`)

Update [apps/cli/src/commands/discover.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/commands/discover.ts) and [apps/cli/src/engine/orchestrator.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/engine/orchestrator.ts):

- Add `--resume [checkpoint-id|latest]` flag.
- When `--resume` is specified:
  1. Locate the checkpoint directory.
  2. Verify configuration compatibility (target scope must match).
  3. Load previously collected entities and executions into memory.
  4. Skip already-completed collectors in the execution DAG.
  5. Continue execution only for pending or failed collectors.
- Upon successful bundle publication (`publishBundle`), cleanly remove the `.checkpoint-<runId>` directory.

### 4. Clean Interruption Handling (SIGINT)

- When the operator presses `Ctrl+C` (SIGINT):
  - Cancel in-flight network requests cleanly via `AbortController`.
  - Ensure the current checkpoint is flushed to disk.
  - Output message: `Discovery interrupted. Run can be resumed with: ghec-consultant-cli discover --resume <runId>`.
  - Exit with standard interruption code `130`.

---

## Target Files

- [apps/cli/src/github/http.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/github/http.ts)
- [apps/cli/src/engine/checkpoint.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/engine/) _(new file)_
- [apps/cli/src/engine/orchestrator.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/engine/orchestrator.ts)
- [apps/cli/src/commands/discover.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/commands/discover.ts)
- [apps/cli/tests/checkpoint.test.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/tests/) _(new file)_

---

## Acceptance Criteria

1. The adapter automatically throttles when remaining rate-limit points drop below 500, avoiding rate limit exhaustion.
2. An interrupted scan saves its state to `./scans/.checkpoint-<runId>/`.
3. Running `discover --resume <runId>` resumes collection without re-fetching completed collectors.
4. When a resumed scan finishes, a complete and valid bundle is published and the temporary checkpoint is removed.
5. SIGINT exits cleanly with exit code 130 and retains checkpoint data.
