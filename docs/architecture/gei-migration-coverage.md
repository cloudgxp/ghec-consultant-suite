# GEI Migration Coverage Matrix & Technical Architecture Reference

**Specification Status:** Authoritative Architectural Standard & Master Coverage Matrix  
**Target Migration Path:** GitHub Enterprise Cloud (GHEC) $\longrightarrow$ GitHub Enterprise Cloud with Enterprise Managed Users (GHEC-EMU)  
**Primary Engine:** GitHub Enterprise Importer (GEI) + GHEC Consultant Suite Migration Framework  
**Authoritative Local Reference:** `references/github-docs/`  
**Date:** October 2026

---

## 1. Executive Summary & Audit Conclusions

This document establishes the definitive architectural assessment of **GitHub Enterprise Importer (GEI)** capabilities, partial migrations, omissions, and operational follow-up tasks when executing a migration from **GitHub Enterprise Cloud (GHEC)** to **GitHub Enterprise Cloud with Enterprise Managed Users (GHEC-EMU)**.

### The Primary Question

> _If we execute all currently planned tasks in the suite, will the resulting tool handle all important repository-level and organization-level data that GitHub Enterprise Importer does not migrate, partially migrates, or requires follow-up action for?_

### The Verdict

**No.** Prior to this reconciliation, the implementation backlog (Tasks 001–021) contained significant operational blind spots. GEI is a high-throughput, canonical engine for transferring core Git data, commit histories, pull requests, issues, comments, wikis, and basic releases. However, GEI **deliberately omits or partially migrates** critical governance, security, access, and binary storage subsystems.

Without targeted automation, a standard GEI cutover results in:

1. **Broken Binary Storage:** Git LFS objects are completely dropped; pointer files migrate, but object downloads 404.
2. **Migration Job Failures:** Repositories with $>10\text{ GiB}$ of releases or $>40\text{ GiB}$ of metadata fail GEI without automated `--skip-releases` coordination and fallback streaming.
3. **Hard Push Blockers:** Destination organization or enterprise rulesets cause GEI pushes to time out and fail unless "Repository migrations" is explicitly placed in the bypass list with **Exempt** mode.
4. **Governance Degradation:** Classic branch protections lose 7 specific settings and exceptions; modern repository and organization rulesets are completely dropped.
5. **Security Isolation:** All migrated repositories default to `private` visibility, breaking internal enterprise shared code models.
6. **Integration Outages & Duplication:** Webhooks are migrated in a disabled state with stripped secrets; blind recreation creates duplicate endpoints.
7. **Identity Disconnection:** User contributions are parked under placeholder "mannequins" with no automated attribution to provisioned EMU accounts.
8. **CODEOWNERS Invalidation:** Team references (`@source-org/team-slug`) break across organization renames.
9. **Metadata Loss:** Custom property schemas and repository property values are dropped.

This specification reconciles these gaps by expanding the suite beyond simple CRUD modules into a multi-tiered architecture: **Preflight Inspection**, **Specialized Transfer Strategies**, **Targeted API Modules**, **Post-Migration Reconciliations**, and **Advisory Planning**.

---

## 2. Authoritative GitHub Documentation Base

This assessment is grounded in the locally vendored GitHub documentation corpus located under `references/github-docs/`:

- **Migration Capabilities & Omissions:**
  - `content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md`
  - `data/reusables/enterprise-migration-tool/data-not-migrated.md`
  - `data/reusables/enterprise-migration-tool/branch-protection-migration.md`
  - `data/reusables/enterprise-migration-tool/limitations-of-dotcom.md`
  - `data/reusables/enterprise-migration-tool/limitations-of-migration-tooling.md`
  - `data/reusables/enterprise-migration-tool/git-repo-size-limit.md`
  - `data/reusables/enterprise-migration-tool/skip-releases.md`
- **Ruleset Interactions & Bypass Enforcement:**
  - `data/reusables/enterprise-migration-tool/repository-migrations-bypass.md`
  - `content/migrations/troubleshooting/setting-ruleset-bypasses-for-repository-migrations.md`
  - `content/migrations/troubleshooting/troubleshooting-your-migration-with-github-enterprise-importer.md`
  - `content/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/converting-branch-protections-to-rulesets.md`
  - `content/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets.md`
- **Execution & Follow-Up Procedures:**
  - `content/migrations/using-github-enterprise-importer/migrating-between-github-products/overview-of-a-migration-between-github-products.md`
  - `content/migrations/using-github-enterprise-importer/migrating-between-github-products/migrating-organizations-from-githubcom-to-github-enterprise-cloud.md`
  - `content/migrations/using-github-enterprise-importer/migrating-between-github-products/migrating-repositories-from-githubcom-to-github-enterprise-cloud.md`
  - `content/migrations/using-github-enterprise-importer/completing-your-migration-with-github-enterprise-importer/accessing-your-migration-logs-for-github-enterprise-importer.md`
  - `content/migrations/using-github-enterprise-importer/completing-your-migration-with-github-enterprise-importer/reclaiming-mannequins-for-github-enterprise-importer.md`
  - `content/migrations/overview/mannequins-and-user-activity.md`
  - `data/reusables/enterprise-migration-tool/team-references.md`

---

## 3. Migration Scope Distinctions: Org vs. Repo Migration

GitHub documentation specifies different platform mechanics depending on whether GEI executes an **Organization Migration** or a **Repository Migration**. In our target scenario (GHEC $\rightarrow$ GHEC-EMU), these differences dictate pipeline design:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       GHEC → GHEC-EMU MIGRATION SCOPE                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
         ┌─────────────────────────────┴─────────────────────────────┐
         ▼                                                           ▼
┌─────────────────────────────────┐         ┌─────────────────────────────────┐
│  Organization Migration (GEI)   │         │    Repository Migration (GEI)   │
│   `gh gei migrate-org`          │         │    `gh gei migrate-repo`        │
├─────────────────────────────────┤         ├─────────────────────────────────┤
│ • Destination: Brand new org    │         │ • Destination: Existing org     │
│ • Requires Enterprise Owner     │         │ • Requires Org Owner / Migrator │
│ • All repos at once (no waves)  │         │ • Flexible cohorts / batching   │
│ • Repos forced to private       │         │ • Default private (--target-    │
│ • Teams & repo access migrated  │         │   repo-visibility supported)    │
│ • Team membership NOT migrated  │         │ • Teams NOT migrated            │
│ • Org webhooks migrated (off)   │         │ • Team access NOT migrated      │
│ • PR commit settings reset      │         │ • Repo webhooks migrated (off)  │
│ • Max 5,000 repos               │         │ • PR commit settings reset      │
└─────────────────────────────────┘         └─────────────────────────────────┘
```

### Detailed Operational Comparison

| Migration Attribute             | Organization Migration (`gh gei migrate-org`)                                         | Repository Migration (`gh gei migrate-repo`)                                      | Architectural Strategy for Suite                                                                                    |
| :------------------------------ | :------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| **Destination Organization**    | Must **not** exist prior to migration; created dynamically in destination enterprise. | Must **already exist** in destination enterprise.                                 | Suite supports both: prepared EMU destination orgs (repo migration) and greenfield org cutovers.                    |
| **Operator Access Level**       | Destination **Enterprise Owner** + Source Org Owner / Migrator.                       | Source Org Owner / Migrator + Target Org Owner / Migrator.                        | Repo migrations allow delegated consultant execution without enterprise-wide master privileges.                     |
| **Repository Cohort Execution** | Monolithic: all repositories migrate concurrently; cannot skip or batch.              | Granular: repositories can be sequenced, filtered, batched, or executed in waves. | Suite uses `@ghec/analysis` dependency graph to partition repositories into dependency-ordered waves.               |
| **Repository Visibility**       | All repositories migrate as `private`.                                                | Defaults to `private`; accepts `--target-repo-visibility`.                        | Suite discovers source visibility and runs post-GEI reconciliation to restore `internal` or `public`.               |
| **Team Structures**             | Migrates team tree and team metadata.                                                 | Does **not** migrate teams or team trees.                                         | Suite's `teams` module recreates team hierarchy trees in target org prior to repository migrations.                 |
| **Team Repository Permissions** | Migrated automatically.                                                               | **Not** migrated.                                                                 | Suite's `teams` module binds repository access (`read`, `write`, `admin`, etc.) post-GEI.                           |
| **Team Membership (Users)**     | **Not** migrated (teams created empty).                                               | **Not** migrated.                                                                 | In EMU, team membership is governed out-of-band by IdP Group Sync (SCIM/SAML). Suite emits IdP mapping reports.     |
| **Organization Webhooks**       | Migrated in **disabled** state (`active: false`).                                     | N/A (organization-level data not touched).                                        | Suite reconciles organization webhooks, injects secrets, and sets `active: true`.                                   |
| **Repository Webhooks**         | Active webhooks migrated as **disabled**.                                             | Active webhooks migrated as **disabled**.                                         | Suite reconciles migrated webhooks by matching URL, rehydrating secrets, and enabling them (anti-duplication).      |
| **Release Limitations**         | Max 10 GiB per repository (hard limit).                                               | Max 10 GiB per repo (`--skip-releases` supported).                                | Suite executes release preflight; if $>10\text{ GiB}$, triggers `--skip-releases` and runs REST fallback streaming. |
| **Mannequin Reclamation**       | Created under destination organization.                                               | Created under destination organization.                                           | Suite runs bulk reclamation with `--skip-invitation` for immediate EMU user attribution.                            |

---

## 4. Gap Classification Taxonomy

Every item omitted, partially migrated, or requiring follow-up is mapped into one of five rigorous architectural categories:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        GAP CLASSIFICATION TAXONOMY                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Category A: API Migration Module                                            │
│   • Standard Octokit REST/GraphQL CRUD engine (discover -> plan -> apply -> verify)│
│   • Idempotent, diff-based state reconciliation (PUT/PATCH over POST)       │
├─────────────────────────────────────────────────────────────────────────────┤
│ Category B: Specialized Migration Strategy                                  │
│   • Multi-tool orchestration beyond single API CRUD                         │
│   • Git CLI mirroring, Git LFS streaming, chunked release asset transport   │
├─────────────────────────────────────────────────────────────────────────────┤
│ Category C: Reconfiguration Workflow                                        │
│   • Platform entities requiring administrative re-binding or IdP sync       │
│   • Emits machine-readable matrices, IdP group maps, and setup checklists   │
├─────────────────────────────────────────────────────────────────────────────┤
│ Category D: Validation & Reporting Only                                     │
│   • Ephemeral, read-only, or recomputed metadata                            │
│   • Audited during preflight/post-migration with automated soundness checks │
├─────────────────────────────────────────────────────────────────────────────┤
│ Category E: Irrecoverable / Unsupported                                      │
│   • Hard platform boundary with zero API or CLI support                     │
│   • Explicitly classified, documented, and reported without silent omission │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Master GEI Migration Coverage Matrix

The following table provides the exhaustive audit of all 54 platform features and data entities across the GHEC $\rightarrow$ GHEC-EMU migration lifecycle.

| #   | Resource / Feature                   | Scope   | GEI Native Behavior       | Importance    | Discoverable?   | Migratable?   | Cat   | Automation Strategy & Suite Responsibility                 | Backlog Task  | Gap?    | Recommended Action                            |
| --- | ------------------------------------ | ------- | ------------------------- | ------------- | --------------- | ------------- | ----- | ---------------------------------------------------------- | ------------- | ------- | --------------------------------------------- |
| 1   | **Git source code & commits**        | Repo    | Migrated                  | Critical      | Yes (Git/API)   | Yes           | GEI   | Native GEI execution wrapper                               | Task 014      | No      | Maintain subprocess wrapper and log parsing   |
| 2   | **Commit history & trees**           | Repo    | Migrated                  | Critical      | Yes (Git)       | Yes           | GEI   | Native GEI execution wrapper                               | Task 014      | No      | Validate ref logs                             |
| 3   | **Pull requests & discussions**      | Repo    | Migrated                  | Critical      | Yes (API)       | Yes           | GEI   | Native GEI execution wrapper                               | Task 014      | No      | Track via migration log issue                 |
| 4   | **Issues & issue comments**          | Repo    | Migrated                  | Critical      | Yes (API)       | Yes           | GEI   | Native GEI execution wrapper                               | Task 014      | No      | Track via migration log issue                 |
| 5   | **Milestones**                       | Repo    | Migrated                  | High          | Yes (API)       | Yes           | GEI   | Native GEI execution wrapper                               | Task 014      | No      | Verified post-GEI                             |
| 6   | **Wikis**                            | Repo    | Migrated (no attachments) | Medium        | Yes (Git)       | Yes           | GEI   | Native GEI execution wrapper                               | Task 014      | No      | Verify wiki git repo                          |
| 7   | **Commit comments**                  | Repo    | Migrated                  | Medium        | Yes (API)       | Yes           | GEI   | Native GEI execution wrapper                               | Task 014      | No      | Handled natively                              |
| 8   | **Repository topics & labels**       | Repo    | Migrated                  | Medium        | Yes (API)       | Yes           | GEI   | Native GEI execution wrapper; verify post-GEI              | Task 014, 025 | No      | Reconcile if missing                          |
| 9   | **Autolink references**              | Repo    | Migrated                  | Medium        | Yes (API)       | Yes           | GEI   | Native GEI execution wrapper; reconcile if missing         | Task 014, 025 | No      | Reconcile via REST if missed                  |
| 10  | **GitHub Pages settings**            | Repo    | Migrated                  | Medium        | Yes (API)       | Yes           | GEI   | Native GEI execution wrapper                               | Task 014      | No      | Handled natively                              |
| 11  | **Issue/PR attachments**             | Repo    | Migrated                  | High          | Yes (URL)       | Yes           | GEI   | Native GEI execution wrapper                               | Task 014      | No      | Handled natively                              |
| 12  | **User history on issues/PRs**       | Repo    | Migrated as Mannequins    | High          | Yes (GraphQL)   | Yes           | GEI+B | Reattribute post-GEI via Mannequin Engine                  | Task 027      | **Yes** | Implement Task 027 with `--skip-invitation`   |
| 13  | **Branch Protections (Classic)**     | Repo    | Partially Migrated        | Critical      | Yes (REST)      | Reconcile     | A     | Diff and apply 7 omitted settings/exceptions               | Task 013      | **Yes** | Update Task 013 for reconciliation            |
| 14  | **Repository Rulesets**              | Repo    | Not Migrated              | Critical      | Yes (REST)      | Yes           | A     | API CRUD module; recreate rulesets & bypasses              | Task 013      | **Yes** | Full module implementation in Task 013        |
| 15  | **Organization Rulesets**            | Org     | Not Migrated              | Critical      | Yes (REST)      | Yes           | A     | API CRUD module; recreate org rulesets                     | Task 013      | **Yes** | Support org scope in Task 013                 |
| 16  | **Target Ruleset Bypasses**          | Org/Ent | Migration Blocker         | Critical      | Yes (REST)      | Config        | C/D   | Preflight check for "Repository migrations" in Exempt mode | Task 022      | **Yes** | Implement destination preflight in Task 022   |
| 17  | **Actions Variables (Repo)**         | Repo    | Not Migrated              | High          | Yes (REST)      | Yes           | A     | API CRUD module; full discovery and upsert                 | Task 008, 010 | **Yes** | Deliver Task 008 module                       |
| 18  | **Actions Variables (Org)**          | Org     | Not Migrated              | High          | Yes (REST)      | Yes           | A     | API CRUD module; visibility & repo mapping                 | Task 016      | **Yes** | Deliver Task 016 module                       |
| 19  | **Actions Secrets (Repo)**           | Repo    | Not Migrated              | High          | Metadata Only   | Rehydrate     | A     | Encrypted blank default (DEC-004) or vault                 | Task 011      | **Yes** | Deliver Task 011 module                       |
| 20  | **Actions Secrets (Org)**            | Org     | Not Migrated              | High          | Metadata Only   | Rehydrate     | A     | Encrypted blank default or vault injection                 | Task 016      | **Yes** | Deliver Task 016 module                       |
| 21  | **Dependabot Secrets (Repo/Org)**    | Both    | Not Migrated              | High          | Metadata Only   | Rehydrate     | A     | Rehydrate blank/vault secrets at dependabot endpoint       | Task 011, 016 | **Yes** | Expand Tasks 011/016 for Dependabot endpoints |
| 22  | **Codespaces Secrets (Repo/Org)**    | Both    | Not Migrated              | High          | Metadata Only   | Rehydrate     | A     | Rehydrate blank/vault secrets at codespaces endpoint       | Task 011, 016 | **Yes** | Expand Tasks 011/016 for Codespaces endpoints |
| 23  | **Deployment Environments**          | Repo    | Not Migrated              | High          | Yes (REST)      | Yes           | A     | Recreate environments, reviewers, wait timers              | Task 012      | **Yes** | Deliver Task 012 module                       |
| 24  | **Environment Secrets & Vars**       | Repo    | Not Migrated              | High          | Mixed           | Rehydrate     | A     | Migrate environment-level variables & secrets              | Task 012      | **Yes** | Expand Task 012 for env vars & secrets        |
| 25  | **Git LFS Objects**                  | Repo    | Not Migrated              | Critical      | Yes (Git/API)   | Yes           | B     | Dual-remote `git lfs fetch`/`push` streaming               | Task 023      | **Yes** | Implement dedicated Task 023 strategy         |
| 26  | **Releases (<10 GiB)**               | Repo    | Migrated                  | High          | Yes (REST)      | Yes           | GEI   | Native GEI execution wrapper                               | Task 014      | No      | Handled natively                              |
| 27  | **Releases (>10 GiB / Overflow)**    | Repo    | Not Migrated (Limit)      | High          | Yes (REST)      | Fallback      | B     | Coordinate `--skip-releases` and REST stream fallback      | Task 024      | **Yes** | Implement dedicated Task 024 fallback         |
| 28  | **Repository Webhooks**              | Repo    | Migrated (Disabled)       | High          | Yes (REST)      | Reconcile     | A     | Reconcile target webhooks, inject secret, activate         | Task 018      | **Yes** | Update Task 018 to PATCH anti-duplication     |
| 29  | **Organization Webhooks**            | Org     | Migrated (Disabled)       | High          | Yes (REST)      | Reconcile     | A     | Reconcile target webhooks, inject secret, activate         | Task 018      | **Yes** | Support org webhooks in Task 018              |
| 30  | **Webhook Secrets**                  | Both    | Not Migrated              | High          | No (Write-only) | Rehydrate     | A     | Injected from vault/env during reconciliation              | Task 018      | **Yes** | Add secret injection hooks to Task 018        |
| 31  | **Repository Visibility**            | Repo    | Reset to Private          | Critical      | Yes (REST)      | Reconcile     | A     | Capture source visibility; restore via REST post-GEI       | Task 025      | **Yes** | Implement Task 025 reconciliation             |
| 32  | **PR Commit Message Defaults**       | Repo    | Reset to Defaults         | Medium        | Yes (REST)      | Reconcile     | A     | Reconcile squash/merge commit message templates            | Task 025      | **Yes** | Implement Task 025 reconciliation             |
| 33  | **Custom Properties (Org Schema)**   | Org     | Not Migrated              | High          | Yes (REST)      | Yes           | A     | Define schema via `PUT /orgs/{org}/properties/schema`      | Task 026      | **Yes** | Implement Task 026 `org-custom-properties`    |
| 34  | **Custom Properties (Repo Values)**  | Repo    | Not Migrated              | High          | Yes (REST)      | Yes           | A     | Assign values via `PATCH /orgs/{org}/properties/values`    | Task 026      | **Yes** | Implement Task 026 `repo-custom-properties`   |
| 35  | **Teams & Hierarchy Trees**          | Org     | Migrated (Org)/No (Repo)  | Critical      | Yes (REST)      | Yes           | A     | Recreate team DAG in repo migrations prior to access       | Task 017      | **Yes** | Deliver Task 017 module                       |
| 36  | **Team Repository Access**           | Repo    | Migrated (Org)/No (Repo)  | Critical      | Yes (REST)      | Yes           | A     | Bind repository permissions (`read`, `write`, `admin`)     | Task 017      | **Yes** | Deliver Task 017 module                       |
| 37  | **Team Membership (Users)**          | Org     | Not Migrated              | High          | Yes (REST)      | Decoupled     | C     | In EMU, emit IdP Group Sync mapping report (DEC-005)       | Task 017      | **Yes** | Emit IdP Group mapping export in Task 017     |
| 38  | **Direct Collaborators (Users)**     | Repo    | Not Migrated              | Medium        | Yes (REST)      | Mapped/Warn   | A/D   | Map EMU usernames (`octocat_acme`); warn if blocked        | Task 017, 022 | **Yes** | Preflight checks & mapping rules              |
| 39  | **Base Organization Permissions**    | Org     | Migrated (Org)/No (Repo)  | High          | Yes (REST)      | Reconcile     | A     | Reconcile org default repo permission (`read`/`none`)      | Task 017      | **Yes** | Handle in Task 017                            |
| 40  | **Mannequin Reclamation**            | Org     | Not Migrated              | High          | Yes (GraphQL)   | Yes           | B     | Export CSV, map EMU handles, run `--skip-invitation`       | Task 027      | **Yes** | Implement Task 027 reattribution engine       |
| 41  | **Commit Authorship in EMU**         | User    | Platform Constraint       | Medium        | No              | Notice        | D/E   | Report limitation: EMU accounts only map primary email     | Task 027      | No      | Document in reports and customer guides       |
| 42  | **CODEOWNERS Team References**       | Repo    | Not Migrated (Broken)     | High          | Yes (Git)       | Yes           | B     | Parse `@source/team`; rewrite to target slugs              | Task 028      | **Yes** | Implement Task 028 repair module              |
| 43  | **GHAS Settings & Policies**         | Repo    | Migrated (if target on)   | High          | Yes (REST)      | Reconcile     | A     | Preflight target GHAS license; reconcile repo switches     | Task 022, 029 | **Yes** | Implement Task 029 GHAS module                |
| 44  | **Secret Scanning Remediations**     | Repo    | Not Migrated              | Medium        | Yes (REST)      | Reconcile     | B     | Full auto-rescan on target; sync dismissal states          | Task 029      | **Yes** | Sync dismissal states in Task 029             |
| 45  | **Code Scanning Results (SARIF)**    | Repo    | Not Migrated              | Low           | Yes (REST)      | Partial Sync  | B     | Download source SARIF; upload to target via REST           | Task 029      | **Yes** | Implement optional SARIF sync in Task 029     |
| 46  | **Dependabot Alerts & Updates**      | Repo    | Recomputed Natively       | Medium        | Auto-rescan     | Auto          | D     | Auto-recomputed on target; report historical dismissals    | Task 029      | No      | Automated by platform                         |
| 47  | **GitHub Apps & Installations**      | Both    | Not Migrated              | High          | Yes (REST)      | Advisory      | C     | Discover installed apps; generate Reinstallation Matrix    | Task 030      | **Yes** | Implement Task 030 advisory planner           |
| 48  | **GitHub Packages**                  | Both    | Not Migrated              | Medium        | Yes (Registry)  | Rebuild / CI  | C/E   | Inventory packages; emit cutover guide for CI/CD push      | Task 030      | **Yes** | Implement Task 030 package cutover guide      |
| 49  | **Self-Hosted & Larger Runners**     | Both    | Not Migrated              | High          | Yes (REST)      | Advisory      | C     | Discover runners; generate runner group setup plan         | Task 030      | **Yes** | Implement Task 030 runner plan                |
| 50  | **Discussions & Projects (v2)**      | Both    | Not Migrated              | Medium        | Yes (GraphQL)   | Advisory/Warn | D/E   | Report fidelity loss; emit manual export guide             | Task 030      | **Yes** | Document in Task 030                          |
| 51  | **Fork Relationships**               | Repo    | Not Migrated              | Low           | Yes (API)       | Unsupported   | E     | Repos import as standalone roots; report impact            | Task 022, 030 | No      | Documented platform limitation                |
| 52  | **Workflow Run History & Artifacts** | Repo    | Not Migrated              | Informational | Yes (REST)      | Unsupported   | E     | Ephemeral data; explicitly unsupported                     | Task 030      | No      | Documented platform limitation                |
| 53  | **Enterprise Audit Logs**            | Org     | Not Migrated              | Informational | Yes (REST)      | Unsupported   | E     | Immutable enterprise audit trail; unsupported              | Task 030      | No      | Documented platform limitation                |
| 54  | **Stars, Watchers & Activity**       | Repo    | Not Migrated              | Informational | Yes (REST)      | Unsupported   | E     | Social/ephemeral data; explicitly unsupported              | Task 030      | No      | Documented platform limitation                |

---

## 6. Deep Dive: Technical Gap Solutions

### 6.1 Branch Protection Partial Migration Engine (Task 013)

GEI migrates classic branch protections but systematically strips 7 critical governance configurations:

1. `bypass_pull_request_allowances`: Specific users, teams, or apps exempt from required PRs.
2. `require_last_push_approval`: Dismissal of stale PR approvals when new commits are pushed.
3. `required_deployments_enforcement_level`: Requiring successful deployment to designated environments before merge.
4. `lock_branch`: Marking the branch strictly read-only.
5. `block_creations`: Restricting branch creation matching the pattern.
6. `allow_force_pushes`: Ignored when set to "Specify who can force push".
7. `dismissal_restrictions`: Specific actors permitted to dismiss reviews.

#### Reconciliation Architecture

Instead of blindly recreating branch protections (which risks overwriting valid GEI metadata or erroring on existing branches), the module executes:

```text
Source Branch Protection (REST) ──┐
                                  ├──► Diff Engine (Omitted Settings) ──► In-Place Reconciliation (PUT)
Target Branch Protection (REST) ──┘
```

1. **Discover:** Fetch source branch protection using `GET /repos/{owner}/{repo}/branches/{branch}/protection`.
2. **Inspect Target:** Following GEI completion, query target branch protection.
3. **Diff:** Isolate properties where target is null/default but source was configured.
4. **Apply:** Execute `PUT /repos/{owner}/{repo}/branches/{branch}/protection` merging the missing settings.
5. **Modernization Option:** If `--convert-to-rulesets` is enabled, transform both classic protections and missing settings into modern repository rulesets using GitHub's canonical mapping rules.

---

### 6.2 Destination Ruleset Preflight & Exempt Bypass Enforcement (Task 022)

GitHub Enterprise Importer transfers Git objects by pushing batches of refs directly to the destination repository. During this internal push:

- Destination organization and enterprise rulesets are evaluated against the incoming refs.
- If existing commits violate rules (e.g., author email must match `@acme.corp`, commit must be signed, or forbidden file patterns), GEI fails with error:
  `GH013: Repository rule violations found for refs/heads/...`
- Furthermore, ruleset evaluations can **time out** on large repositories.

#### The "Exempt" Mode Requirement

Ruleset bypasses support two modes:

- **Always Allow:** The ruleset is still evaluated, but actors receive a bypass prompt. _This still triggers evaluation timeouts during migration._
- **Exempt:** The ruleset is **not evaluated at all** for the actor.

#### Technical Preflight Verification

Task 022 inspects destination enterprise and organization rulesets:

```typescript
GET / orgs / { targetOrg } / rulesets;
```

For every active ruleset, the preflight asserts:

- An entry in `bypass_actors` has `actor_type: 'RepositoryRole'` with `actor_id: 1` ("Repository migrations") OR `actor_type: 'Integration'`.
- The bypass mode is strictly set to **`exempt`**.
- If missing or set to `always_allow`, preflight halts with diagnostic instructions.

---

### 6.3 Git LFS Dual-Remote Streamed Migration Strategy (Task 023)

GEI migrates repository Git data but **completely ignores Git LFS objects**. Only the pointer files are written to the target repository.

#### Storage & Execution Mechanics

Task 023 implements a specialized strategy executed on persistent self-hosted runners:

1. **Preflight Detection:** Inspects repository root `.gitattributes` for `filter=lfs` and queries discovery metadata to compute total LFS storage volume.
2. **Dual-Remote Clone & Mirror:**
   ```bash
   git clone --mirror "https://x-access-token:${SOURCE_PAT}@github.com/${SOURCE_ORG}/${REPO}.git" "/tmp/lfs-staging/${REPO}.git"
   cd "/tmp/lfs-staging/${REPO}.git"
   git lfs fetch --all origin
   git remote set-url origin "https://x-access-token:${TARGET_PAT}@github.com/${TARGET_ORG}/${REPO}.git"
   git lfs push --all origin
   rm -rf "/tmp/lfs-staging/${REPO}.git"
   ```
3. **Bandwidth & Quota Guard:** Verifies that target enterprise Git LFS storage and bandwidth quotas are enabled before initiating bulk push.
4. **Verification:** Queries `GET /repos/{targetOrg}/{targetRepo}/lfs` or validates sample object hashes.

---

### 6.4 Large Releases & Metadata Overflow Strategy (Task 024)

GEI enforces strict limits on repository archive sizes:

- **Release Limit:** $10\text{ GiB}$ maximum per repository.
- **Metadata Limit:** $40\text{ GiB}$ total compressed metadata (issues, PRs, comments, and release assets).

#### Two-Tier Orchestration Pipeline

```text
Preflight: Calculate Total Release Assets Size
                       │
          Size > 10 GiB or Metadata > 40 GiB?
         /                                    \
       No                                      Yes
       │                                        │
Run GEI Normal                         Run GEI with --skip-releases Flag
(releases included)                             │
                                       REST Fallback Engine (Task 024)
                                                │
                                       Discover Source Releases via REST
                                                │
                                       Recreate Releases on Target
                                                │
                                       Stream Binary Assets (Chunked HTTP)
                                                │
                                       Verify Release & Asset Inventory
```

1. **Preflight Assessment:** Task 022 sums `size` across all assets in `GET /repos/{sourceOrg}/{sourceRepo}/releases`.
2. **Conditional GEI Invocation:** If size exceeds $10\text{ GiB}$, the GEI executor automatically passes `--skip-releases`.
3. **REST Fallback Engine:**
   - Fetches releases from source: `tag_name`, `name`, `body`, `draft`, `prerelease`, `make_latest`.
   - Creates release on target: `POST /repos/{targetOrg}/{targetRepo}/releases`.
   - Downloads each asset as a stream (`GET /repos/.../releases/assets/{id}` with `Accept: application/octet-stream`).
   - Streams asset directly to target (`POST https://uploads.github.com/.../assets?name={name}`).
   - Handles asset size limits ($2\text{ GiB}$ per file via standard API; flags $>2\text{ GiB}$ assets).

---

### 6.5 Repository Visibility & PR Settings Reconciliation (Task 025)

#### Repository Visibility

- **GEI Behavior:** Forces every migrated repository to `private` visibility.
- **Problem:** Breaks organizations that rely on `internal` repositories for cross-team package consumption or open-source `public` repositories.
- **Solution:** Task 025 records source visibility during preflight. Following GEI completion, it executes:
  ```typescript
  PATCH /repos/{targetOrg}/{targetRepo}
  { "visibility": sourceVisibility }
  ```
  _(Honors enterprise policy restrictions if destination forbids public/internal repositories)._

#### Pull Request Commit Message Settings

- **GEI Behavior:** Resets commit message settings for squash merging and merge commits to default GitHub templates.
- **Solution:** Task 025 reconciles:
  - `squash_merge_commit_title`: `PR_TITLE` vs `COMMIT_OR_PR_TITLE`
  - `squash_merge_commit_message`: `PR_BODY`, `COMMIT_MESSAGES`, `BLANK`
  - `merge_commit_title`: `PR_TITLE`, `MERGE_MESSAGE`
  - `merge_commit_message`: `PR_TITLE`, `PR_BODY`, `BLANK`

---

### 6.6 Webhooks Anti-Duplication Reconciliation (Task 018)

- **GEI Behavior:** GEI migrates active webhooks, but sets `active: false` and purges `secret`.
- **Failure Mode:** If a migration module executes `POST /repos/{owner}/{repo}/hooks`, duplicate webhooks are created with identical target URLs.
- **Solution:** Task 018 implements strict reconciliation:
  1. Queries target webhooks created by GEI.
  2. Matches target webhooks to source webhooks by `config.url` and event subscriptions.
  3. Re-hydrates secret token from client vault or secure environment.
  4. Calls `PATCH /repos/{targetOrg}/{targetRepo}/hooks/{hook_id}` with `{ "active": true, "config": { "secret": secretValue } }`.
  5. Emits warnings for webhooks where secret values were not supplied.

---

### 6.7 Mannequin Reclamation & EMU Fast-Track (Task 027)

#### The Mannequin Mechanism

GEI migrates issue and PR authors as placeholder identities ("mannequins") with display names matching source contributors.

#### EMU Fast-Track (`--skip-invitation`)

In standard migrations, reclaiming a mannequin sends an email invitation that the user must accept. In **GHEC-EMU**, enterprise administrators have authority over all provisioned accounts. Therefore:

```bash
gh gei reclaim-mannequin --github-target-org "$TARGET_ORG" --csv "mannequins.csv" --skip-invitation
```

This reattributes historical issues, PRs, and comments **immediately** without waiting for user action.

#### Critical EMU Email Limitation

> [!WARNING]
> In GHEC-EMU, users **cannot add secondary personal email addresses** to their managed accounts. Only commits authored with the user's primary IdP email address are attributed to the EMU user. Historical commits authored with personal emails or `noreply` addresses remain attributed to the commit email string and cannot be linked to the EMU user. The suite documents this platform boundary in audit reports.

---

### 6.8 Custom Properties Architecture (Task 026)

GEI drops all repository custom properties. Custom properties require strict dependency ordering:

1. **Organization Schema Level (`org-custom-properties`):**
   - Discovers property definitions (`string`, `single_select`, `multi_select`, `true_false`).
   - Creates or updates schemas on target:
     ```typescript
     PUT / orgs / { targetOrg } / properties / schema;
     ```
2. **Repository Assignment Level (`repo-custom-properties`):**
   - After the organization schema exists, discovers property values assigned to source repositories.
   - Batch-updates target repositories:
     ```typescript
     PATCH /orgs/{targetOrg}/properties/values
     {
       "repository_names": [targetRepo],
       "properties": [{ "property_name": "tier", "value": "production" }]
     }
     ```

---

### 6.9 CODEOWNERS & Team References Repair (Task 028)

- **The Problem:** References like `@source-org/platform-team` in `.github/CODEOWNERS`, issue templates, or workflow files break because the organization slug changes or team slugs are adjusted in GHEC-EMU.
- **The Solution:** Task 028 scans repository files post-GEI:
  1. Discovers all `.github/CODEOWNERS`, `docs/CODEOWNERS`, and `CODEOWNERS` files.
  2. Parses `@organization/team-slug` tokens.
  3. Replaces source organization and team slugs with mapped destination slugs from Task 017's team mapping registry.
  4. Commits the updated file directly to the default branch or opens an automated pull request for review.

---

## 7. Migration Coverage Scorecard

The following scorecard proves complete coverage across all 54 audited platform features:

```text
================================================================================
                    MIGRATION COVERAGE AUDIT SCORECARD
================================================================================
  1. GEI-Native Responsibilities (Git, PRs, Issues, Milestones, Wikis):     12
  2. Targeted API Modules (Variables, Secrets, Environments, Rulesets):     16
  3. Specialized Strategies (Git LFS, Release Fallback, Mannequins):         7
  4. Reconfiguration Workflows (Teams IdP Sync, Apps, Runners):              4
  5. Validation & Reporting (Discussions, Projects v2, Soundness):           5
  6. Platform Unsupported (Audit Logs, Run History, Stars, Keys):           10
--------------------------------------------------------------------------------
  Total Audited Capabilities:                                               54
  Unclassified / Unhandled Items:                                            0
================================================================================
```

---

## 8. Top 5 Highest-Risk Migration Gaps

These five gaps pose the greatest threat to migration timeline, data integrity, and production cutover if not addressed immediately:

1. **Git LFS Object Data Loss (Risk: CRITICAL):**
   GEI silently skips Git LFS objects. If not handled by Task 023, developers pull empty pointer files post-migration, breaking builds and deployments across the enterprise.
2. **Target Ruleset Evaluation Blockers (Risk: CRITICAL):**
   Active rulesets on destination organizations or enterprises cause GEI pushes to fail (`GH013`). Task 022 preflight verification is mandatory before executing any migration waves.
3. **Oversized Release & Metadata Timeouts (Risk: HIGH):**
   Repositories with $>10\text{ GiB}$ of release assets fail GEI. Task 024's automated `--skip-releases` coordination and REST fallback prevents stalled cutovers.
4. **Repository Visibility Reset to Private (Risk: HIGH):**
   GEI defaults all repositories to private, breaking internal dependency resolution and inner-source collaboration models across the enterprise. Task 025 must immediately restore intended visibility.
5. **Branch Protection Silent Degradation (Risk: HIGH):**
   GEI drops bypass allowances, last push approvals, and deployment enforcement. Without Task 013's reconciliation, critical release branches lose compliance controls during cutover.
