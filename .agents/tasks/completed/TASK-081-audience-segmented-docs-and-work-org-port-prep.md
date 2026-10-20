---
id: TASK-081
title: 'Audience-Segmented Documentation Overhaul & Work-Org Port Preparation'
status: completed
owner: agent
created_at: 2026-10-19
completed_at: 2026-10-19
dependencies:
  - TASK-062
  - TASK-065
packages_affected:
  - apps/cli
  - apps/dashboard
---

# TASK-081: Audience-Segmented Documentation Overhaul & Work-Org Port Preparation

## 1. Objective & Context

Before porting the repository to the employer's work organization, the documentation must clearly serve four distinct audiences without mixing developer setup commands into operator or executive documentation:

1. **Executives, Project Managers & Engagement Leads (`README.md`, `docs/guides/customers-and-pms/`):**
   - Root `README.md` must serve as a high-level, non-technical overview explaining what the GHEC Consultant Suite is, how it helps deliver GHEC and GHEC-EMU migration contracts safely and repeatably, how the CLI/automation engine executes the 4 stages (**Discover $\rightarrow$ Plan $\rightarrow$ Migrate $\rightarrow$ Validate**), and a comprehensive **Capabilities Table** across all 34 modules—followed by a clear Role-Based Documentation Directory.
   - Add a dedicated **Project Manager & Engagement Lead Playbook** (`docs/guides/customers-and-pms/pm-engagement-playbook.md`).
2. **Migration Operators (`docs/guides/operators/`):**
   - Strictly use **GitHub Web UI** (`Actions` tab, Settings, `migration-audit-results` repository), **Dashboard Web UI** (Private GitHub Pages & Release Kit Console UI), and the **GitHub CLI (`gh`)**.
   - **Zero `npm` commands** (`npm ci`, `npm run dev`, `npm run dev:cli`, `npm run build`) or TypeScript source-runner commands (`tsx`) anywhere in operator guides.
   - Consolidate overlapping guides (`consultant-operators-manual.md` + `github-actions-migration.md`, and `ghec-to-emu-test-migration-setup.md` + `seed-demo-content.md`).
3. **Customers / Client Stakeholders (`docs/guides/customers-and-pms/customer-migration-handbook.md`):**
   - Plain-English client preparation checklist, security assurances, automatic vs. post-care matrix, and Day-1 developer guide.
4. **Platform Developers (`docs/guides/developers/`):**
   - Dedicated developer guides covering `npm` workspace commands (`npm ci`, `npm run build`, `npm run check`, `npm run dev`, `npm run dev:cli`), building the Release Kit (`npm run build:release-kit`), and scaffolding/testing migration modules.

Additionally, update `scripts/build-release-kit.mjs` so the Customer Migration Release Kit bundles only `docs/guides/operators/` and `docs/guides/customers-and-pms/` (never developer docs), and remove historical personal/sandbox audit reports from `docs/reports/`.

## 2. Dependencies & Prerequisites

- [x] Upstream tasks completed (`TASK-062`, `TASK-065`)
- [x] Consultant-style documentation skill (`.agents/skills/consultant-style-docs/SKILL.md`) reviewed

## 3. Scope of Changes

- `README.md`
- `docs/README.md`
- `docs/guides/README.md`
- `docs/guides/operators/consultant-operators-manual.md`
- `docs/guides/operators/generating-migration-scopes.md`
- `docs/guides/operators/discovery-and-dashboard-webui.md`
- `docs/guides/operators/verification-and-remediation.md`
- `docs/guides/operators/sandbox-and-demo-setup.md`
- `docs/guides/customers-and-pms/customer-migration-handbook.md`
- `docs/guides/customers-and-pms/pm-engagement-playbook.md`
- `docs/guides/developers/local-development-and-cli.md`
- `docs/guides/developers/building-the-release-kit.md`
- `docs/guides/developers/adding-migration-modules.md`
- `SUPPORT.md`
- `COLLABORATORS.md`
- `CONTRIBUTING.md`
- `scripts/build-release-kit.mjs`
- `.github/workflows/release-kit.yml`
- `.github/instructions/documentation-style.instructions.md`
- `.agents/rules/documentation-style.md`
- `.github/skills/consultant-style-docs/SKILL.md`
- `.agents/skills/consultant-style-docs/SKILL.md`

## 4. Implementation Checklist

- [x] **Step 1: Rewrite Root `README.md` for Non-Technical Leaders, PMs & All Visitors**
  - High-level overview of GHEC & GHEC-EMU contract value, 4-stage lifecycle (**Discover $\rightarrow$ Plan $\rightarrow$ Migrate $\rightarrow$ Validate**), full Capabilities Table, and Role-Based Documentation Links (zero `npm` setup commands in root `README.md`).
- [x] **Step 2: Restructure `docs/guides/` into `operators/`, `customers-and-pms/`, and `developers/`**
  - Move and consolidate existing guides into role-segmented folders; remove historical sandbox audit reports in `docs/reports/`.
- [x] **Step 3: Scrub `npm` Commands from Operator Guides & Add Web UI + `gh` CLI Instructions**
  - Ensure all 5 operator guides in `docs/guides/operators/` exclusively use the GitHub Web UI, Dashboard Web UI, and `gh` CLI (plus pre-built Release Kit binary where applicable), with zero `npm` commands.
- [x] **Step 4: Author `pm-engagement-playbook.md` & `docs/guides/developers/*.md`**
  - Create the PM & Engagement Lead Playbook in `docs/guides/customers-and-pms/` and the three Developer Guides in `docs/guides/developers/`.
- [x] **Step 5: Update Release Kit Builder, Cross-Links & Style Rules**
  - Update `scripts/build-release-kit.mjs`, `.github/workflows/release-kit.yml`, `docs/README.md`, `docs/guides/README.md`, `SUPPORT.md`, `COLLABORATORS.md`, `CONTRIBUTING.md`, `apps/cli/README.md`, and documentation style instructions.
- [x] **Step 6: Quality Gate Verification**
  - Verify zero `npm` commands in `docs/guides/operators/` and `docs/guides/customers-and-pms/`, verify `npm run build:release-kit`, `node --import tsx scripts/verify-doc-references.ts`, and `npm run check`.

## 5. Verification Gate

```bash
npm run check
npm run build:release-kit
node --import tsx scripts/verify-doc-references.ts
```

## 6. Completion Summary & Evidence

- **Completed At:** 2026-10-19
- **Verification Output:**
  - `grep -rn "npm \|node \|tsx " docs/guides/operators/ docs/guides/customers-and-pms/ README.md` $\rightarrow$ `0` matches (zero `npm`, `node`, or `tsx` commands in root `README.md`, Operator guides, or Customer/PM guides).
  - `npm run build:release-kit` $\rightarrow$ Built Customer Migration Release Kit in `dist/release-kit` containing `docs/guides/operators/` and `docs/guides/customers-and-pms/` (excluding `docs/guides/developers/`).
  - `node --import tsx scripts/verify-doc-references.ts` $\rightarrow$ `[PASS] Documentation cross-reference verification passed cleanly.`
  - `npm run check` $\rightarrow$ Passed lint, Prettier check, TypeScript typecheck, app build, and full unit/integration test suite (`810 tests, 134 suites, 810 pass, 0 fail`).
