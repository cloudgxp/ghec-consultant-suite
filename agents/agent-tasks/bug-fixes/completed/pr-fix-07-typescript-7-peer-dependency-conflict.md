# Task PR-FIX-07: Resolve TypeScript 7 Peer Dependency Conflict in PR #7

## PR Details

- **PR Number**: #7
- **Branch**: `dependabot/npm_and_yarn/typescript-7.0.2`
- **Author**: app/dependabot
- **Title**: `chore(deps-dev): bump typescript from 5.9.3 to 7.0.2`
- **PR Link**: https://github.com/cloudgxp/ghec-consultant-suite/pull/7

## Failing Checks

- **Failed Jobs**:
  - `Monorepo quality` / `Root quality gate` (Run ID: `37237134445`)
  - `Dashboard quality` / `quality` (Run ID: `37237134437`)
- **Error Output / Trace**:
  ```text
  npm error code ERESOLVE
  npm error ERESOLVE could not resolve
  npm error While resolving: typescript-eslint@8.71.0
  npm error Found: typescript@7.0.2
  npm error node_modules/typescript
  npm error   dev typescript@"~7.0.2" from the root project
  npm error Could not resolve dependency:
  npm error peer typescript@">=4.8.4 <6.1.0" from typescript-eslint@8.71.0
  npm error Conflicting peer dependency: typescript@6.0.3
  npm error Fix the upstream dependency conflict, or retry this command with --force or --legacy-peer-deps
  ```

## Root Cause Analysis

Dependabot upgraded `typescript` to `~7.0.2`. `typescript-eslint@8.71.0` (and its sub-packages) declare a peer dependency constraint of `typescript@">=4.8.4 <6.1.0"`. When `npm ci` runs in CI without peer dependency overrides or configuration, npm rejects the installation with `ERESOLVE`.

## Remediation Plan

1. Check out `dependabot/npm_and_yarn/typescript-7.0.2`.
2. Sync with `origin/main` via `git merge origin/main`.
3. Configure `package.json` overrides or peer dependency resolutions to allow `typescript-eslint` to accept `typescript@7.0.2` (e.g., via `"overrides": { "typescript-eslint": { "typescript": "$typescript" }, "@typescript-eslint/eslint-plugin": { "typescript": "$typescript" }, "@typescript-eslint/type-utils": { "typescript": "$typescript" }, "@typescript-eslint/typescript-estree": { "typescript": "$typescript" } }`).
4. Re-generate `package-lock.json` via `npm install` and verify `npm ci` runs cleanly.
5. Run full local checks: `npm run check` and workspace builds/typechecks. Fix any TypeScript 7 compiler diagnostics if encountered.
6. Commit changes and push to `origin/dependabot/npm_and_yarn/typescript-7.0.2`.
7. Monitor `gh pr checks 7` until green.

## Acceptance Criteria

- `npm ci` completes successfully without peer dependency errors.
- `npm run check` passes cleanly locally.
- All checks for PR #7 report successful (green) on GitHub Actions.
