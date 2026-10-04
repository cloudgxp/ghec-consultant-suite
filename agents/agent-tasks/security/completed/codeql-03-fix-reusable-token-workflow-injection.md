# Task: Remediate GitHub Actions Code Injection in Token Minting Workflow

## Status

Complete

## Owner

Antigravity

## Implementation Notes

- Removed the bash `token-gen` step completely from `.github/workflows/reusable-ghec-token.yml`.
- Resolved job-level outputs directly using standard GitHub Actions coalesce syntax:
  - `token: ${{ steps.ent-token.outputs.token || steps.org-token.outputs.token }}`
  - `installation_id: ${{ steps.ent-token.outputs.installation-id || steps.org-token.outputs.installation-id }}`
- Completely eliminated the runner shell invocation and any possibility of token script injection or logging.

## Priority

**High**  
_Rationale:_ Reusable workflows are called by multiple orchestration and discovery pipelines to obtain GitHub App installation tokens. Interpolating tokens and inputs into inline shell scripts allows token leakage and potential arbitrary script execution in privileged CI contexts that mint credential tokens.

---

## Related CodeQL Alerts

This single task remediates **5 open CodeQL alerts**:

| Alert Number | Rule ID                         | Severity         | File & Lines                                   | GitHub Alert Link                                                                      |
| :----------- | :------------------------------ | :--------------- | :--------------------------------------------- | :------------------------------------------------------------------------------------- |
| **#2**       | `actions/code-injection/medium` | Medium (Warning) | `.github/workflows/reusable-ghec-token.yml:63` | [Alert #2](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/2) |
| **#3**       | `actions/code-injection/medium` | Medium (Warning) | `.github/workflows/reusable-ghec-token.yml:66` | [Alert #3](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/3) |
| **#4**       | `actions/code-injection/medium` | Medium (Warning) | `.github/workflows/reusable-ghec-token.yml:62` | [Alert #4](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/4) |
| **#5**       | `actions/code-injection/medium` | Medium (Warning) | `.github/workflows/reusable-ghec-token.yml:64` | [Alert #5](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/5) |
| **#6**       | `actions/code-injection/medium` | Medium (Warning) | `.github/workflows/reusable-ghec-token.yml:67` | [Alert #6](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/6) |

---

## Problem

In `.github/workflows/reusable-ghec-token.yml`, the `token-gen` step uses an inline bash `run:` block to select between organization and enterprise tokens:

```yaml
- name: Set Token Outputs
  id: token-gen
  run: |
    if [ "${{ inputs.scope_type }}" = "enterprise" ]; then
      echo "token=${{ steps.ent-token.outputs.token }}" >> "$GITHUB_OUTPUT"
      echo "installation-id=${{ steps.ent-token.outputs.installation-id }}" >> "$GITHUB_OUTPUT"
    else
      echo "token=${{ steps.org-token.outputs.token }}" >> "$GITHUB_OUTPUT"
      echo "installation-id=${{ steps.org-token.outputs.installation-id }}" >> "$GITHUB_OUTPUT"
    fi
```

GitHub Actions expression interpolation evaluates `${{ ... }}` before the bash command runs. If `inputs.scope_type` or generated token outputs contain shell control characters or formatting anomalies, it leads to code injection. Furthermore, writing sensitive token values directly through bash command lines is unsafe.

---

## Root Cause

Using a bash script step (`run: |`) with inline expression interpolation to coalesce step outputs, instead of using GitHub Actions workflow-level expressions directly in job outputs or passing values through environment variables.

---

## Data or Execution Flow

```text
`inputs.scope_type` & `steps.*-token.outputs.*`
       │
       ▼ (Direct expression substitution into shell script template)
Inline Bash Script (`token-gen` step)
       │
       ▼
`$GITHUB_OUTPUT` file write
```

---

## Relevant Code

- `.github/workflows/reusable-ghec-token.yml` (lines 33–69)

---

## Recommended Remediation

Eliminate the vulnerable bash step entirely by resolving the outputs directly at the job output level using standard GitHub Actions ternary / boolean expressions:

```yaml
jobs:
  mint:
    name: Mint Installation Token
    runs-on: ubuntu-latest
    outputs:
      token: ${{ steps.ent-token.outputs.token || steps.org-token.outputs.token }}
      installation_id: ${{ steps.ent-token.outputs.installation-id || steps.org-token.outputs.installation-id }}
    steps:
      - name: Mint Organization Installation Token
        if: ${{ inputs.scope_type == 'organization' }}
        id: org-token
        uses: actions/create-github-app-token@v1
        with:
          app-id: ${{ secrets.app_id }}
          private-key: ${{ secrets.private_key }}
          owner: ${{ inputs.scope_name }}

      - name: Mint Enterprise Installation Token
        if: ${{ inputs.scope_type == 'enterprise' }}
        id: ent-token
        uses: actions/create-github-app-token@v1
        with:
          app-id: ${{ secrets.app_id }}
          private-key: ${{ secrets.private_key }}
          enterprise: ${{ inputs.scope_name }}
```

Alternatively, if a step is preserved, pass all values through `env:` variables and reference `$SCOPE_TYPE`, `$ENT_TOKEN`, etc., without ever using `${{ ... }}` inside `run:`.
The first approach (direct expression in `jobs.mint.outputs`) is strongly preferred as it removes the shell step, eliminates runner overhead, and completely removes the attack surface.

---

## Implementation Considerations

- **Contract Compatibility:** The workflow outputs `token` and `installation_id` must remain unchanged so callers (`enterprise-multi-org-scan.yml`, etc.) continue to receive expected outputs.
- **Null Safety:** In GitHub Actions, when a step is skipped due to `if:`, its outputs are empty strings; the `||` operator cleanly selects the non-empty output from whichever step executed.

---

## Acceptance Criteria

- [x] No inline `${{ ... }}` expressions exist in `run:` blocks within `reusable-ghec-token.yml`.
- [x] Both organization-scoped and enterprise-scoped token minting correctly propagate `token` and `installation_id` outputs.
- [x] CodeQL alerts #2, #3, #4, #5, #6 are resolved upon re-analysis.

---

## Testing Strategy

- **Syntax and Lint:** Validate workflow YAML syntax using prettier and actionlint.
- **Workflow Simulation:** Validate that `inputs.scope_type == 'enterprise'` targets `ent-token` and sets job outputs, while `'organization'` targets `org-token`.
- **Token Masking:** Ensure GitHub Actions runner automatic token masking remains effective.

---

## Validation Commands

```bash
# Verify YAML formatting
npx prettier --check .github/workflows/reusable-ghec-token.yml

# Run project quality gate
npm run check

# CodeQL re-analysis verification
gh run list --workflow codeql --limit 5
gh run view <run-id>
gh api "repos/cloudgxp/ghec-consultant-suite/code-scanning/alerts?state=open" --jq 'map(select(.most_recent_instance.location.path == ".github/workflows/reusable-ghec-token.yml")) | length'
```
