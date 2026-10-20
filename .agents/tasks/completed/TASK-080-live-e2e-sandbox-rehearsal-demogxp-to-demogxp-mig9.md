---
id: TASK-080
title: 'Live E2E Sandbox Rehearsal Migration (demogxp -> demogxp-mig9) & Reporting Audit'
status: completed
owner: agent
created_at: 2026-10-19
completed_at: 2026-10-19
dependencies:
  - TASK-078
  - TASK-079
packages_affected:
  - '@ghec/migration'
  - 'ghec-consultant-cli'
---

# TASK-080: Live E2E Sandbox Rehearsal Migration (demogxp -> demogxp-mig9) & Reporting Audit

## 1. Objective & Context

Execute a complete end-to-end Sandbox Rehearsal migration from `demogxp` to `demogxp-mig9` using GitHub Actions workflows (`generate-scope.yml` and `migration-e2e-autonomous.yml`) with `sandbox_rehearsal=true`, fix any code or workflow issues in a closed loop until 100% green (`0` failed operations, `0` verification discrepancies, `0` broken relative Markdown links), verify live sandbox state on both `demogxp` and `demogxp-mig9`, and thoroughly audit and fix all generated reports and the `demogxp-mig9/migration-audit-results` repository.

## 2. Dependencies & Prerequisites

- [x] Upstream tasks `TASK-078` and `TASK-079` implemented in working tree
- [x] Local quality gate (`npm run check`) passes and changes pushed to `main`
- [x] Target organization `demogxp-mig9` verified accessible

## 3. Scope of Changes

Expected files or directories to create or modify:

- `.github/workflows/migration-e2e-autonomous.yml`
- `packages/migration/src/modules/actions-policies/module.ts`
- `packages/migration/src/modules/gei-repo/module.ts`
- `packages/migration/src/reporting/types.ts`
- `packages/migration/src/reporting/step-summary.ts`
- `packages/migration/src/reporting/summary-reporter.ts`
- `packages/migration/src/reporting/results-generator.ts`
- `packages/migration/src/reporting/results-markdown-formatter.ts`
- `packages/migration/src/reporting/post-care-generator.ts`
- `apps/cli/src/commands/agent-review.ts`
- `apps/cli/src/commands/migrate.ts`
- `apps/cli/src/commands/verify.ts`
- `apps/cli/src/commands/publish-results.ts`
- `packages/migration/tests/modules/actions-policies.test.ts`
- `packages/migration/tests/modules/gei-repo.test.ts`
- `packages/migration/tests/reporting/post-care-generator.test.ts`
- `packages/migration/tests/reporting/results-generator.test.ts`
- `packages/migration/tests/reporting/summary.test.ts`
- `apps/cli/tests/agent-review.test.ts`

## 4. Implementation Checklist

- [x] **Phase 1: Task Tracking, Pre-Flight Fixes & Push to `main`**
  - Enrich `ActionsPoliciesMigrationModule.apply()` results with `resourceType`, `resourceName`, `operationType`, and `reason`, and align sandbox rehearsal `resourceName` across `update` and `noop` operations.
  - Keep `GeiRepoMigrationModule` 1-operation-per-repository invariant while disabling target repository Actions (`PUT /repos/{owner}/{repo}/actions/permissions` `{ enabled: false }`) and recording the sandbox rehearsal note in the repository operation `reason`.
  - Propagate `sandboxRehearsal` through `MigrationRunSummary`, `formatStepSummaryMarkdown`, `formatResultsReadmeMarkdown`, `generatePostCareDeliverables`, and `publish-results` (`🛡️ Sandbox Rehearsal`).
  - Run `npm run check`, verify `demogxp-mig9` accessibility, and commit/push to `main` (PR `#141`, commit `d884154`).
- [x] **Phase 2: Scope Generation (`generate-scope.yml`) with `sandbox_rehearsal=true`**
  - Trigger `.github/workflows/generate-scope.yml` (`run 39337118881`) for `demogxp` -> `demogxp-mig9` with `sandbox_rehearsal=true`.
  - Download `migration-scopes` artifact and verify `"sandboxRehearsal": true` at root, org, and repo levels, all 35/35 repositories (24 active + 11 archived), `modules: ["auto"]`, and `orgItemsMode: "all"`.
- [x] **Phase 3: Live Sandbox Rehearsal Execution (`migration-e2e-autonomous.yml`) & Closed-Loop Bug Fixing**
  - Trigger `.github/workflows/migration-e2e-autonomous.yml` (`run 39337466419`) with `scope_run_id="latest"`, `target_type="ghec"`, `modules="auto"`, `dry_run="false"`, `sandbox_rehearsal="true"`.
  - Monitor all jobs (`slicer`, `migrate-cohorts`, `verification-and-remediation`); all 16 workflow jobs succeeded with `35/35` repositories migrated (`100%`), `34/34` modules verified (`0` discrepancies), and `578/578` operations succeeded (`0` failed).
- [x] **Phase 4: Live Sandbox State Verification & Deep Reporting Audit**
  - Confirmed via GitHub API: `0` repos locked/modified on `demogxp` (`lockedSourceRepoCount: 0`); `enabled_repositories === "none"` on `demogxp-mig9`; all `35/35` migrated repos on `demogxp-mig9` have Actions `enabled === false`; all org (`2/2`) and repo (`1/1`) webhooks on `demogxp-mig9` have `active === false`; all `11/11` archived source repos are `archived === true` on `demogxp-mig9`.
  - Cloned and audited `demogxp-mig9/migration-audit-results` (`809` files: `720` Markdown files, `17` CSV exports, `30` JSON files; `2,874` relative Markdown links verified with `0` broken links).
  - Fixed healed `gei-repo-error-*` operation reason normalization in `results-generator.ts`, added Sandbox Rehearsal webhook safety prose to `POST-CARE-CHECKLIST.md` (`post-care-generator.ts`), improved `agent-review.ts` remediation ordering (`gei-repo` before `repo-settings`) and `healedModuleTargets` suppression across rounds, added unit tests (`810/810` passing), and re-published `demogxp-mig9/migration-audit-results` (`53d4cc9`).

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
# Full repository verification gate
npm run check

# Targeted unit tests
node --import tsx --test packages/migration/tests/modules/actions-policies.test.ts packages/migration/tests/modules/gei-repo.test.ts packages/migration/tests/reporting/summary.test.ts packages/migration/tests/reporting/post-care-generator.test.ts packages/migration/tests/reporting/results-generator.test.ts apps/cli/tests/agent-review.test.ts apps/cli/tests/workflow-gates.test.ts
```

## 6. Completion Summary & Evidence

- **Completed At:** `2026-10-19`
- **Workflow Runs:**
  - `generate-scope.yml`: Run [`39337118881`](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/39337118881) — generated `demogxp-to-demogxp-mig9-all.json` with `sandboxRehearsal: true` at root, organization, and all `35/35` repositories (`24` active + `11` archived).
  - `migration-e2e-autonomous.yml`: Run [`39337466419`](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/39337466419) — all 16 jobs (`slicer`, 7 `cohort-massive-*`, 7 `cohort-standard-*`, and `Phase 3 & 4: Verification & Autonomous Closed-Loop Self-Healing`) succeeded with `0` failed operations and `0` verification discrepancies (`34/34` modules verified).
- **Live Sandbox State Verification (`demogxp` & `demogxp-mig9`):**
  - Source org `demogxp`: `35` repositories, `0` locked (`lockedSourceRepoCount: 0`).
  - Target org `demogxp-mig9`: Organization Actions policy `enabled_repositories === "none"` (`actions-policies` verified `0` discrepancies).
  - Target repositories (`35/35`): All `35/35` migrated repositories verified `enabled === false` on `/repos/demogxp-mig9/{repo}/actions/permissions`.
  - Target webhooks: `2/2` organization webhooks (`org-webhooks`) and `1/1` repository webhook (`demogxp-mig9/ghec-content-filler`) verified `active === false`.
  - Target archived repositories (`11/11`): `TypeScript`, `WebKit`, `grafana`, `kubernetes`, `linux`, `llvm-project`, `next.js`, `nixpkgs`, `node`, `runner`, and `rust` all restored to `archived === true` after downstream module migration.
- **Audit Repository (`demogxp-mig9/migration-audit-results`):**
  - Published and audited at commit `53d4cc9`: `809` total files (`720` `.md`, `17` `.csv`, `30` `.json`), `2,874` relative Markdown links verified (`0` broken links), `35/35` `gei-repo` rows, `2/2` `org-webhooks` rows, `1/1` `webhooks` row, and `1/1` `actions-policies` row all accurately describing sandbox rehearsal disabled states.
- **Local Verification Gate (`npm run check`):**
  - `lint`, `typecheck`, `build`, and `test` all passed cleanly (`810/810` unit tests across `134` suites, `0` failures).
