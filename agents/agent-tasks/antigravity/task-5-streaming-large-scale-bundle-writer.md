# Task CLI-5: Streaming Large-Scale Bundle Writer & HMAC Pseudonymization

## Objective

Implement a memory-bounded streaming JSON bundle writer capable of serializing 100,000+ entities without V8 heap exhaustion, along with cryptographically secure HMAC-SHA256 identity pseudonymization.

---

## Business & Technical Rationale

- **Memory Pressure at Enterprise Scale**: In an enterprise with 2,000 repositories, tens of thousands of branch protection rules, and thousands of developers, the total entity count can exceed 100,000. Calling `JSON.stringify(bundle)` in memory requires buffering hundreds of megabytes of JSON text, causing Node.js to trigger `ERR_STRING_TOO_LONG` or V8 Out-Of-Memory crashes.
- **Privacy & Compliance (GDPR/CCPA)**: Consultant discovery tools must never store raw personal identifiers (user emails, personal logins, full names). User identities must be pseudonymized using HMAC-SHA256 with an operator salt so identities remain consistent for permission mapping while preventing reverse identification.

---

## Technical Specifications & Scope

### 1. Cryptographic HMAC-SHA256 Pseudonymization

Create `apps/cli/src/output/sanitizer.ts`:

- Support an optional CLI flag `--salt <secret>` or generate a cryptographically random 32-byte hexadecimal salt per scan.
- For all identity entities (`kind: 'identity'`) and team member references:
  $$\text{pseudonym} = \text{"usr\_"} + \text{HMAC-SHA256}(\text{salt}, \text{username}).\text{slice}(0, 16)$$
- Record the salt's SHA-256 digest in `bundle.configuration` (never recording the raw salt itself).
- Allow consultants re-running scans to provide the same `--salt` across multiple scans so pseudonymized IDs match across time for diffing.
- Strip all email addresses, bio strings, social profiles, and avatars.

### 2. Pre-Publication Security Screening

- Before streaming records to disk, run an in-memory token pattern regex scanner on all string attributes:
  - Match and reject common secret patterns:
    - GitHub PATs: `ghp_[A-Za-z0-9_]{36,}`, `github_pat_[A-Za-z0-9_]{82,}`
    - GitHub App tokens: `ghs_[A-Za-z0-9_]{36,}`, `ghu_[A-Za-z0-9_]{36,}`
    - Private Keys: `-----BEGIN (RSA|OPENSSH|EC|DSA)? PRIVATE KEY-----`
    - Webhook Secrets & Authorization header values
- If any secret pattern is detected in an entity attribute:
  - Redact the value to `[REDACTED_SECRET_PATTERN]`
  - Append a warning to the corresponding `CollectorExecution.warnings` record.

### 3. Streaming JSON Bundle Writer

Update [apps/cli/src/output/publisher.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/output/publisher.ts):

- Replace synchronous `JSON.stringify(bundle)` with a streaming file writer:
  1. Open a write stream to `.scans/.<runId>.tmp` with file mode `0o600`.
  2. Write top-level bundle properties: `schemaVersion`, `synthetic`, `scan`, `configuration`, `scope`, `organizations`, `collectors`.
  3. Stream the `entities` array element-by-element:
     - Open array: `"entities": [\n`
     - Iterate through entity chunks or stream from checkpoint files, writing each entity followed by `,\n`.
     - Close array: `\n],`
  4. Write `findings`, `limitations`, `errors`, and `summary`.
  5. Close root JSON object: `\n}\n`.
  6. Atomically rename the temporary file to the final destination:
     `ghec-discovery-<scope-kind>-<scope-name>-<timestamp>-<runId>.json`.
- Enforce strict non-clobber behavior: Never overwrite an existing file.

---

## Target Files

- [apps/cli/src/output/publisher.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/output/publisher.ts)
- [apps/cli/src/output/sanitizer.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/output/) _(new file)_
- [apps/cli/src/collectors/users.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/collectors/users.ts)
- [apps/cli/src/engine/orchestrator.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/engine/orchestrator.ts)
- [apps/cli/tests/publisher.test.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/tests/) _(new file)_

---

## Acceptance Criteria

1. Writing a synthetic bundle with 100,000 entities completes successfully with process memory remaining under 512 MB RSS.
2. The streamed output file is valid JSON and validates 100% against `@ghec/contracts` (`validateBundle`).
3. User identities are cleanly pseudonymized using HMAC-SHA256 (`usr_<hash>`).
4. Output files are created with restricted file mode `0600` and atomic rename.
5. Post-collection regex scanner catches and neutralizes any accidental token patterns.
