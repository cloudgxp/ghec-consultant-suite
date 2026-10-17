---
id: TASK-062
title: 'Overhaul Repository Documentation to Consultant-Style Docs (8th-Grade Reading Level) and Add Collaboration Best-Practice Files'
status: completed
owner: agent
created_at: 2026-10-16
dependencies: [TASK-061]
packages_affected:
  - '@ghec/contracts'
  - '@ghec/analysis'
  - '@ghec/github-client'
  - '@ghec/discovery'
  - '@ghec/migration'
  - '@ghec/dashboard'
  - 'ghec-consultant-cli'
---

# TASK-062: Overhaul Repository Documentation to Consultant-Style Docs (8th-Grade Reading Level) and Add Collaboration Best-Practice Files

## 1. Objective & Context

Analyze all existing user-facing and operational documentation across the repository, rewrite existing guides, READMEs, and SpecKit `quickstart.md` files to adhere to `.agents/rules/documentation-style.md` and `.agents/skills/consultant-style-docs/SKILL.md` (plain-English 8th-grade reading level, task-oriented headings, default behavior stated upfront, `"To <do X>:"` + individual code block pairs ordered from simple to advanced, ASCII folder trees, and admonition boxes), and create missing documentation and collaboration best-practice files (`COLLABORATORS.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, PR/Issue templates, missing guides in `docs/guides/`, and missing module READMEs in `packages/migration/`).

## 2. Dependencies & Prerequisites

- [x] `.agents/rules/documentation-style.md` and `.agents/skills/consultant-style-docs/SKILL.md` defined
- [x] `.specify/memory/constitution.md` updated to `v1.1.0`

## 3. Scope of Changes

1. **Collaboration & Community Best-Practice Files (New):**
   - `COLLABORATORS.md`
   - `CONTRIBUTING.md`
   - `CODE_OF_CONDUCT.md`
   - `SECURITY.md`
   - `SUPPORT.md`
   - `.github/PULL_REQUEST_TEMPLATE.md`
   - `.github/ISSUE_TEMPLATE/bug_report.md`
   - `.github/ISSUE_TEMPLATE/feature_request.md`
2. **Root, App, and Package READMEs (Edited + Missing Created):**
   - `README.md`, `docs/README.md` (new), `docs/guides/README.md` (new), `docs/architecture/README.md`, `docs/data-contracts/README.md`, `docs/security/README.md`, `fixtures/synthetic/README.md`, `.agents/tasks/README.md`
   - `apps/cli/README.md`, `apps/cli/src/config/README.md`, `apps/cli/src/output/README.md`, `apps/cli/src/permissions/README.md`
   - `apps/dashboard/README.md`, `apps/dashboard/src/components/README.md`, `apps/dashboard/src/features/README.md`, `apps/dashboard/src/lib/README.md`, `apps/dashboard/src/pages/README.md`, `apps/dashboard/src/styles/README.md`
   - `packages/contracts/README.md`, `packages/analysis/README.md`, `packages/github-client/README.md`, `packages/discovery/README.md`, `packages/migration/README.md`
   - `packages/migration/src/advisory/README.md`, `packages/migration/src/gei/README.md`, `packages/migration/src/preflight/README.md`
   - `packages/migration/src/strategies/git-lfs/README.md`, `packages/migration/src/strategies/releases/README.md`, `packages/migration/src/strategies/mirror-push/README.md` (new)
   - `packages/migration/src/post-migration/codeowners/README.md`, `packages/migration/src/post-migration/mannequins/README.md`, `packages/migration/src/post-migration/security/README.md`
   - All 29 module READMEs in `packages/migration/src/modules/*/README.md` (11 edited + 18 newly created)
3. **Operational Guides (`docs/guides/`) & SpecKit Quickstarts (`specs/**/quickstart.md`):**
   - `docs/guides/seed-demo-content.md`
   - `docs/guides/github-actions-migration.md`
   - `docs/guides/ghec-to-emu-test-migration-setup.md`
   - `docs/guides/jules-automation-setup.md`
   - `docs/guides/offline-discovery-and-assessment.md` (new)
   - `docs/guides/verification-and-remediation.md` (new)
   - `specs/001-migration-gap-analysis/quickstart.md`
   - `specs/002-seed-demo-content/quickstart.md`
   - `specs/003-autonomous-migration-orchestration/quickstart.md`
   - `specs/004-granular-results-hierarchy/quickstart.md`
   - `specs/005-failure-observability-gates/quickstart.md`
4. **Operational Skills in `.agents/skills/`:**
   - `.agents/skills/migration-wave-orchestration/SKILL.md`
   - `.agents/skills/migration-module-scaffolding/SKILL.md`
   - `.agents/skills/verification-and-remediation/SKILL.md`

## 4. Implementation Checklist

- [x] **Step 1: Create Collaboration & Community Best-Practice Docs**
  - Create `COLLABORATORS.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, `.github/PULL_REQUEST_TEMPLATE.md`, and `.github/ISSUE_TEMPLATE/*.md` adhering to `consultant-style-docs`.
- [x] **Step 2: Rewrite Operational Guides (`docs/guides/`) and Create Missing Guides**
  - Rewrite `seed-demo-content.md`, `github-actions-migration.md`, `ghec-to-emu-test-migration-setup.md`, and `jules-automation-setup.md` at an 8th-grade reading level with `"To <do X>:"` + code examples.
  - Create `docs/README.md`, `docs/guides/README.md`, `docs/guides/offline-discovery-and-assessment.md`, and `docs/guides/verification-and-remediation.md`.
- [x] **Step 3: Rewrite Root, App, Package, and SpecKit Quickstart Docs**
  - Rewrite `README.md`, `apps/*/README.md` (and subdirectories), `packages/*/README.md` (and subdirectories), `docs/{architecture,data-contracts,security}/README.md`, `fixtures/synthetic/README.md`, `.agents/tasks/README.md`, and `.agents/skills/{migration-wave-orchestration,migration-module-scaffolding,verification-and-remediation}/SKILL.md`.
  - Rewrite all 5 `specs/**/quickstart.md` files to adhere to `consultant-style-docs`.
- [x] **Step 4: Rewrite Existing & Create Missing Migration Module/Strategy READMEs**
  - Rewrite the 11 existing `packages/migration/src/modules/*/README.md` files and create the 18 missing module `README.md` files plus `packages/migration/src/strategies/mirror-push/README.md`.
- [x] **Step 5: Quality Gate Verification**
  - Format with Prettier and run `npm run check` and `node --import tsx scripts/verify-doc-references.ts`.

## 5. Verification Gate

```bash
npm run format
npm run check
node --import tsx scripts/verify-doc-references.ts
```

## 6. Completion Summary & Evidence

- **Completion Date:** 2026-10-16
- **Execution Summary:**
  - Created `.agents/rules/documentation-style.md` and `.agents/skills/consultant-style-docs/SKILL.md` (with `references/golden-example.md`), updated `AGENTS.md`, `.specify/memory/constitution.md` (`v1.1.0`), `.agents/skills/speckit-plan/SKILL.md`, and `.specify/templates/tasks-template.md`.
  - Created 8 new collaboration and community health documents (`COLLABORATORS.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`).
  - Created 4 new documentation guides and indexes (`docs/README.md`, `docs/guides/README.md`, `docs/guides/offline-discovery-and-assessment.md`, `docs/guides/verification-and-remediation.md`) and 19 new migration module/strategy READMEs under `packages/migration/src/`.
  - Rewrote 52 existing user-facing guides, READMEs, operational skills, and SpecKit `quickstart.md` files to strictly follow the 8th-grade reading level `consultant-style-docs` standard.
- **Verification Evidence:**
  - `node --import tsx scripts/verify-doc-references.ts`: Verified 42/42 documentation references in `GAP_LEDGER_CATALOG`.
  - `npm run check`: Passed cleanly (ESLint, Prettier, TypeScript build & typecheck, and 745 passing offline tests across 130 suites).
