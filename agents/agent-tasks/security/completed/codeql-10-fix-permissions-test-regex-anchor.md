# Task: Fix Missing Regexp Anchor in Permissions Test Assertion

## Title

Replace Unanchored URL Regular Expression in Permissions Test Assertion (`apps/cli/tests/permissions.test.ts`)

## Priority

**Low / Code Cleanup (Test Assertion False Positive Context)**  
_Rationale:_ CodeQL rule `js/regex/missing-regexp-anchor` flags regular expressions matching URLs that do not use `^` or `$` anchors or domain boundary checks, which in production security filters can allow an attacker to bypass origin checks (e.g. matching `https://github.com.attacker.com`). Here, the regex is located inside a unit test asserting that a formatted diagnostic report string contains a specific SAML SSO URL. While not exploitable, converting the assertion from regex matching to substring inclusion (`includes()`) or an anchored pattern clarifies test intent and eliminates the CodeQL alert.

---

## Related CodeQL Alerts

This task remediates **1 open CodeQL alert**:

| Alert Number | Rule ID                          | Severity       | File & Lines                             | GitHub Alert Link                                                                      |
| :----------- | :------------------------------- | :------------- | :--------------------------------------- | :------------------------------------------------------------------------------------- |
| **#8**       | `js/regex/missing-regexp-anchor` | High (Warning) | `apps/cli/tests/permissions.test.ts:163` | [Alert #8](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/8) |

---

## Problem

In `apps/cli/tests/permissions.test.ts`:

```typescript
const report = PermissionChecker.formatReport(res);
assert.match(report, /SAML SINGLE SIGN-ON \(SSO\) AUTHORIZATION REQUIRED/);
assert.match(report, /https:\/\/github\.com\/orgs\/acme-corp\/sso/);
```

Line 163 uses `assert.match` with an unanchored regex `/https:\/\/github\.com\/orgs\/acme-corp\/sso/`. CodeQL flags this rule because URL validation regexes without anchors can match arbitrary hostile domains containing the string as a prefix/suffix.

---

## Root Cause

Using a regular expression to assert substring presence in a multiline human-readable text report, which triggers CodeQL's URL validation heuristic.

---

## Relevant Code

- `apps/cli/tests/permissions.test.ts` (lines 160–165)

---

## Recommended Remediation

Extract the SSO URL line from the formatted report and perform an exact string equality assertion, avoiding both unanchored regexes (`js/regex/missing-regexp-anchor`) and direct URL substring searches (`js/incomplete-url-substring-sanitization`):

```typescript
const report = PermissionChecker.formatReport(res);
assert.match(report, /SAML SINGLE SIGN-ON \(SSO\) AUTHORIZATION REQUIRED/);
const ssoLine = report
  .split('\n')
  .find((line) => line.includes('SSO Authorization URL'));
assert.ok(ssoLine, 'Report should include SAML SSO authorization URL');
assert.equal(ssoLine.trim(), `↳ SSO Authorization URL: ${res.ssoUrl}`);
```

Using line extraction with non-URL substring filtering (`'SSO Authorization URL'`) and exact equality (`assert.equal`) verifies the formatted output precisely without triggering CodeQL URL sanitization heuristics.

---

## Implementation Considerations

- **No Impact on Production Code:** The file is strictly a test file under `apps/cli/tests/`. Production permission checking logic is unaffected.

---

## Acceptance Criteria

- [x] Line 163 in `apps/cli/tests/permissions.test.ts` does not use an unanchored URL regular expression.
- [x] Permission checker unit tests continue to pass.
- [x] CodeQL alert #8 is resolved upon re-analysis.
- [x] No secondary CodeQL alerts (such as `js/incomplete-url-substring-sanitization`) introduced.

### Implementation Notes

1. **Assertion Clarification:** Initially, `assert.match(report, /https:\/\/github\.com\/orgs\/acme-corp\/sso/)` was replaced with `assert.ok(report.includes('https://github.com/orgs/acme-corp/sso'))`. While this resolved `js/regex/missing-regexp-anchor`, CodeQL flagged `report.includes('https://...')` under `js/incomplete-url-substring-sanitization` as an insecure URL substring check.
2. **Hardened Line Assertion:** Replaced the URL substring check with line extraction (`report.split('\n').find((l) => l.includes('SSO Authorization URL'))`) and exact equality (`assert.equal(ssoLine.trim(), '↳ SSO Authorization URL: ' + res.ssoUrl)`). This eliminates both regex anchor and URL substring heuristics completely while strengthening test verification.
3. **Verification:** Ran `node --import tsx --test apps/cli/tests/permissions.test.ts` (8/8 tests pass). Full monorepo tests pass (339/339).

---

## Testing Strategy

- **Run Permissions Tests:** Execute `node --import tsx --test apps/cli/tests/permissions.test.ts` and verify test passes.

---

## Validation Commands

```bash
# Run permissions test
node --import tsx --test apps/cli/tests/permissions.test.ts

# Run monorepo check
npm run check

# CodeQL re-analysis verification
gh run list --workflow codeql --limit 5
gh run view <run-id>
gh api "repos/cloudgxp/ghec-consultant-suite/code-scanning/alerts?state=open" --jq 'map(select(.rule.id == "js/regex/missing-regexp-anchor")) | length'
```
