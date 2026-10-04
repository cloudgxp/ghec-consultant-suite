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

- **Process (The 7-Stage Pipeline):**
  1. **Stage 1 (Preflight):** Validates `discovery.json`, runs sizing checks (git-sizer, 40 GiB repo size, 2 GiB commit, 255-byte ref length, 400 MiB file limits), release asset sizing, and LFS detection.
  2. **Stage 2 (Target Preparation):** Inspects destination organization/enterprise rulesets (asserting "Repository migrations" is in **Exempt** bypass mode), IP allow lists, GHAS license, and repository name availability.
  3. **Stage 3 (GEI Execution):** Spawns GEI process wrapper (`gh gei migrate-repo`), passing `--skip-releases` if release assets exceed 10 GiB or metadata exceeds 40 GiB, and `--target-repo-visibility`.
  4. **Stage 4 (Specialized Strategies):** Executes non-CRUD transfers: Git LFS dual-remote streaming (`git lfs fetch`/`push`) and Release fallback streaming if releases were skipped.
  5. **Stage 5 (Post-GEI API Rehydration):** Re-hydrates scoped API modules (`repo-variables`, `repo-secrets`, `rulesets`, `branch-protection` reconciliation, `environments`, `repo-custom-properties`).
  6. **Stage 6 (Post-Migration Reconciliations):** Reconciles repository visibility, re-enables webhooks with secret rehydration, runs mannequin bulk reclamation with `--skip-invitation`, and repairs CODEOWNERS team references.
  7. **Stage 7 (Verification & Audit):** Runs verification passes across target state, evaluates soundness, and writes `verification-report.json`.
- **Checkpointing:** State saved per stage and repository in `./migrations/.checkpoint-<runId>/`.

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
