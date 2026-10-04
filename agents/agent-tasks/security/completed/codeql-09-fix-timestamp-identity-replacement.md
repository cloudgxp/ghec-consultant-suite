# Task: Fix Timestamp Identity Replacement in Bundle Publisher

## Title

Fix No-Op Identity String Replacement in Discovery Bundle Publisher (`packages/discovery/src/output/publisher.ts`)

## Priority

**Low**  
_Rationale:_ CodeQL rule `js/identity-replacement` flags expressions that replace a substring with itself (`.replace('Z', 'Z')`). While not an exploitable vulnerability, it represents dead/buggy code that leaves trailing characters or fails to achieve the intended filename sanitization.

---

## Related CodeQL Alerts

This task remediates **1 open CodeQL alert**:

| Alert Number | Rule ID                   | Severity         | File & Lines                                    | GitHub Alert Link                                                                        |
| :----------- | :------------------------ | :--------------- | :---------------------------------------------- | :--------------------------------------------------------------------------------------- |
| **#18**      | `js/identity-replacement` | Medium (Warning) | `packages/discovery/src/output/publisher.ts:32` | [Alert #18](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/32) |

---

## Problem

In `packages/discovery/src/output/publisher.ts`:

```typescript
export function generateBundleFilename(options: PublishOptions): string {
  if (options.outputPath.endsWith('.json')) {
    return resolve(options.outputPath);
  }
  const sanitizedScope = options.scopeName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const timestamp = options.startedAt
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .replace('Z', 'Z');
  const filename = `ghec-discovery-${options.scopeKind}-${sanitizedScope}-${timestamp}-${options.runId}.json`;
  return join(resolve(options.outputPath), filename);
}
```

Line 32 calls `.replace('Z', 'Z')`, which replaces `'Z'` with `'Z'`, performing no change. The developer's intent was to strip the trailing `'Z'` timezone indicator from the ISO timestamp string.

---

## Root Cause

Typographical error in string replacement expression where replacement string was identical to the target string.

---

## Relevant Code

- `packages/discovery/src/output/publisher.ts` (lines 24–35)

---

## Recommended Remediation

Change line 32 to strip `'Z'`, or cleanly sanitize the ISO timestamp string into a compact filesystem-safe representation:

```typescript
export function generateBundleFilename(options: PublishOptions): string {
  if (options.outputPath.endsWith('.json')) {
    return resolve(options.outputPath);
  }
  const sanitizedScope = options.scopeName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const timestamp = options.startedAt
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .replace(/Z$/i, '');
  const filename = `ghec-discovery-${options.scopeKind}-${sanitizedScope}-${timestamp}-${options.runId}.json`;
  return join(resolve(options.outputPath), filename);
}
```

---

## Implementation Considerations

- **Filename Consistency:** Ensure generated filenames match the pattern expected by CLI collectors and dashboard importers: `ghec-discovery-<kind>-<scope>-<timestamp>-<runId>.json`.

---

## Acceptance Criteria

- [x] Line 32 replaces `'Z'` with `''` (or uses `/Z$/i`).
- [x] No identity string replacement calls remain.
- [x] Discovery bundle filename generation unit tests pass.
- [x] CodeQL alert #18 is resolved upon re-analysis.

### Implementation Notes

1. **Regex Suffix Stripping:** Replaced `.replace('Z', 'Z')` with `.replace(/Z$/i, '')` in `packages/discovery/src/output/publisher.ts`, eliminating the dead identity replacement and ensuring trailing `Z` timezone designators are properly removed regardless of whether fractional seconds are present.
2. **Unit Tests:** Added unit tests in `apps/cli/tests/publisher.test.ts` verifying `generateBundleFilename` with and without milliseconds strips `Z` properly. Resolves CodeQL alert #18 (`js/identity-replacement`).

---

## Testing Strategy

- **Unit Testing:** Run `npm test apps/cli/tests/publisher.test.ts`. Verify output filenames generated from ISO dates such as `2026-10-04T16:00:00.000Z` produce clean strings like `20261004T160000`.

---

## Validation Commands

```bash
# Run publisher tests
npm test apps/cli/tests/publisher.test.ts

# Run monorepo check
npm run check

# CodeQL re-analysis verification
gh run list --workflow codeql --limit 5
gh run view <run-id>
gh api "repos/cloudgxp/ghec-consultant-suite/code-scanning/alerts?state=open" --jq 'map(select(.rule.id == "js/identity-replacement")) | length'
```
