# Feature Specification: Comprehensive Synthetic Demo Content Seeder

**Feature Branch**: `002-seed-demo-content`

**Created**: 2026-10-14

**Status**: Draft

**Input**: User description: "Create an on-demand GitHub Actions workflow (`.github/workflows/seed-demo-content.yml`) and supporting TypeScript/Node automation script (`scripts/seed-demo-content.ts` or CLI subcommand) capable of seeding comprehensive synthetic demo content for all items migrated by the GHEC Consultant Suite. 1. Context & Objectives: The GHEC Consultant Suite migrates GitHub Enterprise Cloud (GHEC) organizations to GHEC with Enterprise Managed Users (GHEC-EMU) across 32 distinct items and modules. For client demos, pre-migration dry-runs, and regression testing, consultants require a push-button mechanism to provision synthetic source content at both the organization and repository levels without manual setup. 2. Workflow Trigger & Dispatch Inputs: organization, repository, scope_level, content_type, pat_secret_name, dry_run, cleanup_existing. 3. Inventory of Migration Items to Generate: Organization-Level (13 items) and Repository-Level (19 items). 4. Technical & Architectural Invariants: Zero-exposure security (DEC-004), Dynamic Secret Access, Idempotency, Rate Limiting, Step Summary."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Full-Stack End-to-End Demo Provisioning (Priority: P1)

As an enterprise migration consultant, I need an automated, on-demand mechanism to seed a comprehensive synthetic demo environment across both organization-level and repository-level resources, so that I can demonstrate the full GHEC-to-EMU migration capabilities to enterprise customers and execute end-to-end dry runs without tedious manual setup.

**Why this priority**: Provisioning the complete set of supported migration resources in a single trigger is the primary value proposition. Without a reliable, automated seeding tool covering all 32 migration items, pre-sales demos and pre-cutover rehearsals require hours of brittle manual setup across organization and repository administrative consoles.

**Independent Test**: Can be tested independently by running the seeder targeting an empty or existing demo organization with `scope_level: both` and verifying that all 13 organization items and 19 repository items are provisioned or updated, logging a complete summary with zero errors.

**Acceptance Scenarios**:

1. **Given** a valid administrative access token and target organization name, **When** the operator triggers the workflow with `scope_level: both` and `content_type: all`, **Then** the system provisions all 13 organization-level governance assets and all 19 repository-level assets, automatically creating and initializing the target repository if it does not already exist.
2. **Given** an existing repository and organization with pre-existing resources, **When** the operator re-executes the seeding workflow, **Then** all operations succeed idempotently without creating duplicate entities or throwing 409 Conflict errors.

---

### User Story 2 - Scoped & Preset-Based Targeted Seeding (Priority: P2)

As a consultant or automated test engineer, I need to execute targeted seeding runs filtered by scope level (`organization`, `repository`, or `both`) and content category presets (such as `core-governance`, `actions-and-security`, `collaboration`, `artifacts-and-code`) or discrete module IDs, so that I can validate specific migration stages, test isolated modules, or avoid unnecessary API usage.

**Why this priority**: Fast feedback cycles during development and testing require running focused subsets of resources rather than provisioning all 32 items every time.

**Independent Test**: Can be tested independently by invoking the seeder with `scope_level: repository` and `content_type: actions-and-security`, verifying that only Actions/security-related repository items are provisioned and that organization-level resources remain untouched.

**Acceptance Scenarios**:

1. **Given** `scope_level: organization` selected, **When** the workflow executes, **Then** only the 13 organization-level items are processed and repository operations are completely bypassed even if a repository name is provided.
2. **Given** `content_type` set to a preset like `core-governance`, **When** the workflow executes, **Then** only the resources mapped to that preset (`org-settings`, `teams`, `custom-roles`, `ip-allow-lists`, `org-custom-properties`, `gei-repo`/`repo-settings`, `repo-custom-properties`, `collaborators`) are processed.
3. **Given** `content_type` specified as a custom comma-separated list (e.g. `teams,rulesets,environments`), **When** the workflow executes, **Then** strictly and only those specified modules are evaluated and provisioned in correct dependency order.

---

### User Story 3 - Dry-Run Simulation & Permission Validation (Priority: P3)

As a consultant working in a customer-managed or security-conscious environment, I need to execute a dry-run provisioning pass that verifies token permissions, validates prerequisite access, and outputs a detailed execution manifest without modifying any remote resources, so that I can inspect the planned changes with stakeholders prior to applying live updates.

**Why this priority**: Enterprise compliance and risk management often require formal review of planned changes before any mutation occurs in source organizations.

**Independent Test**: Can be tested independently by running with `dry_run: true` against a live organization and verifying that the output details all intended modifications while the remote organization and repository remain completely unchanged.

**Acceptance Scenarios**:

1. **Given** `dry_run: true`, **When** the workflow executes, **Then** the system checks administrative access, evaluates all selected resources, displays planned creations/modifications in the step summary, and exits successfully without making any mutating API calls (POST, PUT, PATCH, DELETE).
2. **Given** an authentication token lacking necessary administrative permissions (e.g. missing `admin:org` or `repo`), **When** the dry-run executes, **Then** the system flags the missing permissions with actionable guidance explaining the required OAuth scopes.

---

### User Story 4 - Resource Teardown & Clean Baseline Re-seeding (Priority: P4)

As a test engineer or demo presenter preparing for repeated rehearsal rounds, I need the ability to cleanly purge previously generated synthetic demo resources before re-seeding (`cleanup_existing: true`), so that stale pull requests, closed issues, temporary webhooks, or test teams do not accumulate across successive runs.

**Why this priority**: Preventing clutter and accumulating demo artifacts ensures consistent, repeatable presentation states and reliable baseline verification.

**Independent Test**: Can be tested independently by seeding demo resources, verifying their presence, triggering a run with `cleanup_existing: true`, and validating that only resources matching the synthetic demo naming prefix are cleanly reset or deleted before re-provisioning.

**Acceptance Scenarios**:

1. **Given** `cleanup_existing: true`, **When** the workflow runs, **Then** existing synthetic resources matching the designated demo naming prefix are cleanly removed or reset to initial states before fresh demo content is provisioned.
2. **Given** non-demo resources exist in the target organization or repository (resources not matching the demo naming prefix), **When** cleanup executes, **Then** non-demo resources are strictly preserved and untouched.

---

### User Story 5 - Comprehensive Auditability & Actions Step Summary (Priority: P5)

As an operator running the seeding workflow in GitHub Actions or locally in a terminal, I need a formatted, structured summary detailing every resource created, updated, or skipped, including execution timings and diagnostic warnings, so that I have immediate visibility into environment readiness and verifiable audit evidence.

**Why this priority**: Provides transparency into complex multi-resource operations, enabling immediate detection of skipped items (e.g. enterprise-only features not supported by the target plan) or configuration issues.

**Independent Test**: Can be tested independently by checking the `$GITHUB_STEP_SUMMARY` and stdout log after execution and verifying that a structured Markdown table or breakdown enumerates every item's status, resource name, and duration.

**Acceptance Scenarios**:

1. **Given** an execution of the workflow in GitHub Actions, **When** the run finishes, **Then** `$GITHUB_STEP_SUMMARY` contains an organized Markdown report detailing the execution parameters, an item-by-item status breakdown, total duration, and any diagnostic warnings.
2. **Given** an execution in a local command-line environment, **When** the script completes, **Then** an equivalent formatted table is rendered to stdout.

---

### Edge Cases

- **Missing or Misconfigured PAT Secret**: If the secret referenced by `pat_secret_name` does not exist in the repository/organization secrets store or is empty, the workflow must fail immediately at the pre-flight step with clear, actionable setup instructions, rather than crashing obscurely in mid-execution.
- **Repository Does Not Exist**: When repo-level resources are requested but the specified repository does not exist, the system must automatically create the repository with an initial commit on the default branch before applying any repo-level resources.
- **Organization Plan Incompatibilities**: Certain items (e.g. IP allow lists, runner groups, custom repository roles) require a GitHub Enterprise Cloud plan. If the target organization is on a plan that returns 403/404 for enterprise-specific features, the system must log a clear diagnostic warning and mark the item as skipped rather than aborting the entire run.
- **API Secondary Rate Limits & Backoff**: If GitHub API calls encounter rate limit responses (HTTP 403 with `x-ratelimit-remaining: 0` or HTTP 429), the client must pause and retry using exponential backoff with jitter up to a configurable maximum retry limit.
- **Duplicate Resource Collisions (409 Conflict)**: When resources already exist (e.g., branches, teams, labels, environments, autolinks, custom properties), the system must query first or handle collision responses by performing an in-place update or skipping creation.
- **Zero-Exposure Secret Encryption**: All synthetic secrets (both organization-level and repository-level) must be sealed using libsodium public key encryption before submission. Plaintext secret values must never be logged or echoed in console or step summaries.
- **EMU Identity Boundaries**: Mannequin attributions and team collaborator assignments must accommodate EMU environments where direct external user invitations are restricted, using synthetic mannequin handles and managed team references.

---

## Requirements _(mandatory)_

### Functional Requirements

#### Workflow & Dispatch Parameters

- **FR-001**: The system MUST provide an on-demand GitHub Actions workflow triggered via `workflow_dispatch` at `.github/workflows/seed-demo-content.yml`.
- **FR-002**: The workflow MUST declare the following inputs with exact types and defaults:
  - `organization` (string, required): Target GitHub organization name.
  - `repository` (string, optional): Target repository name (required for repo-level seeding; automatically created if missing).
  - `scope_level` (choice, default: `both`): Selection of `both`, `organization`, or `repository`.
  - `content_type` (choice/string, default: `all`): Selection of presets (`all`, `core-governance`, `actions-and-security`, `collaboration`, `artifacts-and-code`) or a custom comma-separated list of module IDs.
  - `pat_secret_name` (string, default: `GHEC_SOURCE_TOKEN`): Name of the secret containing the GitHub Personal Access Token.
  - `dry_run` (boolean, default: `false`): If true, simulates provisioning and logs planned actions without mutating remote state.
  - `cleanup_existing` (boolean, default: `false`): If true, cleans up or resets existing demo resources matching the demo prefix prior to provisioning.
- **FR-003**: The workflow MUST dynamically resolve the authentication token from `secrets[inputs.pat_secret_name]` and fail gracefully with an explanatory message if the secret is unset or empty.
- **FR-004**: The system MUST provide a supporting TypeScript/Node automation tool callable via CLI subcommand or script (e.g., `scripts/seed-demo-content.ts` / CLI binary) allowing identical execution both in CI/CD workflows and local developer environments.

#### Organization-Level Migration Items (13 Items)

- **FR-005**: The system MUST support synthetic provisioning for all 13 organization-level items:
  1. `org-settings`: Configure organization policies (default repository permission, member repository creation permissions, forking policies, two-factor authentication requirement).
  2. `actions-policies`: Configure organization GitHub Actions permissions, allowed actions list, and fork pull request execution workflows.
  3. `actions-runners`: Provision self-hosted runner group definitions with assigned repository access policies.
  4. `org-variables`: Provision organization-level Actions and Dependabot variables (e.g., `GLOBAL_REGION`, `DEPLOY_TIER`).
  5. `org-secrets`: Provision sealed organization Actions secrets encrypted via libsodium sealed-box using the organization public key.
  6. `org-custom-properties`: Define custom property schemas covering `string`, `single_select`, `multi_select`, and `true_false` types.
  7. `teams`: Provision a multi-tiered nested team hierarchy (parent `engineering`, child `platform-infra`, child `frontend-guild`) with descriptions, privacy settings, and parent-child linkages.
  8. `custom-roles`: Provision custom repository roles at the organization level (e.g., `Release Manager`, `Triage Specialist`) with curated permission sets.
  9. `ip-allow-lists`: Provision organization IP allow list entries and CIDR ranges.
  10. `webhooks`: Provision organization-level webhooks configured with active event triggers pointed to a synthetic test sink (e.g., `https://httpbin.org/post`).
  11. `projects-v2`: Provision GitHub Projects v2 boards with custom fields (Status, Priority, Target Wave) and views.
  12. `apps-inventory`: Verify and document installed GitHub Apps or mock integrations.
  13. `post-migration-mannequins`: Provision mock mannequin committer attributions for identity reclamation testing.

#### Repository-Level Migration Items (19 Items)

- **FR-006**: The system MUST support synthetic provisioning for all 19 repository-level items: 14. `gei-repo` & `repo-settings`: Ensure the base repository exists (creating and initializing it if missing), configure description, topics, merge strategies (squash, rebase, merge commit), auto-merge, and delete-branch-on-merge. 15. `repo-variables`: Provision repository-level Actions and Codespaces variables. 16. `repo-secrets`: Provision sealed repository Actions secrets encrypted via libsodium sealed-box using the repository public key. 17. `repo-custom-properties`: Assign custom property values on the repository conforming to the organization property schema. 18. `environments`: Provision deployment environments (e.g., `production`, `staging`) with wait timers, required reviewers, and deployment branch policies. 19. `branch-protection`: Provision classic branch protection rules on `main` (required pull request approvals, required status checks, admin enforcement). 20. `rulesets`: Provision modern Repository Rulesets targeting default branches, pull request requirements, commit author regex rules, and bypass actor configurations. 21. `webhooks`: Provision repository-level webhook subscriptions. 22. `autolinks`: Provision external issue tracker autolink references (e.g., `JIRA-`, `TICKET-`). 23. `collaborators`: Provision repository collaborator permissions and team access mappings. 24. `deploy-keys`: Provision read-only and write deploy keys using synthetically generated SSH public keys. 25. `issues`: Provision sample issues with markdown bodies, labels, milestones, and assignees. 26. `pull-requests`: Provision active and merged pull requests with dedicated feature branches, sample file commits, and review comments. 27. `discussions`: Provision repository Discussions with custom categories, Q&A threads, and answered states. 28. `releases`: Provision releases and git tags with release notes and downloadable synthetic binary assets. 29. `lfs`: Configure Git LFS tracking (`.gitattributes`) and commit real LFS binary pointer objects. 30. `packages`: Verify or publish reference GitHub Package pointers (e.g., sample npm or ghcr container package reference). 31. `post-migration-codeowners`: Provision `.github/CODEOWNERS` file referencing the seeded team hierarchy. 32. `security`: Configure GitHub Advanced Security (GHAS) settings (Dependabot alerts, secret scanning, push protection, and a sample CodeQL workflow).

#### Content Filtering & Presets

- **FR-007**: The system MUST support content filtering via presets:
  - `all`: All 32 organization and repository items.
  - `core-governance`: `org-settings`, `teams`, `custom-roles`, `ip-allow-lists`, `org-custom-properties`, `gei-repo`/`repo-settings`, `repo-custom-properties`, `collaborators`.
  - `actions-and-security`: `actions-policies`, `actions-runners`, `org-variables`, `org-secrets`, `repo-variables`, `repo-secrets`, `environments`, `branch-protection`, `rulesets`, `security`.
  - `collaboration`: `projects-v2`, `issues`, `pull-requests`, `discussions`, `autolinks`, `post-migration-codeowners`, `post-migration-mannequins`.
  - `artifacts-and-code`: `releases`, `lfs`, `packages`, `deploy-keys`, `webhooks` (both org and repo), `apps-inventory`.
- **FR-008**: The system MUST accept a comma-separated list of individual module identifiers in `content_type` and provision only the specified modules.

#### Architectural, Security & Operational Standards

- **FR-009**: The system MUST comply with the Zero-Exposure Secret Boundary (DEC-004): source secrets are write-only, tokens MUST NOT be logged or written to disk, and all diagnostics MUST redact sensitive tokens (`ghp_*`, `github_pat_*`, authorization headers, and embedded URLs).
- **FR-010**: All provisioning operations MUST be idempotent: rerunning the seeder MUST NOT fail due to already-existing resources, duplicate names, or 409 Conflict status codes.
- **FR-011**: All GitHub API requests MUST implement adaptive rate limiting with exponential backoff and jitter upon encountering HTTP 403 rate-limited or HTTP 429 responses.
- **FR-012**: All synthetic demo resources MUST use a consistent prefix (`demo-` or `ghec-demo-`) to prevent naming collisions with existing production resources and to guarantee safe targeted cleanup.
- **FR-013**: When `cleanup_existing` is true, the system MUST delete or reset only resources matching the demo prefix and MUST NOT delete any un-prefixed or production resources.
- **FR-014**: Upon completion of both live and dry-run executions, the system MUST write a comprehensive Markdown summary to `$GITHUB_STEP_SUMMARY` (when running in GitHub Actions) and stdout, detailing the status of every item (`created`, `updated`, `skipped`, `dry-run`, or `failed`), along with resource identifiers and execution timings.

### Key Entities _(include if feature involves data)_

- **Demo Seed Request**: The structured request object containing all execution parameters: target organization, target repository, scope level (`both`, `organization`, `repository`), content filter (preset or list of module IDs), PAT secret name, dry-run flag, and cleanup flag.
- **Migration Item Provisioner**: A modular definition for each of the 32 migration items, encapsulating its identifier, scope level, category preset, prerequisite dependencies, dry-run simulation handler, live provisioning handler, and cleanup handler.
- **Synthetic Resource Manifest**: The in-memory specification defining the synthetic payload for each resource (e.g. team hierarchy structure, custom property schema definitions, sample issue markdown, ruleset conditions, and dummy binary assets).
- **Seeding Execution Ledger**: The structured collection of execution results recording the outcome (`created`, `updated`, `skipped`, `failed`, `dry-run`), duration, target identifier, and diagnostic messages for every evaluated item.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: **100% Item Coverage**: The seeder supports synthetic generation across all 32 migration items (13 organization-level, 19 repository-level) without gaps.
- **SC-002**: **Zero Manual Setup**: A complete demo environment can be initialized from scratch via a single workflow dispatch click or CLI command invocation in less than 5 minutes.
- **SC-003**: **Flawless Idempotency**: Executing the seeder two or more consecutive times against the same organization and repository achieves a 100% success rate with zero 409 Conflict errors and zero orphaned duplicates.
- **SC-004**: **Absolute Zero-Exposure Compliance**: 100% of generated logs, error messages, and step summaries contain zero plaintext secret values and zero unredacted authentication tokens (`ghp_*`, `github_pat_*`).
- **SC-005**: **Simulation Safety**: In dry-run mode (`dry_run: true`), 100% of planned operations are logged and summarized, and exactly zero remote resources are created, modified, or deleted.
- **SC-006**: **Targeted Scope Fidelity**: When a specific scope level or content preset is supplied, exactly 100% of the matching items are processed and zero unselected items are touched.
- **SC-007**: **Clean Teardown Safety**: When `cleanup_existing: true` is executed, 100% of previously created demo resources matching the designated prefix are reset or removed, while 100% of non-demo resources remain undisturbed.

---

## Assumptions

- **Target Organization Permissions**: The Personal Access Token (PAT) supplied via the designated secret possesses required administrative scopes (`admin:org`, `repo`, `delete_repo`, `workflow`) on the target organization.
- **Enterprise Feature Availability**: Certain capabilities (such as IP allow lists, runner groups, and custom repository roles) require a GitHub Enterprise plan. In organizations where the plan does not permit these features, the system gracefully logs a diagnostic warning and skips the item without failing the entire run.
- **Synthetic Data Safety**: All created content (issues, discussions, PRs, comments, webhooks) uses explicitly synthetic demo data with test sinks (e.g. `https://httpbin.org/post`), preventing unintended external notifications or traffic.
- **Secret Values**: Sealed secrets are encrypted using libsodium sealed-box against the target organization or repository public key with non-sensitive placeholder data (`"demo-placeholder-value"` or `""`), reserving secret names without handling live production credentials.
- **Resource Naming Prefix**: All created resources (repos, teams, roles, variables, secrets, webhooks, environments) adhere to a standard prefix (e.g., `demo-` or `ghec-demo-`) to make synthetic assets immediately identifiable and safely purgeable.
- **Dual Execution Environment**: The automation can be invoked directly from GitHub Actions (`.github/workflows/seed-demo-content.yml`) and from a local terminal or automation script (`scripts/seed-demo-content.ts` / CLI subcommand) with identical configuration options and behavior.
