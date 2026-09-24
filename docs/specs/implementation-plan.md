# Implementation Plan and Verification Gates

**PLAN-001.** Status changes require implementation and recorded acceptance evidence. Build success alone never completes a live capability. All live phases are deferred in this task.

---

## 1. Engineering Phases and Release Status

See the authoritative [Phased Implementation Roadmap](phased-roadmap.md) for detailed collector-level progression.

| Phase                              | Current Status                       | Deliverables / Completion Gate                                                                                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Workspace Setup**             | Implemented (Verified)               | npm workspaces, strict TS, lint/format, CLI binary, Vite/React/Tailwind/DaisyUI shell; clean install/build/check.                                                                                                                                                                        |
| **2. Contracts & Fixtures**        | Implemented (Verified)               | v1.0.0 schema, semantic validation, and fictional fixtures; contract positives/negatives and privacy-field rejection.                                                                                                                                                                    |
| **3. CLI Framework**               | Scaffolded                           | Offline syntax parser and help exist; manifest-driven collector registry integration designed; mock command tests pass.                                                                                                                                                                  |
| **4. Permission Model & Research** | **Fully Specified**                  | Pinned primary sources recorded in [source-manifest.json](../../research/github/source-manifest.json); 776 operations inventoried in [endpoint-inventory.json](../../research/github/endpoint-inventory.json); verified offline via [validate.py](../../scripts/collectors/validate.py). |
| **5. Collector Specifications**    | **Fully Specified (237 Collectors)** | 237 planned collectors specified in [collector-catalog.md](collector-catalog.md) and `docs/specs/collectors/`; manifest schemas verified; dependency DAG acyclic. Live collection is deferred.                                                                                           |
| **6. Core Anchors (Phase C1)**     | **Planned Next Step**                | Implement `rest.orgs.get`, `rest.repos.list-for-org`, and `rest.repos.get` with live Octokit adapter in synthetic test org.                                                                                                                                                              |
| **7. Default Metadata (Phase C2)** | Specified                            | 234 default configuration collectors (Actions, branch protection, rulesets, secrets metadata, teams, code security).                                                                                                                                                                     |
| **8. Dashboard Ingestion**         | Static Shell Scaffolded              | Implement import validation and explicit error/partial states, inventory/navigation/filtering; offline validation.                                                                                                                                                                       |
| **9. Analysis Engine**             | Interface Scaffolded                 | Approved evidence-backed rules, unknown semantics, target-specific thresholds; deterministic tests.                                                                                                                                                                                      |
| **10. CSV/PDF Reporting**          | Specified                            | CSV injection-safe export, jsPDF local reporting, redacted scoped content; accessibility checks.                                                                                                                                                                                         |
| **11. Security Hardening**         | Specified                            | Credential isolation, allowlists, diagnostics, write restrictions, cancellation, resource limits and dependency review.                                                                                                                                                                  |
| **12. End-to-End Validation**      | Specified                            | Synthetic test orgs → CLI → bundle → offline dashboard → reports; zero credential or mutation leakage.                                                                                                                                                                                   |

---

## 2. Dependency Order and Execution Flow

```text
Workspace & Contracts → Collector Registry & Specs (Completed)
  → Read Adapter & Phase C1 Core Anchors
  → Phase C2 Configuration Collectors
  → Dashboard Bundle Import & Analysis
  → CSV / PDF Local Exports
  → Security Hardening & End-to-End Synthetic Validation
```

Release is release-blocked until security and end-to-end gates pass. Do not use the scaffold on customer data.

---

## 3. Implementation Exit Criteria

**PLAN-RELEASE-001.** A phase is verified only when its requirement IDs are mapped to executed tests and review artifacts. Release notes must disclose implemented modules and exclusions; no unverified permission capability may ship as verified.

**PLAN-LIVE-001.** Live tests use explicit operator authorization and synthetic resources, separate from default tests. CI never requires customer credentials; read-only review, field allowlist review, and safe output review precede any live execution.

**PLAN-NEXT-001.** Recommended immediate implementation target: **Phase C1 (Core Anchors)**. Implement the HTTP read adapter and the 3 anchor collectors (`rest.orgs.get`, `rest.repos.list-for-org`, `rest.repos.get`) to validate live pagination, rate-limit backoff, and data contract compliance against a synthetic organization.
