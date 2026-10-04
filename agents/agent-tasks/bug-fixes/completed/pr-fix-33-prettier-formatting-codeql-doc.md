# Task PR-FIX-33: Resolve Prettier Formatting Failure in PR #33

## PR Details

- **PR Number**: #33
- **Branch**: `dependabot/npm_and_yarn/prettier-3.9.9`
- **Author**: app/dependabot
- **Title**: `chore(deps-dev): bump prettier from 3.9.7 to 3.9.9`
- **PR Link**: https://github.com/cloudgxp/ghec-consultant-suite/pull/33

## Failing Checks

- **Failed Job**: `Monorepo quality` / `Root quality gate` (Run ID: `37237123734`, Job ID: `111538376982`)
- **Error Output / Trace**:
  ```text
  > ghec-consulting-suite@0.1.0 lint
  > eslint . && prettier --check .

  Checking formatting...
  [warn] agents/agent-tasks/security/completed/codeql-01-fix-app-registration-command-injection-ssrf.md
  [warn] Code style issues found in the above file. Run Prettier with --write to fix.
  ##[error]Process completed with exit code 1.
  ```

## Root Cause Analysis

Upgrading Prettier from 3.9.7 to 3.9.9 introduced formatting sensitivity or changes that flagged `agents/agent-tasks/security/completed/codeql-01-fix-app-registration-command-injection-ssrf.md` as not conforming to the newer Prettier format, causing `prettier --check .` to fail during `npm run check`.

## Remediation Plan

1. Check out `dependabot/npm_and_yarn/prettier-3.9.9`.
2. Sync with `origin/main` via `git merge origin/main`.
3. Format the offending file using `npx prettier --write agents/agent-tasks/security/completed/codeql-01-fix-app-registration-command-injection-ssrf.md`.
4. Run `npm run check` locally to verify that lint, typecheck, and tests all pass with Prettier 3.9.9.
5. Commit and push the formatting fix to `origin/dependabot/npm_and_yarn/prettier-3.9.9`.
6. Monitor `gh pr checks 33` until green.

## Acceptance Criteria

- `npm run check` passes locally with code 0.
- All checks for PR #33 pass on GitHub Actions.
