# Task: Pin Reusable Workflow Reference to Immutable Commit SHA

## Title

Pin External Reusable Workflow Call to Full-Length Commit SHA (`.github/workflows/combine-dependabot-prs.yml`)

## Priority

**Medium**  
_Rationale:_ Using mutable references like `@main` or tags for third-party or external reusable workflows introduces a supply-chain security vulnerability (CWE-829). If the upstream branch is compromised or altered unexpectedly, malicious steps could execute inside the repository's CI pipeline with repository `write` permissions (`contents: write`, `pull-requests: write`). Pinning to an immutable full-length commit hash ensures integrity.

---

## Related CodeQL Alerts

This task remediates **1 open CodeQL alert**:

| Alert Number | Rule ID                | Severity         | File & Lines                                      | GitHub Alert Link                                                                      |
| :----------- | :--------------------- | :--------------- | :------------------------------------------------ | :------------------------------------------------------------------------------------- |
| **#1**       | `actions/unpinned-tag` | Medium (Warning) | `.github/workflows/combine-dependabot-prs.yml:19` | [Alert #1](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/1) |

---

## Problem

In `.github/workflows/combine-dependabot-prs.yml`:

```yaml
jobs:
  combine-dependabot-prs:
    if: >
      github.event_name == 'workflow_dispatch' ||
      github.event.pull_request.user.login == 'dependabot[bot]'
    uses: cloudgxp/reusable-workflows/.github/workflows/combine-dependabot-prs.yml@main
```

The workflow references `cloudgxp/reusable-workflows/.github/workflows/combine-dependabot-prs.yml@main`. CodeQL flags `@main` as an unpinned mutable reference.

---

## Root Cause

Specifying a branch name (`@main`) instead of an immutable 40-character commit SHA hash for a reusable workflow invocation.

---

## Data or Execution Flow

```text
CI Execution Trigger (Cron / workflow_dispatch)
       │
       ▼
Fetch external workflow from `cloudgxp/reusable-workflows` @ `main`
       │
       ▼ (Mutable ref allows arbitrary unreviewed workflow updates to execute)
Workflow Run executes with repository write permissions
```

---

## Relevant Code

- `.github/workflows/combine-dependabot-prs.yml` (line 19)

---

## Recommended Remediation

1. Query the latest commit SHA of `cloudgxp/reusable-workflows` on `main`:
   ```bash
   gh api repos/cloudgxp/reusable-workflows/commits/main --jq '.sha'
   ```
2. Update line 19 of `.github/workflows/combine-dependabot-prs.yml` to pin to the exact SHA, appending `# main` as a comment for maintainability:
   ```yaml
   uses: cloudgxp/reusable-workflows/.github/workflows/combine-dependabot-prs.yml@<FULL_40_CHAR_SHA> # main
   ```

---

## Implementation Considerations

- **Upstream Availability:** Ensure the pinned commit SHA actually exists in `cloudgxp/reusable-workflows` and contains the workflow file.
- **Workflow Permissions:** The caller grants `contents: write`, `pull-requests: write`, and `checks: read`. Pinning the SHA guarantees these privileges are only extended to audited code.
- **Dependabot / Renovate Updates:** Dependabot actions updates can be configured to keep SHA-pinned actions and reusable workflows automatically updated.

---

## Acceptance Criteria

- [x] Line 19 of `.github/workflows/combine-dependabot-prs.yml` uses a 40-character commit SHA instead of `@main`.
- [x] The workflow continues to parse successfully and trigger on scheduled or manual dispatch events.
- [x] CodeQL alert #1 is resolved upon re-analysis.

### Implementation Notes

1. **Immutable Reusable Workflow Pinning:** Verified latest commit SHA on `main` in `cloudgxp/reusable-workflows` (`dfd8341503b978f86fa0e5d7f39e27c4efba692e`) and verified that `.github/workflows/combine-dependabot-prs.yml` is present at that commit.
2. **Hardening CI Privileges:** Pinned `.github/workflows/combine-dependabot-prs.yml:19` to `uses: cloudgxp/reusable-workflows/.github/workflows/combine-dependabot-prs.yml@dfd8341503b978f86fa0e5d7f39e27c4efba692e # main`, eliminating mutable `@main` reference while retaining maintainability comment.
3. **Syntax Validation:** Prettier checked and passed. Resolves CodeQL alert #1 (`actions/unpinned-tag`).

---

## Testing Strategy

- **Syntax Verification:** Validate YAML syntax with `npx prettier --check .github/workflows/combine-dependabot-prs.yml`.
- **Reference Verification:** Confirm with `gh api repos/cloudgxp/reusable-workflows/commits/<SHA>` that the commit is valid.

---

## Validation Commands

```bash
# Verify YAML formatting
npx prettier --check .github/workflows/combine-dependabot-prs.yml

# Run project quality check
npm run check

# CodeQL re-analysis verification
gh run list --workflow codeql --limit 5
gh run view <run-id>
gh api "repos/cloudgxp/ghec-consultant-suite/code-scanning/alerts?state=open" --jq 'map(select(.most_recent_instance.location.path == ".github/workflows/combine-dependabot-prs.yml")) | length'
```
