# Task: Remediate GitHub Actions Code Injection in Composite Action Runner

## Status

Complete

## Owner

Antigravity

## Implementation Notes

- Exported all composite action inputs through the step's `env:` block (`INPUT_COMMAND`, `INPUT_SCOPE`, `INPUT_PLAN`, etc.) in `action.yml`.
- Replaced all `${{ inputs.* }}` expressions inside bash script text blocks with native bash variable expansions (`"$INPUT_SCOPE"`, etc.).
- Removed command line exposure of `--source-token` and `--target-token` and scrubbed argument logging (`node ./apps/cli/bin/ghec-consultant-cli.mjs $CMD`), relying safely on `GHEC_SOURCE_TOKEN` and `GHEC_TARGET_TOKEN` environment variables.
- Audited and remediated unflagged inline expressions in `.github/workflows/enterprise-multi-org-scan.yml`, `.github/workflows/migration-execute-wave.yml`, and `.github/workflows/migration-plan-pr.yml`.

## Priority

**High**  
_Rationale:_ Although GitHub Actions composite action inputs are typically supplied by workflow authors, interpolating unescaped `${{ inputs.* }}` directly into inline `run: |` bash scripts allows arbitrary code execution on the runner if inputs are derived from external data (e.g., repository names, issue titles, user comments, or untrusted PR refs). Furthermore, passing tokens via CLI arguments (`--source-token`, `--target-token`) and echoing the command line causes sensitive credentials to leak into CI runner logs and process tables.

---

## Related CodeQL Alerts

This single task remediates **24 open CodeQL alerts**:

| Alert Number | Rule ID                         | Severity         | File & Lines     | GitHub Alert Link                                                                        |
| :----------- | :------------------------------ | :--------------- | :--------------- | :--------------------------------------------------------------------------------------- |
| **#28**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:152` | [Alert #28](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/28) |
| **#29**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:153` | [Alert #29](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/29) |
| **#30**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:156` | [Alert #30](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/30) |
| **#31**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:157` | [Alert #31](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/31) |
| **#32**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:109` | [Alert #32](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/32) |
| **#33**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:112` | [Alert #33](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/33) |
| **#34**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:113` | [Alert #34](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/34) |
| **#35**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:116` | [Alert #35](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/35) |
| **#36**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:117` | [Alert #36](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/36) |
| **#37**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:120` | [Alert #37](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/37) |
| **#38**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:121` | [Alert #38](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/38) |
| **#39**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:124` | [Alert #39](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/39) |
| **#40**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:125` | [Alert #40](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/40) |
| **#41**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:128` | [Alert #41](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/41) |
| **#42**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:129` | [Alert #42](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/42) |
| **#43**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:132` | [Alert #43](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/43) |
| **#44**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:133` | [Alert #44](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/44) |
| **#45**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:136` | [Alert #45](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/45) |
| **#46**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:137` | [Alert #46](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/46) |
| **#47**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:163` | [Alert #47](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/47) |
| **#48**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:140` | [Alert #48](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/48) |
| **#49**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:141` | [Alert #49](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/49) |
| **#50**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:144` | [Alert #50](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/50) |
| **#51**      | `actions/code-injection/medium` | Medium (Warning) | `action.yml:148` | [Alert #51](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/51) |

---

## Problem

In `action.yml`, the `run-cli` step defines an inline bash script that references action inputs using GitHub expression interpolation syntax: `${{ inputs.<name> }}`.
GitHub Actions parses expression syntax before passing the generated script string to the shell interpreter (`bash`). If an input value contains shell metacharacters such as `"`, `'`, `;`, `&`, `|`, or newline characters, those characters break out of the string boundary and execute arbitrary commands in the runner's context.

Additionally, sensitive tokens (`${{ inputs.source-token }}` and `${{ inputs.target-token }}`) are passed as command-line arguments to `node ./apps/cli/bin/ghec-consultant-cli.mjs` and echoed via `echo "Executing: node ... ${ARGS[*]}"`, exposing token secrets in CI build logs and process lists.

---

## Root Cause

Direct inline expression substitution (`${{ inputs.xyz }}`) inside shell `run:` blocks instead of passing inputs through dedicated step `env:` variables. Because the GitHub Actions runner evaluates `${{ ... }}` as text templates rather than shell variables, unsafe values directly alter the shell script syntax.

---

## Data or Execution Flow

```text
Action Inputs (${{ inputs.* }})
       │
       ▼ (Direct text macro substitution by GitHub Actions runner)
Inline Shell Script (`run: |`)
       │
       ▼ (Bash tokenizes injected characters as sub-commands / shell operators)
Arbitrary Command Execution / Sensitive Token Log Emission
```

---

## Relevant Code

- `action.yml` (lines 102–173)
- `apps/cli/bin/ghec-consultant-cli.mjs`

---

## Recommended Remediation

1. **Pass all inputs via step `env:` variables:**
   Declare intermediate environment variables in the step's `env:` block. The runner safely exports these variables to the OS process environment without shell syntax interpretation.
   ```yaml
   env:
     INPUT_COMMAND: ${{ inputs.command }}
     INPUT_SCOPE: ${{ inputs.scope }}
     INPUT_PLAN: ${{ inputs.plan }}
     INPUT_INPUT: ${{ inputs.input }}
     INPUT_MODULES: ${{ inputs.modules }}
     INPUT_SPLIT_MATRIX: ${{ inputs.split-matrix }}
     INPUT_OUTPUT_MATRIX: ${{ inputs.output-matrix }}
     INPUT_OUTPUT: ${{ inputs.output }}
     INPUT_RESUME: ${{ inputs.resume }}
     INPUT_DRY_RUN: ${{ inputs.dry-run }}
     INPUT_CONTINUE_ON_ERROR: ${{ inputs.continue-on-error }}
     GHEC_SOURCE_TOKEN: ${{ inputs.source-token }}
     GHEC_TARGET_TOKEN: ${{ inputs.target-token }}
   ```
2. **Access variables using native shell parameter expansion:**
   Inside `run: |`, reference the variables strictly via `$INPUT_<NAME>` or `"$INPUT_<NAME>"`.
   ```bash
         CMD="$INPUT_COMMAND"
         ARGS=()

         if [ -n "$INPUT_SCOPE" ]; then
           ARGS+=(--scope "$INPUT_SCOPE")
         fi

         if [ -n "$INPUT_PLAN" ]; then
           ARGS+=(--plan "$INPUT_PLAN")
         fi

         if [ -n "$INPUT_INPUT" ]; then
           ARGS+=(--input "$INPUT_INPUT")
         fi

         if [ -n "$INPUT_MODULES" ]; then
           ARGS+=(--modules "$INPUT_MODULES")
         fi

         if [ -n "$INPUT_SPLIT_MATRIX" ]; then
           ARGS+=(--split-matrix "$INPUT_SPLIT_MATRIX")
         fi

         if [ -n "$INPUT_OUTPUT_MATRIX" ]; then
           ARGS+=(--output-matrix "$INPUT_OUTPUT_MATRIX")
         fi

         if [ -n "$INPUT_OUTPUT" ]; then
           ARGS+=(--output "$INPUT_OUTPUT")
         fi

         if [ -n "$INPUT_RESUME" ]; then
           ARGS+=(--resume "$INPUT_RESUME")
         fi

         if [ "$INPUT_DRY_RUN" = "true" ]; then
           ARGS+=(--dry-run)
         fi

         if [ "$INPUT_CONTINUE_ON_ERROR" = "true" ]; then
           ARGS+=(--continue-on-error)
         fi
   ```
3. **Prevent Token Leakage in CLI Arguments and Logs:**
   - The CLI already reads `GHEC_SOURCE_TOKEN` and `GHEC_TARGET_TOKEN` from the environment. Do not append `--source-token` or `--target-token` into `ARGS` if they can be read from `process.env`.
   - Remove or sanitize the log line `echo "Executing: node ... ${ARGS[*]}"` so that no secret values could ever be printed.
4. **Sanitize Output Path Resolution:**
   ```bash
         RESOLVED_OUTPUT="$INPUT_OUTPUT"
         if [ -z "$RESOLVED_OUTPUT" ]; then
           case "$CMD" in
             plan) RESOLVED_OUTPUT="./scans/migration-plan.json" ;;
             migrate) RESOLVED_OUTPUT="./scans/migration-report.json" ;;
             verify) RESOLVED_OUTPUT="./scans/verification-report.json" ;;
             discover) RESOLVED_OUTPUT="./scans/discovery-bundle.json" ;;
           esac
         fi
         echo "output-path=$RESOLVED_OUTPUT" >> "$GITHUB_OUTPUT"
   ```

---

## Implementation Considerations

- **Backwards Compatibility:** All action input and output names remain 100% identical. Workflows calling this composite action will experience identical functional behavior.
- **Downstream Callers:** Workflows such as `.github/workflows/migration-plan-pr.yml` and `.github/workflows/enterprise-multi-org-scan.yml` invoke this action or run CLI commands.
- **Audit Other Workflows:** Ensure workflows do not duplicate this pattern when generating summary markdown or executing shell scripts (see related discovery in `enterprise-multi-org-scan.yml` and `migration-execute-wave.yml`).

---

## Acceptance Criteria

- [x] No occurrences of `${{ inputs.* }}` exist inside `run:` blocks in `action.yml`.
- [x] All inputs are passed into the execution step via `env:`.
- [x] Tokens are not echoed or exposed via command line arguments.
- [x] CLI runs correctly when invoked with all supported combinations of options.
- [x] CodeQL alerts #28 through #51 are resolved upon re-analysis.

---

## Testing Strategy

- **Security Verification:** Verify that special characters (e.g. `test; echo injected`, spaces, quotes) in inputs are treated as literal strings and do not cause subshell execution or syntax errors.
- **Functional Verification:** Run synthetic action invocation tests validating all branch options (`--dry-run`, `--continue-on-error`, `--scope`, etc.).
- **Log Leakage Audit:** Inspect runner log output to verify that neither `GHEC_SOURCE_TOKEN` nor `GHEC_TARGET_TOKEN` appears in plaintext.

---

## Validation Commands

```bash
# Verify YAML and action formatting
npx prettier --check action.yml

# Run project quality gate
npm run check

# CodeQL re-analysis verification (triggers on push or PR)
gh run list --workflow codeql --limit 5
gh run view <run-id>
gh api "repos/cloudgxp/ghec-consultant-suite/code-scanning/alerts?state=open" --jq 'map(select(.most_recent_instance.location.path == "action.yml")) | length'
```
