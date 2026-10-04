# Migration Preflight Engine

The Migration Preflight Engine performs comprehensive, read-only validation of source repositories and destination organization configurations prior to migration execution. It protects migration cutover windows by surfacing platform limits, ruleset bypass gaps, and repository blockers before any network transfer or state mutation occurs.

## Platform Sizing Thresholds

GitHub Enterprise Importer (GEI) and GitHub platform constraints enforce strict sizing boundaries:

| Metric                         | Limit                  | Severity / Action                                                                                                           | Reference                                                                      |
| ------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Repository Git Data**        | $\le 40\text{ GiB}$    | **Blocker** — Rejection by Git backend                                                                                      | `data/reusables/enterprise-migration-tool/git-repo-size-limit.md`              |
| **Single Git Commit**          | $\le 2\text{ GiB}$     | **Blocker** — Cannot be imported; must split commit                                                                         | `data/reusables/enterprise-migration-tool/limitations-of-dotcom.md`            |
| **Migration Single File/Blob** | $\le 400\text{ MiB}$   | **Blocker** — Exceeds GEI file transfer limit; move to LFS                                                                  | `data/reusables/enterprise-migration-tool/limitations-of-migration-tooling.md` |
| **Post-Migration Single File** | $\le 100\text{ MiB}$   | **Warning** — Allowed during migration, but rejected by standard GitHub pushes post-cutover unless tracked in LFS           | `data/reusables/enterprise-migration-tool/limitations-of-dotcom.md`            |
| **Git Reference Length**       | $\le 255\text{ bytes}$ | **Blocker** — Ref names > 255 bytes fail ref storage                                                                        | `data/reusables/enterprise-migration-tool/limitations-of-dotcom.md`            |
| **Release Total Assets**       | $\le 10\text{ GiB}$    | **Special Strategy** — GEI cannot migrate releases > 10 GiB; requires `--skip-releases` with REST release streamer fallback | `data/reusables/enterprise-migration-tool/skip-releases.md`                    |

## `git-sizer` Integration

The preflight engine integrates with [`github/git-sizer`](https://github.com/github/git-sizer) JSON output:

```bash
git-sizer --no-progress -j
```

The `parseGitSizerOutput` utility normalizes JSON fields across snake_case and camelCase variants:

- `unique_blob_size` / `total_blob_size` $\rightarrow$ `gitSizeBytes`
- `max_commit_size` $\rightarrow$ `largestCommitBytes`
- `max_blob_size` $\rightarrow$ `largestBlobBytes`
- `max_ref_name_length` / `longest_ref_length` $\rightarrow$ `longestRefLength`

When `git-sizer` data is not supplied, the engine queries the GitHub REST API (`GET /repos/{owner}/{repo}`) for disk footprint and evaluates known dimensions.

## Ruleset Bypass Requirements (DEC-012)

When importing repositories with GEI, Git data is pushed to GitHub in large batches. Evaluation of destination rulesets against these batch pushes causes evaluations to time out and break the migration.

### The "Always allow" vs. "Exempt" Trap

GitHub rulesets support two bypass modes:

- **Always allow:** The ruleset is evaluated and prompts the actor for confirmation. **This causes migrations to time out and fail.**
- **Exempt:** The ruleset is completely bypassed without evaluation.

> **CRITICAL REQUIREMENT:**
> Every active ruleset on the target organization must include **"Repository migrations"** in its bypass list with the mode strictly set to **`exempt`**. Any active ruleset with missing bypass or configured with `always` / `always_allow` will be flagged as a destination blocker and block migration.

## Repository Readiness Tiers

Every repository evaluated by `PreflightEvaluator` is classified into one of 4 tiers:

1. **`ready`**:
   - Safe for standard GEI migration.
   - Sizing within all platform limits.
   - No Git LFS detected.
   - Total release assets $\le 10\text{ GiB}$.
   - No destination blockers or naming collisions.
   - Invariant: `blockers: []`.

2. **`ready-with-follow-up`**:
   - Safe for GEI migration, but requires post-migration follow-up operations.
   - Git LFS objects detected (`lfsObjectCount > 0` or `.gitattributes`). LFS objects are not migrated by GEI and must be pushed via a dual-remote stream after cutover.

3. **`requires-special-strategy`**:
   - Sizing within Git limits, but requires non-standard flags.
   - Total release assets $> 10\text{ GiB}$.
   - Repository must be migrated with `--skip-releases`, followed by the REST release streamer fallback.

4. **`blocked`**:
   - Migration cannot proceed without remediation.
   - Triggered by: commit $> 2\text{ GiB}$, file $> 400\text{ MiB}$ without LFS, repo $> 40\text{ GiB}$, ref $> 255$ bytes, target repo naming collision, or destination ruleset missing the exempt bypass.
   - Invariant: `blockers.length >= 1`.

## Output Contract

The preflight engine produces a validated `MigrationPreflightReport` adhering strictly to `MigrationPreflightReportSchema` (`1.0.0`) from `@ghec/contracts`.
