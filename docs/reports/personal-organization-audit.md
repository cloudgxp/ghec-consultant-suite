# Personal and Test Organization References Audit & Decision Report

**Report Generated:** 2026-10-05  
**Auditor:** Antigravity  
**Repository:** `cloudgxp/ghec-consultant-suite`  
**Status:** Under Review (Phase 3 Completed; Pending User Decision)

---

## 1. Executive Summary & Inventory

### 1.1 Purpose of Audit

This audit provides an exhaustive examination of hardcoded references to personal, synthetic, and test organization slugs across the repository. Specifically, this audit tracks:

- **`demogxp`**: Personal/source organization slug used during test migration dry-runs and live verification.
- **`antigravity-migration-test`**: Personal/target Enterprise Managed User (EMU) organization slug used as destination in test migrations.
- **`cloudgxp`**: Repository namespace and test target. All usages are explicitly isolated between **standard repository remote URLs** (e.g. `github.com/cloudgxp/ghec-consultant-suite`) and **synthetic/test tenant targets** (e.g., `cloudgxp-source`, `cloudgxp-emu-target`, or live read-only verification against `cloudgxp`).

The objective is to establish an actionable baseline for sanitizing the repository into an open-source, vendor-neutral consultant suite while preserving automated CI/CD checks (`npm run check`), test reproducibility, and historical auditability.

---

### 1.2 Global Occurrence Summary

| Pattern / Identifier               | Category Scope                                                                                              | Total Matches |     Tracked Files      | Gitignored / Untracked Files |
| :--------------------------------- | :---------------------------------------------------------------------------------------------------------- | :-----------: | :--------------------: | :--------------------------: |
| `demogxp`                          | Personal test source organization                                                                           |    **134**    | 15 files (134 matches) |     0 files (0 matches)      |
| `antigravity-migration-test`       | Personal test target EMU organization                                                                       |    **891**    | 14 files (103 matches) |    25 files (788 matches)    |
| `cloudgxp` (Synthetic / Test Org)  | Synthetic test target (`cloudgxp-source`, `cloudgxp-emu-target`, `jdoe_cloudgxp`) or live validation tenant |    **22**     |  3 files (16 matches)  |     2 files (6 matches)      |
| `cloudgxp` (Repository Remote URL) | Upstream repository remote URL, PRs, and CodeQL alert anchors                                               |    **135**    | 30 files (135 matches) |     0 files (0 matches)      |
| **Total Global Occurrences**       |                                                                                                             |   **1,182**   |  **44 tracked files**  |    **27 untracked files**    |

---

### 1.3 Inventory by File Category

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │ Tracked vs. Untracked Matches by Category                             │
  ├─────────────────────────────────────────┬──────────────┬───────────────┤
  │ Category                                │ Tracked      │ Untracked     │
  ├─────────────────────────────────────────┼──────────────┼───────────────┤
  │ Scope Definitions (`scopes/`)           │ 135 matches  │   0 matches   │
  │ Workflow YAML (`.github/workflows/`)    │   9 matches  │   0 matches   │
  │ Unit Tests (`packages/*/tests/`)        │  57 matches  │   0 matches   │
  │ Utility Scripts (`scripts/`)            │   5 matches  │   0 matches   │
  │ Documentation (`docs/`)                 │  11 matches  │   0 matches   │
  │ Agent Tasks & Changelogs (`agents/`)    │ 146 matches  │   0 matches   │
  │ Test Run Artifacts & Scans (`scans/`)   │   0 matches  │ 794 matches   │
  ├─────────────────────────────────────────┼──────────────┼───────────────┤
  │ Total                                   │ 363 matches  │ 794 matches   │
  └─────────────────────────────────────────┴──────────────┴───────────────┘
```

---

## 2. Detailed Findings by Component

### 2.1 Scope Definitions (`scopes/`)

All scope files conform to the `@ghec/contracts` `MigrationScopeSchema`.

#### File 1: `scopes/demogxp-to-antigravity-all.json`

- **Location:** Lines 3, 6, 7, 20, 22, 40, 42, 60, 62, 80, 82, 100, 102, 120, 122, 140, 142, 160, 162, 180, 182, 200, 202, 220, 222, 240, 242, 260, 262, 280, 282, 300, 302, 320, 322, 340, 342, 360, 362, 380, 382, 400, 402, 420, 422, 440, 442, 460, 462, 480, 482, 500, 502, 520, 522, 540, 542, 560, 562 (59 matches: 30 `demogxp`, 29 `antigravity-migration-test`)
- **Current Role:** Ad-hoc migration scope encompassing 28 repositories generated during live multi-repo testing.
- **Evaluation & Options:**
  - **Option A (Recommend Deletion):** Ephemeral run output from `scripts/generate-scope.mjs`. It is an exact duplicate of `scopes/test-all-wave.json` (differing only in `name`). No tests, CI workflows, or scripts depend on this file.
  - **Option B (Recommend Sanitization):** Replace with `example-source-org` and `example-target-emu`. Unnecessary because `test-all-wave.json` already fulfills this role.
  - **Option C (Recommend Gitignoring):** Pattern `scopes/*-to-*.json` can be added to `.gitignore` to prevent generated execution scopes from polluting git history.
- **Risk Level:** **Low** (Safe to delete immediately).

#### File 2: `scopes/demogxp-to-antigravity-org.json`

- **Location:** Lines 3, 6, 7 (3 matches: 2 `demogxp`, 1 `antigravity-migration-test`)
- **Current Role:** Ad-hoc org-only scope (5 org modules, 0 repositories) generated during early Stage 1/2 tests.
- **Evaluation & Options:**
  - **Option A (Recommend Deletion):** Redundant test artifact superseded by `scopes/test-org-wave.json`. Not referenced anywhere in codebase or automation.
  - **Option B (Recommend Sanitization):** Unnecessary duplication of `test-org-wave.json`.
  - **Option C (Recommend Gitignoring):** Covered by `scopes/*-to-*.json` gitignore rule.
- **Risk Level:** **Low** (Safe to delete immediately).

#### File 3: `scopes/demogxp-to-antigravity-repo.json`

- **Location:** Lines 3, 6, 7, 12, 14, 30, 32 (7 matches: 4 `demogxp`, 3 `antigravity-migration-test`)
- **Current Role:** Ad-hoc 2-repo scope (`dummy-repo-public`, `dummy-repo-private-lfs`) generated for Stage 3 testing.
- **Evaluation & Options:**
  - **Option A (Recommend Deletion):** Identical content to `scopes/test-repo-wave.json` (except `name`). No internal dependencies.
  - **Option B (Recommend Sanitization):** Redundant with `scopes/test-repo-wave.json`.
  - **Option C (Recommend Gitignoring):** Covered by `scopes/*-to-*.json` gitignore rule.
- **Risk Level:** **Low** (Safe to delete immediately).

#### File 4: `scopes/test-all-wave.json`

- **Location:** Lines 6, 7, 20, 22, 40, 42, 60, 62, 80, 82, 100, 102, 120, 122, 140, 142, 160, 162, 180, 182, 200, 202, 220, 222, 240, 242, 260, 262, 280, 282, 300, 302, 320, 322, 340, 342, 360, 362, 380, 382, 400, 402, 420, 422, 440, 442, 460, 462, 480, 482, 500, 502, 520, 522, 540, 542, 560, 562 (58 matches: 29 `demogxp`, 29 `antigravity-migration-test`)
- **Current Role:** Primary multi-repository reference test wave (28 repositories) for comprehensive migration verification.
- **Evaluation & Options:**
  - **Option A (Recommend Deletion):** Deleting would remove the pre-packaged large test wave referenced in Stage 4 task documentation.
  - **Option B (Recommend Sanitization):** Sanitize `source` -> `example-source-org` (or `cloudgxp-source`) and `target` -> `example-target-emu` (or `cloudgxp-emu-target`). Validates cleanly under `@ghec/contracts` `validateMigrationScope()`.
  - **Option C (Recommend Gitignoring):** Keep tracked as a canonical reference fixture.
- **Risk Level:** **Low** (Sanitization is safe and preserves fixture utility).

#### File 5: `scopes/test-org-wave.json`

- **Location:** Lines 6, 7 (2 matches: 1 `demogxp`, 1 `antigravity-migration-test`)
- **Current Role:** Default scope input for `.github/workflows/test-migration-dispatch.yml` (Line 10: `default: 'scopes/test-org-wave.json'`).
- **Evaluation & Options:**
  - **Option A (Recommend Deletion):** **Breaks default workflow dispatch!** Workflow dispatch will fail on execution if default path does not exist.
  - **Option B (Recommend Sanitization):** Retain file, sanitize `source` to `example-source-org` and `target` to `example-target-emu`. Aligns directly with documentation in `docs/guides/ghec-to-emu-test-migration-setup.md`.
  - **Option C (Recommend Gitignoring):** Not applicable; must be present in repository for Actions default dispatch.
- **Risk Level:** **Medium** (Must not be deleted without updating workflow default).

#### File 6: `scopes/test-repo-wave.json`

- **Location:** Lines 6, 7, 12, 14, 30, 32 (6 matches: 3 `demogxp`, 3 `antigravity-migration-test`)
- **Current Role:** Standard 2-repo wave (`dummy-repo-public`, `dummy-repo-private-lfs`) used in Stage 3 module testing.
- **Evaluation & Options:**
  - **Option A (Recommend Deletion):** Would break setup examples in `docs/guides/ghec-to-emu-test-migration-setup.md`.
  - **Option B (Recommend Sanitization):** Sanitize `sourceOrg` -> `example-source-org` and `targetOrg` -> `example-target-emu`. Preserves dummy repository mapping while removing personal slugs.
  - **Option C (Recommend Gitignoring):** Not recommended; keep as tracked sample.
- **Risk Level:** **Low** (Sanitization preserves documentation accuracy and contracts schema).

---

### 2.2 Workflow YAML (`.github/workflows/`)

#### File 7: `.github/workflows/generate-scope.yml`

- **Location:**
  - Line 7: `description: 'Source organization slug (e.g. demogxp)'`
  - Line 10: `default: 'demogxp'`
  - Line 12: `description: 'Target organization slug (e.g. antigravity-migration-test)'`
  - Line 15: `default: 'antigravity-migration-test'`
  - (4 matches: 2 `demogxp`, 2 `antigravity-migration-test`)
- **Current Role:** Manual workflow dispatch for generating migration scope JSON files and committing them to branch.
- **Evaluation & Options:**
  - **Option A (Recommend Deletion):** Workflow is core automation; deletion degrades suite capability.
  - **Option B (Recommend Sanitization / Parameterization):** Remove hardcoded personal defaults or replace with generic placeholding strings (`default: 'my-source-org'`, `default: 'my-target-emu'`) or require operator to enter the slugs (`required: true` without defaults).
  - **Option C (Recommend Gitignoring):** Not applicable for GitHub Actions workflows.
- **Risk Level:** **Low** (Parameterizing input defaults has zero impact on `npm run check` and prevents accidental dispatches against personal orgs).

#### File 8: `.github/workflows/seed-dummy-resources.yml`

- **Location:**
  - Line 7: `description: 'Provisioning mode: "source" (demogxp) or "target" (antigravity-migration-test)'`
  - Line 15: `description: 'Organization to provision (leave empty to use default: demogxp for source, antigravity-migration-test for target)'`
  - Line 45: `TARGET_ORG="${INPUT_ORG:-antigravity-migration-test}"`
  - Line 53: `SOURCE_ORG="${INPUT_ORG:-demogxp}"`
  - (4 matches: 2 `demogxp`, 2 `antigravity-migration-test`)
- **Current Role:** Seeds dummy test resources (repos, teams, variables, secrets, custom properties) for migration testing.
- **Evaluation & Options:**
  - **Option A (Recommend Deletion):** Deletion removes test seeding automation.
  - **Option B (Recommend Sanitization / Parameterization):** Remove fallback defaults `${INPUT_ORG:-...}` or replace with mandatory `organization` input or generic environment variable `MIGRATION_SOURCE_ORG`.
  - **Option C (Recommend Gitignoring):** Not applicable.
- **Risk Level:** **Low** (Safe to parameterize; prevents accidental mutations to personal accounts).

---

### 2.3 Utility Scripts (`scripts/`)

#### File 9: `scripts/generate-scope.mjs`

- **Location:**
  - Line 75: `node scripts/generate-scope.mjs --source demogxp --target antigravity-migration-test --file wave1-urls.txt`
  - Line 77: `# Generate a scope for all repositories in demogxp:`
  - Line 78: `node scripts/generate-scope.mjs --source demogxp --target antigravity-migration-test --all`
  - Line 81: `node scripts/generate-scope.mjs --source demogxp --target antigravity-migration-test --repos https://github.com/demogxp/repo-1,https://github.com/demogxp/repo-2`
  - (4 matches: 4 `demogxp`, 3 `antigravity-migration-test`)
- **Current Role:** CLI script to generate migration scopes from GitHub API or text URL files.
- **Evaluation & Options:**
  - **Option A (Recommend Deletion):** Core CLI script invoked by `npm run generate:scope` and workflow. Cannot be deleted.
  - **Option B (Recommend Sanitization):** All occurrences are inside `printUsage()` docstrings! Change `demogxp` -> `acme-corp` / `example-source-org` and `antigravity-migration-test` -> `acme-emu` / `example-target-emu`.
  - **Option C (Recommend Gitignoring):** Not applicable.
- **Risk Level:** **Low** (Docstring edits carry zero runtime risk).

#### File 10: `scripts/seed-dummy-resources.mjs`

- **Location:** Line 23: `'demogxp';` (inside `const org = ... || 'demogxp';`)
- **Current Role:** Standalone script to provision synthetic test resources via GitHub REST API.
- **Evaluation & Options:**
  - **Option A (Recommend Deletion):** Core utility script.
  - **Option B (Recommend Sanitization):** Change fallback from `'demogxp'` to require an explicit argument (`if (!org) { console.error('Error: Organization argument required'); process.exit(1); }`).
  - **Option C (Recommend Gitignoring):** Not applicable.
- **Risk Level:** **Low** (Fails fast if operator forgets to pass organization argument, preventing accidental seeding).

---

### 2.4 Unit Tests (`packages/*/tests/`)

All 3 unit test files pass cleanly during `npm run check` (369/369 tests green).

#### File 11: `packages/migration/tests/modules/gei-repo.test.ts`

- **Location:** Lines 83, 85, 105, 107, 118, 120, 127, 142, 149, 151, 164 (11 matches: 5 `demogxp`, 6 `antigravity-migration-test`)
- **Code Context:**
  ```typescript
  scope: {
    level: 'repository',
    sourceOrg: 'demogxp',
    sourceRepo: 'repo-1',
    targetOrg: 'antigravity-migration-test',
    targetRepo: 'repo-1',
  }
  // SSO mock URL:
  ssoUrl: 'https://github.com/orgs/demogxp/sso'
  // Assertion:
  assert.equal(plan.targetIdentifier, 'antigravity-migration-test/repo-1');
  ```
- **Evaluation & Options:**
  - **Option A (Recommend Deletion):** **Breaks test suite.** Deleting this file drops unit test coverage for `GeiRepoMigrationModule`.
  - **Option B (Recommend Sanitization):** Replace `demogxp` with `example-source-org` and `antigravity-migration-test` with `example-target-org`. Synchronize assertion lines (lines 127, 142, 164). Test suite executes against in-memory mock adapters; zero network calls are made.
  - **Option C (Recommend Gitignoring):** Not applicable for tracked test suite.
- **Risk Level:** **Low** (Simple string replacement; verified by running `npm test`).

#### File 12: `packages/migration/tests/preflight/credential-inspector.test.ts`

- **Location:** Lines 93, 114, 135, 156, 171, 177, 188, 207, 215, 235, 238, 240, 245, 247 (14 matches: 12 `demogxp`, 2 `antigravity-migration-test`)
- **Code Context:**
  ```typescript
  const inspector = new SourceCredentialInspector({
    adapter,
    sourceOrg: 'demogxp',
  });
  ssoUrl: 'https://github.com/orgs/demogxp/sso';
  assert.ok(
    assessment.blockers[0]!.includes('https://github.com/orgs/demogxp/sso'),
  );
  assert.match(
    assessment.warnings[0]!,
    /gh gei grant-migrator-role --github-org demogxp --actor regular-member/,
  );
  name: 'demogxp-to-target';
  source: 'demogxp';
  target: 'antigravity-migration-test';
  ```
- **Evaluation & Options:**
  - **Option A (Recommend Deletion):** **Breaks test suite.** Tests Stage 1 token inspection, SAML SSO discovery, and permission evaluation.
  - **Option B (Recommend Sanitization):** Replace `demogxp` with `mock-source-org` and `antigravity-migration-test` with `mock-target-org`. Must update regex assertion in line 215 (`--github-org mock-source-org`) and SSO assertion in line 188.
  - **Option C (Recommend Gitignoring):** Not applicable.
- **Risk Level:** **Low** (Tests mock adapters in-memory; zero network dependency).

#### File 13: `packages/migration/tests/scope/generate-scope.test.ts`

- **Location:** Lines 14, 15, 18, 19, 22, 23, 26, 27, 31, 32, 35, 36, 38, 39, 49, 50, 57, 58, 76, 77, 78, 81, 89, 94, 95, 113, 120, 144, 145, 153, 181, 182 (32 matches: 25 `demogxp`, 7 `antigravity-migration-test`)
- **Code Context:**
  ```typescript
  assert.deepEqual(parseRepoEntry('https://github.com/demogxp/my-repo'), { org: 'demogxp', name: 'my-repo' });
  const { scope } = await generateScope({ source: 'demogxp', target: 'antigravity-migration-test', ... });
  // Mismatch error assertion:
  /belongs to organization "other-org", but source organization is "demogxp"/
  ```
- **Evaluation & Options:**
  - **Option A (Recommend Deletion):** **Breaks test suite.** Tests URL parsing (HTTPS, SSH, git@, GHE), wave generation, multi-hundred repo scaling, and schema validation.
  - **Option B (Recommend Sanitization):** Replace `demogxp` with `example-source-org` and `antigravity-migration-test` with `example-target-org`. Notice that lines 163-164 (`source-org`, `target-org`) already use generic names!
  - **Option C (Recommend Gitignoring):** Not applicable.
- **Risk Level:** **Low** (Tests use local strings and temporary files; verified by `npm test`).

---

### 2.5 Documentation (`docs/`)

#### File 14: `docs/guides/ghec-to-emu-test-migration-setup.md`

- **Location:** Lines 50, 51, 60, 62, 71, 117, 128, 221, 225, 226 (10 matches for `cloudgxp-source`, `cloudgxp-emu-target`, `jdoe_cloudgxp`)
- **Current Role:** End-to-end setup guide for test migrations between GHEC and EMU.
- **Evaluation & Options:**
  - **Option A (Recommend Deletion):** Core setup guide; cannot be deleted.
  - **Option B (Recommend Sanitization):** The guide already intentionally uses synthetic documentation placeholders (`cloudgxp-source`, `cloudgxp-emu-target`, and EMU user format `jdoe_cloudgxp`). Note that lines 225-226 explicitly instruct the user to run `sed` to replace these with their own organization names:
    ```bash
    sed -i 's/cloudgxp-source/my-source-org/g' scopes/test-org-wave.json
    sed -i 's/cloudgxp-emu-target/my-target-emu-org/g' scopes/test-org-wave.json
    ```
    If desired, these can be generalized to `example-source-org` and `example-emu-target`.
  - **Option C (Recommend Gitignoring):** Not applicable.
- **Risk Level:** **Low** (Documentation only; does not contain sensitive or personal tenant names).

#### File 15: `docs/architecture/discovery-migration-assessment.md`

- **Location:** Line 6: `**Target Repository:** cloudgxp/ghec-consultant-suite`
- **Current Role:** Architecture specification noting the repository name.
- **Classification:** **Standard Repository Remote URL** (Not a personal/test tenant).
- **Evaluation & Options:** Retain as valid project identifier.
- **Risk Level:** **None**.

---

### 2.6 Agent Tasks & Historical Changelogs (`agents/`)

#### File 16: `agents/agent-tasks/CHANGELOG.md`

- **Location:** Lines 36, 45, 54, 63, 72, 81, 90, 99, 111, 122, 131, 140, 149 (12 `demogxp`, 13 `antigravity-migration-test`), Lines 283, 295, 298 (3 live smoke test against `cloudgxp`), plus ~19 commit/PR URLs.
- **Current Role:** Immutable project changelog recording historical verification events for Completed Tasks (Stages 1–4).
- **Evaluation & Options:**
  - **Option A (Recommend Deletion):** Would destroy audit trail and compliance evidence.
  - **Option B (Recommend Sanitization):** Historical changelogs record actual past actions against specific tenants. Sanitizing past changelog entries introduces historical distortion unless annotated as a redaction pass.
  - **Option C (Recommend Retention with Redaction Notice):** Retain unchanged as audit evidence, or apply an explicit sanitization pass that notes `[REDACTED_SOURCE_ORG]` / `[REDACTED_TARGET_EMU]`.
- **Risk Level:** **Low** (Pure documentation; no code execution).

#### File 17: `agents/agent-tasks/CURRENT-TASKS.md`

- **Location:** Lines 20, 104, 180 (3 matches for release validation against enterprise target `cloudgxp`), plus 12 commit/PR URLs.
- **Current Role:** Central tracking backlog for all agent tasks.
- **Evaluation & Options:**
  - **Option A (Recommend Deletion):** Core tracking artifact.
  - **Option B (Recommend Sanitization):** Sanitize or generalize reference in line 20, 104, and 180 to `<enterprise-test-tenant>`.
  - **Option C (Recommend Retention):** Retain.
- **Risk Level:** **Low**.

#### File 18: `agents/agent-tasks/features/completed/test-stage1-discovery-verification.md`

- **Location:** Line 43: `Target the committed test organization scope defining source (demogxp) and target EMU (antigravity-migration-test) tenants:`
- **Current Role:** Completed task specification for Stage 1 discovery.
- **Evaluation & Options:** Can be sanitized to reference `cloudgxp-source` / `cloudgxp-emu-target` or `example-source-org`.
- **Risk Level:** **Low**.

#### Files 19–33: Completed CodeQL Specifications, PR Fix Records, and Workflows

- **Location:** `agents/agent-tasks/security/completed/codeql-*.md`, `bug-fixes/completed/pr-fix-*.md`, `.github/workflows/combine-dependabot-prs.yml`, `agents/agent-communications/changelog.md`
- **Classification:** **Standard Repository Remote URLs & Anchors** (100% of these occurrences are `cloudgxp/ghec-consultant-suite` or `cloudgxp/reusable-workflows`).
- **Evaluation & Options:** **Do not modify.** These are legitimate GitHub repository URLs pointing to issues, code scanning alerts, and reusable workflow SHAs in the suite repository.
- **Risk Level:** **None**.

---

### 2.7 Untracked Test Run Artifacts (`scans/`)

All 27 files in `scans/` are **untracked and gitignored** via `.gitignore:35` (`scans/`).

- **Location:** `scans/downloads/37252288389/`, `scans/downloads/37261743337/`, `scans/.checkpoint-a087ed66f46f/`, etc. (794 total matches).
- **Current Role:** Local scratch downloads of GitHub Actions workflow run artifacts from testing runs.
- **Evaluation & Options:**
  - **Option A (Recommend Deletion from Local Disk):** These local JSON files can be purged (`rm -rf scans/downloads/*`) whenever the developer or operator wants to reclaim disk space.
  - **Option B (Recommend Sanitization):** Unnecessary; these files are already excluded from git tracking.
  - **Option C (Recommend Gitignoring):** Already gitignored (`scans/` in `.gitignore`).
- **Risk Level:** **None** (Not in version control).

---

## 3. Recommended Action Plan

### 3.1 Phase A: Files Safe to Delete Immediately (Ephemeral Scaffolding)

These files are ephemeral test outputs generated during development with zero callers in tests, scripts, or workflows:

- [ ] **`scopes/demogxp-to-antigravity-all.json`** (59 matches) — Delete file; exact duplicate of `test-all-wave.json`.
- [ ] **`scopes/demogxp-to-antigravity-org.json`** (3 matches) — Delete file; superseded by `test-org-wave.json`.
- [ ] **`scopes/demogxp-to-antigravity-repo.json`** (7 matches) — Delete file; exact duplicate of `test-repo-wave.json`.

---

### 3.2 Phase B: Files to Retain & Sanitize (Core Framework & Tests)

These files are required for core functionality, automation, and test coverage (`npm run check`):

#### 1. Committed Migration Scopes (`scopes/`)

- [ ] **`scopes/test-all-wave.json`**
  - Replace all `demogxp` occurrences with `example-source-org` (or `cloudgxp-source`).
  - Replace all `antigravity-migration-test` occurrences with `example-target-emu` (or `cloudgxp-emu-target`).
- [ ] **`scopes/test-org-wave.json`**
  - Replace `demogxp` with `example-source-org`.
  - Replace `antigravity-migration-test` with `example-target-emu`.
- [ ] **`scopes/test-repo-wave.json`**
  - Replace `demogxp` with `example-source-org`.
  - Replace `antigravity-migration-test` with `example-target-emu`.

#### 2. Unit Tests (`packages/migration/tests/`)

- [ ] **`packages/migration/tests/modules/gei-repo.test.ts`**
  - Sanitize `demogxp` -> `example-source-org`.
  - Sanitize `antigravity-migration-test` -> `example-target-emu`.
  - Update SSO mock URL assertion to `https://github.com/orgs/example-source-org/sso`.
  - Update plan target assertion to `example-target-emu/repo-1`.
- [ ] **`packages/migration/tests/preflight/credential-inspector.test.ts`**
  - Sanitize `demogxp` -> `mock-source-org`.
  - Sanitize `antigravity-migration-test` -> `mock-target-emu`.
  - Update SAML SSO assertion URL to `https://github.com/orgs/mock-source-org/sso`.
  - Update migrator role regex to `/gh gei grant-migrator-role --github-org mock-source-org --actor regular-member/`.
- [ ] **`packages/migration/tests/scope/generate-scope.test.ts`**
  - Sanitize all test URLs from `demogxp` to `example-source-org`.
  - Sanitize `antigravity-migration-test` to `example-target-emu`.
  - Update mismatch regex assertion to match `example-source-org`.

#### 3. Utility Scripts (`scripts/`)

- [ ] **`scripts/generate-scope.mjs`**
  - Sanitize lines 75, 77, 78, 81: replace `demogxp` and `antigravity-migration-test` in help text examples with `example-source-org` and `example-target-emu`.
- [ ] **`scripts/seed-dummy-resources.mjs`**
  - Sanitize line 23: remove hardcoded `'demogxp'` fallback; require explicit org via CLI arg or `GHEC_SOURCE_ORG`.

---

### 3.3 Phase C: Workflows to Parameterize (Zero-Default Hardening)

- [ ] **`.github/workflows/generate-scope.yml`**
  - Change `source_org` input default from `'demogxp'` to `''` (or `'example-source-org'`).
  - Change `target_org` input default from `'antigravity-migration-test'` to `''` (or `'example-target-emu'`).
  - Update input descriptions to use generic examples `(e.g. acme-source-org)`.
- [ ] **`.github/workflows/seed-dummy-resources.yml`**
  - Remove personal org names from input descriptions.
  - Require explicit `organization` input or default to `''` without falling back to `demogxp` / `antigravity-migration-test`.

---

### 3.4 Phase D: Gitignore Hardening for Local Generated Scopes

- [ ] Add the following entries to `.gitignore`:
  ```gitignore
  # Exclude generated ad-hoc scopes and local wave executions
  scopes/*-to-*.json
  scopes/local-*.json
  scopes/my-*.json
  ```
  This ensures that when operators run `node scripts/generate-scope.mjs`, their generated client-specific scopes will never be accidentally committed to git.

---

### 3.5 Phase E: Historical Records Decision Matrix

| Artifact                                                                      | Current Text                                                           | Recommended Action                                                      | Justification                                                                                                         |
| :---------------------------------------------------------------------------- | :--------------------------------------------------------------------- | :---------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| `agents/agent-tasks/CHANGELOG.md`                                             | Verification summaries cite `demogxp` and `antigravity-migration-test` | **Retain as historical evidence** OR annotate with generic placeholders | Represents immutable log of historical CI run IDs (37250556440, etc.). Modifying past changelogs obscures provenance. |
| `agents/agent-tasks/CURRENT-TASKS.md`                                         | Notes release validation against enterprise target `cloudgxp`          | **Generalize** to `approved synthetic enterprise resources`             | Active living document; generalizing keeps focus on current release posture.                                          |
| `agents/agent-tasks/features/completed/test-stage1-discovery-verification.md` | Mentions `demogxp` and `antigravity-migration-test`                    | **Sanitize** to match sanitized `test-org-wave.json`                    | Completed task spec; aligns with updated scope file names.                                                            |

---

## 4. Verification & Validation Protocol for Execution

When approved by user, execution must adhere to this verification sequence:

```bash
# 1. Execute deletions and sanitizations
git rm scopes/demogxp-to-antigravity-*.json

# 2. Run full monorepo quality gate
npm run check

# 3. Specifically verify all migration tests pass
node --import tsx --test 'packages/migration/tests/**/*.test.ts'

# 4. Verify scope schema validation against sanitized scopes
node --input-type=module -e '
import { readFileSync, readdirSync } from "node:fs";
import { validateMigrationScope } from "./packages/contracts/dist/index.js";
for (const f of readdirSync("scopes")) {
  if (f.endsWith(".json")) {
    const res = validateMigrationScope(JSON.parse(readFileSync(`scopes/${f}`, "utf8")));
    if (!res.success) throw new Error(`${f} validation failed`);
    console.log(`✓ ${f} valid`);
  }
}
'

# 5. Confirm git status shows only clean intended changes
git status -s
```
