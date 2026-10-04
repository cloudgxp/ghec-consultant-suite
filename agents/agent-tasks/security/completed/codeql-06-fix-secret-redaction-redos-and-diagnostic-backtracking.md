# Task: Fix Polynomial ReDoS in Secret Redaction and Diagnostic Helpers

## Title

Eliminate Regular Expression Denial of Service (ReDoS) in Secret Sanitizers and URL Parsers

## Priority

**Medium**  
_Rationale:_ Regular expression catastrophic or polynomial backtracking (CWE-1333) allows an attacker who controls input data (e.g. within migrated code, commit logs, diagnostic messages, or configuration URLs) to cause high CPU consumption and event-loop blocking, leading to Denial of Service during large-scale enterprise discovery and migration runs.

---

## Related CodeQL Alerts

This single task remediates **4 open CodeQL alerts**:

| Alert Number | Rule ID               | Severity     | File & Lines                                                      | GitHub Alert Link                                                                        |
| :----------- | :-------------------- | :----------- | :---------------------------------------------------------------- | :--------------------------------------------------------------------------------------- |
| **#14**      | `js/polynomial-redos` | High (Error) | `packages/discovery/src/output/sanitizer.ts:59`                   | [Alert #14](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/14) |
| **#15**      | `js/polynomial-redos` | High (Error) | `packages/discovery/src/output/sanitizer.ts:62`                   | [Alert #15](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/15) |
| **#16**      | `js/polynomial-redos` | High (Error) | `packages/github-client/src/diagnostics.ts:3–7`                   | [Alert #16](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/16) |
| **#17**      | `js/polynomial-redos` | High (Error) | `packages/migration/src/client/http-target-write-client.ts:28–31` | [Alert #17](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/17) |

---

## Problem

1. **PEM Header ReDoS (`sanitizer.ts:59, 62` & `diagnostics.ts:3-7`):**
   In both `packages/discovery/src/output/sanitizer.ts` (line 14) and `packages/github-client/src/diagnostics.ts` (line 5), private keys are matched with:
   `/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g`
   When processing input containing repeated occurrences of `-----BEGIN PRIVATE KEY-----` without a matching `-----END PRIVATE KEY-----` (or nested headers), the non-greedy `[\s\S]*?` matcher causes polynomial backtracking over repeated start markers.
2. **Trailing Slash Removal ReDoS (`http-target-write-client.ts:28-31`):**
   In `packages/migration/src/client/http-target-write-client.ts`:
   `(options.baseUrl ?? 'https://api.github.com').replace(/\/+$/, '')`
   CodeQL flags that `/\/+$/` can suffer polynomial slowdown on strings with many consecutive `/` characters when evaluating end-of-string anchors.

---

## Root Cause

- Use of unconstrained wildcard `[\s\S]*?` between repeated delimiters in multiline regexes.
- Use of regex for simple string suffix trimming where string operations or linear loops are simpler and immune to backtracking.

---

## Data or Execution Flow

```text
Arbitrary User / Entity String (e.g. large file, diagnostic payload, URL)
       │
       ▼
Regex evaluation: `pattern.test(sanitized)` / `sanitized.replace(pattern, ...)`
       │
       ▼ (Pathological repetition triggers quadratic/polynomial backtracking in V8)
Event loop blocked / High CPU exhaustion (ReDoS)
```

---

## Relevant Code

- `packages/discovery/src/output/sanitizer.ts` (lines 6–19, 50–67)
- `packages/github-client/src/diagnostics.ts` (lines 1–18)
- `packages/migration/src/client/http-target-write-client.ts` (lines 28–31)

---

## Recommended Remediation

1. **Refactor PEM Matching in `sanitizer.ts` and `diagnostics.ts`:**
   Constrain the content between `BEGIN` and `END` so that it cannot match another `-----BEGIN` sequence, or bound the match size.
   In `sanitizer.ts`:

   ```typescript
   // Constrain intermediate content to base64, whitespace, and dashes that do not re-match BEGIN
   /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----(?:(?!-----BEGIN)[\s\S])*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g;
   ```

   Or match standard PEM line-by-line format:

   ```typescript
   /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----\r?\n(?:[A-Za-z0-9+/=\r\n]{1,8192})\r?\n-----END (?:[A-Z]+ )?PRIVATE KEY-----/g;
   ```

   Apply the same non-backtracking pattern to `packages/github-client/src/diagnostics.ts`.

2. **Replace Trailing Slash Regex with Linear String Trimming:**
   In `packages/migration/src/client/http-target-write-client.ts`:
   Replace `.replace(/\/+$/, '')` with linear string operations or a safe trimming loop:
   ```typescript
   let base = (options.baseUrl ?? 'https://api.github.com').trim();
   while (base.endsWith('/')) {
     base = base.slice(0, -1);
   }
   this.baseUrl = base;
   ```
   This has guaranteed $O(N)$ performance, zero regex invocation, and completely eliminates the CodeQL alert.

---

## Implementation Considerations

- **Redaction Integrity:** Ensure genuine private keys (RSA, EC, PKCS8) in both single-line and multiline formats continue to be properly masked with `[REDACTED_SECRET_PATTERN]` and `[REDACTED_PRIVATE_KEY]`.
- **URL Handling:** Base URL normalization must still strip any trailing slashes without corrupting paths (e.g. `https://api.github.com/` $\rightarrow$ `https://api.github.com`).

---

## Acceptance Criteria

- [x] PEM regexes in `sanitizer.ts` and `diagnostics.ts` do not exhibit polynomial backtracking on repeated header inputs.
- [x] Trailing slash stripping in `http-target-write-client.ts` uses linear string manipulation.
- [x] All existing secret sanitization and diagnostic tests pass.
- [x] CodeQL alerts #14, #15, #16, and #17 are resolved upon re-analysis.

### Implementation Notes

1. **Secret Redaction Regex Hardening:** Added negative lookahead `(?:(?!-----BEGIN)[\s\S])*?` to `packages/discovery/src/output/sanitizer.ts` and `packages/github-client/src/diagnostics.ts`, preventing catastrophic backtracking over repeated start markers.
2. **Safe URL Base Trimming:** In `packages/migration/src/client/http-target-write-client.ts`, replaced `replace(/\/+$/, '')` with linear `while (base.endsWith('/')) { base = base.slice(0, -1); }` to eliminate polynomial backtracking when stripping trailing slashes.
3. **Resilience & Regression Tests:** Added ReDoS benchmark unit tests to `apps/cli/tests/publisher.test.ts` and `apps/cli/tests/auth.test.ts` (verifying 500 repeated headers evaluate in < 100ms) and verified trailing slash normalization in `packages/migration/tests/orchestrator.test.ts`. All 338 monorepo tests pass.

---

## Testing Strategy

- **ReDoS Benchmark Test:** Add a test case passing a 5,000-character string composed of repeated `-----BEGIN PRIVATE KEY-----` segments and verify execution completes in $< 5\text{ms}$.
- **Functional Redaction Tests:** Validate that real multiline PEM keys and bearer tokens are still redacted as expected.

---

## Validation Commands

```bash
# Run discovery and client test suites
npm test packages/discovery/tests/ packages/github-client/tests/ packages/migration/tests/client/

# Run monorepo check
npm run check

# CodeQL re-analysis verification
gh run list --workflow codeql --limit 5
gh run view <run-id>
gh api "repos/cloudgxp/ghec-consultant-suite/code-scanning/alerts?state=open" --jq 'map(select(.rule.id == "js/polynomial-redos")) | length'
```
