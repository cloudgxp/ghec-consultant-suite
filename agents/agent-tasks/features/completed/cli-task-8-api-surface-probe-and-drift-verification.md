# Task CLI-8: Automated API Surface Probe & Schema Drift Verification Suite (Tooling)

## Objective

Create an automated test and verification script (`scripts/collectors/probe-api-surface.ts`) that validates all planned GraphQL queries and REST endpoints against GitHub's official schemas and API descriptions, detecting breaking changes, deprecated fields, and schema drift.

---

## Business & Technical Rationale

GitHub frequently evolves its API surface: fields are deprecated, new security requirements are introduced, and preview headers are graduated.

- If a collector relies on an endpoint that has moved or a field that has been renamed, discovery will silently fail in production at a customer site or emit incomplete evidence.
- An automated **API Surface Probe & Drift Verification Suite** ensures that:
  1. Every GraphQL query in `graphql-query-catalog.json` is syntactically valid and references real fields in GitHub's GraphQL schema.
  2. Every REST operation in `endpoint-inventory.json` matches the official GHEC OpenAPI description (`ghec.2026-03-10.json`).
  3. Every mapped field conforms to the `@ghec/contracts` schema without synthesizing dummy values.
  4. The test suite can run **offline** against pinned schema definitions during CI and optionally **live** against a test GitHub organization with an operator token.

---

## Technical Specifications & Scope

### 1. Verification Script Architecture

Create `scripts/collectors/probe-api-surface.ts`:

- **Offline Validation Mode (Default)**:
  - Uses the pinned OpenAPI spec: `research/github/sources/ghec.2026-03-10.json`.
  - Validates that every operation ID in `collector-registry.json` and `endpoint-inventory.json` exists in the OpenAPI paths with matching HTTP method (`GET`).
  - Verifies path parameters (e.g. `{owner}`, `{repo}`, `{org}`, `{enterprise}`) and query parameters (`per_page`, `page`, `since`).
  - Verifies that GraphQL queries in `graphql-query-catalog.json` parse cleanly and do not reference non-existent fields.
- **Live Probe Mode (`--live --org <test-org>`)**:
  - When `GHEC_TOKEN` and `--live` are provided:
    - Sends lightweight `HEAD` or single-item `limit=1` requests to each planned endpoint in a synthetic test organization.
    - Records actual HTTP response status codes, content-type headers, and rate-limit cost headers.
    - Detects permission-denied (403/401) vs not-found (404) vs server errors (500).

### 2. Output Schema Drift Report

Generate `research/github/api-drift-report.json`:

```json
{
  "$schema": "./schemas/api-drift-report.schema.json",
  "generatedAt": "2026-09-25T12:00:00Z",
  "targetApiVersion": "2026-03-10",
  "summary": {
    "totalOperationsAudited": 776,
    "validOperations": 774,
    "driftWarnings": 2,
    "deprecatedEndpoints": 0
  },
  "graphQLVerification": {
    "totalQueries": 8,
    "validQueries": 8,
    "syntaxErrors": []
  },
  "driftDetails": [
    {
      "operationId": "rest.orgs.get",
      "status": "verified",
      "path": "/orgs/{org}",
      "openApiMatch": true
    }
  ]
}
```

### 3. npm Script Integration

In root `package.json`, add:

- `"probe:api": "node --import tsx scripts/collectors/probe-api-surface.ts"`
- `"probe:api:live": "node --import tsx scripts/collectors/probe-api-surface.ts --live"`

---

## Target Files

- `scripts/collectors/probe-api-surface.ts` _(new file)_
- `research/github/api-drift-report.json` _(new file)_
- [package.json](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/package.json)
- [scripts/collectors/validate.py](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/scripts/collectors/validate.py)

---

## Acceptance Criteria

1. Running `npm run probe:api` completes offline in < 5 seconds and checks all inventoried operations against pinned schemas.
2. Any discrepancy (unknown field, missing path parameter, invalid query syntax) causes the script to report clear error diagnostics and exit `1`.
3. The generated `api-drift-report.json` accurately catalogues the validation state of all planned operations.
4. Clean integration with `npm test` and CI gates.
