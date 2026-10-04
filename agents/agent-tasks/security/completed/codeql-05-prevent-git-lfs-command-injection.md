# Task: Prevent Command Injection in Git LFS Client

## Status

Complete

## Owner

Antigravity

## Implementation Notes

- Added `validateGitHubIdentifier` in `packages/migration/src/strategies/git-lfs/lfs-client.ts` to strictly validate organization and repository names against `/^[a-zA-Z0-9_.-]+$/` and block leading dashes or dots.
- Added `validateStagingDirectory` checking against option prefix characters (`-`).
- Inserted standard POSIX `--` end-of-options delimiters prior to all positional arguments in `git clone --mirror` and `git remote set-url`.
- Added unit test suite in `packages/migration/tests/git-lfs.test.ts` verifying parameter validation and `--` delimiter generation.

## Priority

**High**  
_Rationale:_ In `GitLfsClient.cloneMirror()`, repository URLs and staging directories are passed directly to `git clone --mirror <url> <stagingDirectory>`. If input strings (such as organization names, repository names, or paths) originate from untrusted or unvalidated configurations and start with dashes (e.g. `--upload-pack=` or `--config=`), git interprets them as CLI options rather than positional arguments (second-order argument injection / CWE-88).

---

## Related CodeQL Alerts

This single task remediates **2 open CodeQL alerts**:

| Alert Number | Rule ID                                  | Severity     | File & Lines                                                 | GitHub Alert Link                                                                        |
| :----------- | :--------------------------------------- | :----------- | :----------------------------------------------------------- | :--------------------------------------------------------------------------------------- |
| **#19**      | `js/second-order-command-line-injection` | High (Error) | `packages/migration/src/strategies/git-lfs/lfs-client.ts:68` | [Alert #19](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/19) |
| **#20**      | `js/second-order-command-line-injection` | High (Error) | `packages/migration/src/strategies/git-lfs/lfs-client.ts:69` | [Alert #20](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/20) |

---

## Problem

In `packages/migration/src/strategies/git-lfs/lfs-client.ts`:

```typescript
  async cloneMirror(
    stagingDirectory: string,
    sourceOrg: string,
    sourceRepo: string,
    sourceToken: string,
    signal: AbortSignal,
  ): Promise<void> {
    const secrets = [sourceToken];
    const result = await this.runner(
      'git',
      [
        'clone',
        '--mirror',
        repositoryUrl(sourceOrg, sourceRepo, sourceToken),
        stagingDirectory,
      ],
      { signal, secrets },
    );
```

Line 68 (`repositoryUrl(...)`) and Line 69 (`stagingDirectory`) are positional arguments passed immediately after `git clone --mirror`.

1. The arguments are not separated from flags by the standard POSIX `--` end-of-options delimiter.
2. `sourceOrg` and `sourceRepo` inside `repositoryUrl(org, repo, token)` are not validated to confirm they conform to GitHub repository naming standards and do not start with a hyphen.
3. `stagingDirectory` is not verified to be an absolute path or checked against leading hyphens.

---

## Root Cause

Lack of argument boundary enforcement (`--` separator) and missing input validation on parameters passed into Git command argument vectors.

---

## Data or Execution Flow

```text
`sourceOrg`, `sourceRepo`, `stagingDirectory`
       │
       ▼ (Unvalidated parameters passed into runner argument array)
`git clone --mirror <url> <stagingDirectory>`
       │
       ▼ (If argument begins with `-` or `--`, git executes it as an option)
Second-Order Command-Line Injection Sink
```

---

## Relevant Code

- `packages/migration/src/strategies/git-lfs/lfs-client.ts` (lines 14–30, 55–80, 104–131)

---

## Recommended Remediation

1. **Insert `--` End-of-Options Delimiter:**
   In all git commands accepting positional parameters (URLs, directories), place `--` before positional arguments to instruct git to treat all following arguments strictly as operands, not flags:

   ```typescript
   await this.runner(
     'git',
     [
       'clone',
       '--mirror',
       '--',
       repositoryUrl(sourceOrg, sourceRepo, sourceToken),
       stagingDirectory,
     ],
     { signal, secrets },
   );
   ```

   Apply the same defensive pattern to `remote set-url`:

   ```typescript
   await this.runner(
     'git',
     [
       '-C',
       stagingDirectory,
       'remote',
       'set-url',
       '--',
       'origin',
       repositoryUrl(targetOrg, targetRepo, targetToken),
     ],
     { signal, secrets },
   );
   ```

2. **Validate Repository and Organization Identifiers:**
   Validate that `org` and `repo` follow valid GitHub naming constraints (`/^[a-zA-Z0-9_.-]+$/`) and do not begin with `-` or `.`:

   ```typescript
   function validateGitHubIdentifier(name: string, label: string): void {
     if (!name || !/^[a-zA-Z0-9_.-]+$/.test(name) || name.startsWith('-')) {
       throw new Error(`Invalid GitHub ${label}: "${name}".`);
     }
   }
   ```

   Call this validation in `repositoryUrl`:

   ```typescript
   function repositoryUrl(org: string, repo: string, token: string): string {
     validateGitHubIdentifier(org, 'organization');
     validateGitHubIdentifier(repo, 'repository');
     return `https://x-access-token:${encodeURIComponent(token)}@github.com/${org}/${repo}.git`;
   }
   ```

3. **Validate `stagingDirectory`:**
   Ensure `stagingDirectory` is a valid filesystem path that does not begin with `-`.

---

## Implementation Considerations

- **No Impact on Legitimate Migrations:** All legitimate GitHub organizations and repositories comply with `/^[a-zA-Z0-9_.-]+$/` and do not start with a dash.
- **Git Options Behavior:** Adding `--` before URL and directory operands is standard Git best practice and fully supported across all Git versions.

---

## Acceptance Criteria

- [x] `git clone --mirror` arguments include `--` before the repository URL and staging directory.
- [x] `repositoryUrl()` validates `org` and `repo` against invalid characters and leading dashes.
- [x] `stagingDirectory` is checked to prevent option injection.
- [x] All existing Git LFS unit tests pass.
- [x] CodeQL alerts #19 and #20 are resolved upon re-analysis.

---

## Testing Strategy

- **Security Unit Tests:** Add test cases in `packages/migration/tests/git-lfs.test.ts` verifying that malicious inputs starting with `--` (e.g., `--upload-pack=/evil`) are rejected during validation.
- **Regression Testing:** Run existing Git LFS migration tests ensuring valid repositories continue to clone, fetch, and push properly.

---

## Validation Commands

```bash
# Run Git LFS test suite
npm test packages/migration/tests/git-lfs.test.ts

# Run monorepo check
npm run check

# CodeQL re-analysis verification
gh run list --workflow codeql --limit 5
gh run view <run-id>
gh api "repos/cloudgxp/ghec-consultant-suite/code-scanning/alerts?state=open" --jq 'map(select(.rule.id == "js/second-order-command-line-injection")) | length'
```
