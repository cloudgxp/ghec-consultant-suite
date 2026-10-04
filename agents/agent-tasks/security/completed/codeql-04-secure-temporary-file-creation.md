# Task: Secure Temporary File and Directory Creation

## Status

Complete

## Owner

Antigravity

## Implementation Notes

- Replaced all direct `os.tmpdir()` path concatenations and `Date.now()` filenames in `packages/migration/src/post-migration/mannequins/engine.ts` with `fs.mkdtemp` (POSIX `0700` isolation) and `finally` cleanup.
- Configured restrictive file creation modes (`0o600`) for all exported CSVs and advisory report artifacts.
- Hardened `packages/migration/src/advisory/planner.ts` with `mkdir(outputDir, { recursive: true, mode: 0o700 })` and `0o600` file modes.
- Fixed insecure test temp directory creation in `packages/migration/tests/advisory/planner.test.ts` and `packages/migration/tests/planner.test.ts` by using `mkdtempSync` with reliable teardown.

## Priority

**High**  
_Rationale:_ Insecure temporary file creation (CWE-377 / CWE-379) in shared operating system temporary directories (`/tmp` or `os.tmpdir()`) allows local attackers to exploit Time-of-Check to Time-of-Use (TOCTOU) symlink races. By predicting or pre-creating filenames formed via `Date.now()`, malicious actors can hijack file writes, read migration artifacts containing sensitive organizational metadata, or corrupt files.

---

## Related CodeQL Alerts

This single task remediates **7 open CodeQL alerts**:

| Alert Number | Rule ID                      | Severity     | File & Lines                                                     | GitHub Alert Link                                                                        |
| :----------- | :--------------------------- | :----------- | :--------------------------------------------------------------- | :--------------------------------------------------------------------------------------- |
| **#21**      | `js/insecure-temporary-file` | High (Error) | `packages/migration/src/advisory/planner.ts:136`                 | [Alert #21](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/21) |
| **#22**      | `js/insecure-temporary-file` | High (Error) | `packages/migration/src/advisory/planner.ts:137`                 | [Alert #22](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/22) |
| **#23**      | `js/insecure-temporary-file` | High (Error) | `packages/migration/src/advisory/planner.ts:138`                 | [Alert #23](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/23) |
| **#24**      | `js/insecure-temporary-file` | High (Error) | `packages/migration/src/advisory/planner.ts:140`                 | [Alert #24](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/24) |
| **#25**      | `js/insecure-temporary-file` | High (Error) | `packages/migration/src/advisory/planner.ts:145`                 | [Alert #25](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/25) |
| **#26**      | `js/insecure-temporary-file` | High (Error) | `packages/migration/src/post-migration/mannequins/engine.ts:306` | [Alert #26](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/26) |
| **#27**      | `js/insecure-temporary-file` | High (Error) | `packages/migration/src/post-migration/mannequins/engine.ts:458` | [Alert #27](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/27) |

---

## Additional Vulnerable Locations Discovered During Investigation

During our security audit, several additional occurrences of the exact same insecure temporary file pattern were identified in production code and test suites:

- `packages/migration/src/post-migration/mannequins/engine.ts:129`: `path.join(os.tmpdir(), \`mannequins-\${targetOrg}-\${Date.now()}.csv\`)`passed to`exportMannequinInventory`.
- `packages/migration/src/post-migration/mannequins/engine.ts:415`: `path.join(os.tmpdir(), \`mannequins-\${options.targetOrg}-\${Date.now()}.csv\`)`.
- `packages/migration/tests/advisory/planner.test.ts:350`: `const tempDir = join(tmpdir(), \`advisory-test-\${Date.now()}\`);`passed into`writeArtifacts`.
- `packages/migration/tests/planner.test.ts:321`: `const testFile = join(tmpdir(), \`test-plan-\${Date.now()}.json\`);`.

---

## Problem

In `packages/migration/src/post-migration/mannequins/engine.ts` and `packages/migration/src/advisory/planner.ts`, files are written to paths formed by concatenating `os.tmpdir()` with a predictable name such as:

```typescript
path.join(os.tmpdir(), `mannequins-reclaim-${targetOrg}-${Date.now()}.csv`);
```

In `advisory/planner.ts`, `writeArtifacts` writes multiple reports into `outputDir`. CodeQL flagged lines 136–145 because unit tests pass a directory created directly under `tmpdir()` with a timestamp rather than an securely created temporary directory.

---

## Root Cause

Creating files with predictable names directly inside the shared temporary directory (`/tmp`) without using `fs.mkdtemp` (which creates an exclusive directory with POSIX `0700` permissions) or `O_EXCL` flags.

---

## Data or Execution Flow

```text
`os.tmpdir()` + Predictable Name (`Date.now()`)
       │
       ▼ (Predictable path exposed in shared /tmp directory)
`fs.writeFile(csvPath, ...)` / `writeArtifacts(outputDir, ...)`
       │
       ▼ (Symlink attack / TOCTOU file overwrite vulnerability)
Insecure File Write Sink
```

---

## Relevant Code

- `packages/migration/src/post-migration/mannequins/engine.ts` (lines 129, 301–306, 415, 453–458)
- `packages/migration/src/advisory/planner.ts` (lines 118–152)
- `packages/migration/tests/advisory/planner.test.ts` (line 350)
- `packages/migration/tests/planner.test.ts` (line 321)

---

## Recommended Remediation

1. **Adopt Secure Temporary Directory Creation (`fs.mkdtemp`):**
   In `engine.ts`, when `csvPath` is not provided, create a unique, private temporary directory using `fs.promises.mkdtemp` or `fs.mkdtempSync`:

   ```typescript
   import * as fs from 'node:fs/promises';
   import * as os from 'node:os';
   import * as path from 'node:path';

   // Securely allocate a private directory (0700 permissions)
   const secureDir = await fs.mkdtemp(
     path.join(os.tmpdir(), 'ghec-mannequins-'),
   );
   const csvPath = path.join(secureDir, 'reclaim.csv');

   try {
     const csvContent = serializeMannequinCsv(reclaimableRecords);
     await fs.writeFile(csvPath, csvContent, {
       encoding: 'utf8',
       mode: 0o600,
     });
     // execute reclamation...
   } finally {
     await fs.rm(secureDir, { recursive: true, force: true });
   }
   ```

   Apply this exact pattern to all 4 instances in `engine.ts` (lines 129, 301, 415, 453).

2. **Fix Test Fixture Creation:**
   In `packages/migration/tests/advisory/planner.test.ts:350` and `packages/migration/tests/planner.test.ts:321`, replace `join(tmpdir(), \`...-\${Date.now()}\`)`with`mkdtempSync(join(tmpdir(), 'advisory-test-'))`and clean up in`afterEach`or`finally`.

3. **Defensive Path Validation in `writeArtifacts`:**
   In `packages/migration/src/advisory/planner.ts`, ensure `mkdir(outputDir, { recursive: true, mode: 0o700 })` is used and consider writing with `{ mode: 0o600 }`.

---

## Implementation Considerations

- **Lifecycle & Cleanup:** Temporary directories must always be cleaned up in a `finally` block to prevent disk filling.
- **Cross-Platform:** `fs.mkdtemp` is standard across Linux, macOS, and Windows.
- **Backwards Compatibility:** Callers that pass an explicit `engineOptions.csvPath` must remain supported without modification.

---

## Acceptance Criteria

- [x] No files are created directly under `os.tmpdir()` with predictable timestamp names.
- [x] All temporary working files use directories generated via `mkdtemp` with `0700` permissions.
- [x] Mannequin reclamation and inventory export operate normally without regressions.
- [x] Temporary directories are cleaned up upon completion or failure.
- [x] CodeQL alerts #21 through #27 are resolved upon re-analysis.

---

## Testing Strategy

- **Unit Testing:** Run existing test suites in `packages/migration/tests/post-migration/mannequins.test.ts` and `packages/migration/tests/advisory/planner.test.ts`.
- **Security Verification:** Verify directory permissions (`fs.stat(dir).mode & 0o777 === 0o700`) and file permissions.

---

## Validation Commands

```bash
# Run migration test suite
npm test packages/migration/tests/post-migration/mannequins.test.ts packages/migration/tests/advisory/planner.test.ts

# Run monorepo quality check
npm run check

# CodeQL re-analysis verification
gh run list --workflow codeql --limit 5
gh run view <run-id>
gh api "repos/cloudgxp/ghec-consultant-suite/code-scanning/alerts?state=open" --jq 'map(select(.rule.id == "js/insecure-temporary-file")) | length'
```
