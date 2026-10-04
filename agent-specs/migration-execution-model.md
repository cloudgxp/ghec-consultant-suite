# Specification: Migration Execution Model & Workflows

**Specification Status:** Authoritative Architectural Standard  
**Target:** Execution Workflows in `apps/cli` and `packages/migration`  
**Applicability:** All implementation agents (Antigravity & Codex)

---

## 1. Overview

The suite supports six standardized execution workflows designed to cater to both local interactive usage and automated CI/CD pipeline execution.

```text
1. discover only
2. plan using cached discovery
3. plan using live discovery
4. migrate using cached discovery
5. migrate using live discovery
6. apply pre-approved plan
7. verify only
8. resume interrupted migration
```

---

## 2. Detailed Execution Workflows

### 2.1 Workflow 1: Discover Only

Generates a portable, validated discovery snapshot of the source environment.

```bash
ghec-consultant-cli discover --modules all --organization my-source-org --output ./scans
```

- **Inputs:** Source credentials (`GHEC_SOURCE_TOKEN` or `GHEC_TOKEN`).
- **Target Client:** Not instantiated.
- **Output:** `ghec-discovery-organization-my_source_org-<timestamp>-<runId>.json`.
- **Exit Code:** `0` (complete) or `4` (partial).

---

### 2.2 Workflow 2: Plan Using Cached Discovery (Dry-Run)

Computes what changes _would_ be made without executing any mutations.

```bash
ghec-consultant-cli plan \
  --scope migration-scope.json \
  --input ./scans/discovery.json \
  --output ./plans/migration-plan.json
```

- **Inputs:** `migration-scope.json`, `discovery.json`, Target credentials.
- **Source Network Calls:** **Zero** (consumes cache).
- **Target Network Calls:** Read-only queries to discover current destination state.
- **Output:** Versioned, machine-readable `migration-plan.json`.
- **Exit Code:** `0` on success.

---

### 2.3 Workflow 3: Plan Using Live Discovery

Discovers source state dynamically and computes the migration plan in a single pass.

```bash
ghec-consultant-cli plan \
  --scope migration-scope.json \
  --modules repo-variables,rulesets \
  --output ./plans/migration-plan.json
```

- **Inputs:** Source credentials, Target credentials.
- **Source Network Calls:** Live discovery for the scoped modules.
- **Target Network Calls:** Read-only inspection of target state.
- **Output:** `migration-plan.json`.

---

### 2.4 Workflow 4: Migrate Using Cached Discovery

Executes migration using previously discovered evidence.

```bash
ghec-consultant-cli migrate \
  --scope migration-scope.json \
  --input ./scans/discovery.json \
  --modules repo-variables,rulesets
```

- **Process:**
  1. Validates `discovery.json`.
  2. Runs GEI repository migration for scoped repositories (`useGei: true`).
  3. Re-hydrates scoped API modules via Octokit against the target.
  4. Runs post-migration verification.
- **Checkpointing:** State saved per repository in `./migrations/.checkpoint-<runId>/`.

---

### 2.5 Workflow 5: Apply Pre-Approved Plan (Strict CI/CD Gate)

Consumes an already approved plan artifact (e.g. reviewed in a GitHub Pull Request).

```bash
ghec-consultant-cli migrate \
  --plan ./plans/migration-plan.json
```

- **Rule:** Executes **only** the operations explicitly listed in the plan.
- No re-discovery occurs, guaranteeing deterministic, auditable execution.

---

### 2.6 Workflow 6: Verify Only

Audits the destination organization or repository against expected baseline.

```bash
ghec-consultant-cli verify \
  --scope migration-scope.json \
  --plan ./plans/migration-plan.json
```

- Checks that all planned entities are in place, active, and matching values.
- Emits `verification-report.json`.

---

### 2.7 Workflow 7: Resuming Interrupted Migrations

If an execution fails or is interrupted by SIGINT (Ctrl+C):

```bash
ghec-consultant-cli migrate --resume <run-id>
```

- Reads `./migrations/.checkpoint-<run-id>/manifest.json`.
- Skips already-succeeded GEI migrations and API modules.
- Resumes execution at the exact failed module.

---

## 3. Self-Hosted Runner Focus & Multi-Day Cutover Model (DEC-007)

The suite is engineered primarily around **self-hosted runners** with persistent filesystem mounts rather than ephemeral GitHub-hosted runners:

### Why Self-Hosted Runners:

1. **Execution Duration:** Migrations involving many repositories or large Git LFS histories easily exceed standard 6-hour hosted runner execution limits.
2. **Persistent Caching:** Self-hosted runners maintain local disk state (`./scans/` and `./migrations/.checkpoint-<runId>/`), avoiding the fragility and size limits of GitHub Actions artifact transfer.
3. **Network Throughput & Proximity:** Self-hosted runners can be placed close to target VPCs or client networks with dedicated bandwidth.

### The Classic Weekend Cutover Model:

```text
┌─────────────────────────┐          ┌─────────────────────────┐          ┌─────────────────────────┐
│     Friday Evening      │          │     Saturday Morning    │          │     Saturday Afternoon  │
│                         │          │                         │          │                         │
│ 1. Run live discovery   │ ───────► │ 3. Review diff / plan   │ ───────► │ 5. Execute migration    │
│ 2. Generate plan & diff │          │ 4. Stakeholder approval │          │ 6. Verify destination   │
└────────────┬────────────┘          └─────────────────────────┘          └────────────┬────────────┘
             │                                                                         │
             ▼                                                                         ▼
   Cached on Persistent Runner Disk:                                       Verification Report &
   • ./scans/discovery.json                                                Live Cutover Complete
   • ./plans/migration-plan.json
```
