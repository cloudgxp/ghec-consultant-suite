# Discovery JSON contract

**DATA-001.** The portable bundle is a public interface independent of CLI/dashboard release versions. Authoritative executable validation and inferred TypeScript types live in `packages/contracts/src/index.ts` (Zod). ADR 0004 freezes version `1.0.0` as the current release baseline; only that version is registered. AC: all tracked synthetic fixtures validate and malformed, incompatible, foreign-key-invalid or misaggregated bundles fail. A separately generated JSON Schema may be published later; no unmaintained duplicate schema is supplied.

| Field                        | Required meaning                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schemaVersion`, `synthetic` | Exact reader version and unmistakable fictional-data label                                                                                       |
| `scan`                       | Run ID, producer/version, start/end, complete/partial/failed outcome                                                                             |
| `configuration`              | Resolved modules including dependencies, JSON format, redaction profile, sensitive opt-in and error-continuation choice; no credentials/raw argv |
| `scope`                      | Organization ID, or enterprise slug with enumeration state and known inaccessible count (null when unknown)                                      |
| `organizations`              | Scoped IDs, login and nullable approved display name                                                                                             |
| `collectors`                 | One execution per selected module and discovered organization                                                                                    |
| `entities`                   | Strict discriminated normalized records referencing organization and execution                                                                   |
| `findings`                   | Versioned calculated/advisory rules, evidence, severity/confidence and limitations                                                               |
| `limitations`, `errors`      | Scope-wide caveats and sanitized typed errors                                                                                                    |
| `summary`                    | Observed organization/repository counts and complete/incomplete execution counts                                                                 |

## Execution, evidence and uncertainty

**DATA-EXEC-001.** Every execution has `id`, `module`, `organizationId`, terminal `status`, start/end times, provenance, warnings, errors and coverage. Status is complete, partial, failed, skipped or unavailable. Coverage state is complete, partial, unknown or none; `observed` is the number of enumerated target resources and `expected` is nullable when denominator is unknown. Completeness reasons are mandatory for noncomplete execution; failed execution requires an error. An execution can completely enumerate a target list while a particular metric is unknown. AC: complete executions cannot carry errors or incomplete coverage, and observed cannot exceed a known expected value.

Provenance carries `source` (graphql/rest/synthetic), reviewed operation ID (not raw query or URL), observation timestamp and nullable API version. Scan timestamps describe the run; source timestamps describe evidence freshness. Dates are RFC 3339 with timezone; output should normalize to UTC. API observations across a run are not an atomic snapshot.

**DATA-UNKNOWN-001.** A metric is `{value, unit, availability, reason}`. Units are bytes, count or minutes. Observed values are nonnegative numbers (including actual zero); unknown/unavailable values are null with a reason. Nullable booleans mean not observed, not false. AC: changing an unknown metric to zero without changing its evidence state fails validation. Enumerated counts are integer-valued; size/storage fields require bytes and usage requires minutes.

## Normalized records

| Kind           | Module          | Fields beyond common evidence keys                                                                               |
| -------------- | --------------- | ---------------------------------------------------------------------------------------------------------------- |
| repository     | repos           | name, visibility, archived, defaultBranch, size metric, fork                                                     |
| lfs            | lfs             | repositoryId, storage/objectCount metrics, detected/not_detected/unknown indicator                               |
| team           | teams           | name, nullable parentTeamId, membershipCount, repositoryAccess mappings                                          |
| actions        | actions         | repositoryId, enabled, workflowCount, runnerCount, usage, workflowNames, runnerTypes                             |
| actions-secret | actions-secrets | nullable repositoryId, name, secret/variable discriminator, organization/repository/environment level, updatedAt |
| policy         | policies        | nullable repositoryId, branch_protection/ruleset kind, name, enforcement                                         |
| security       | security        | repositoryId, codeScanning/dependabot states, openAlertCount                                                     |
| integration    | integrations    | nullable repositoryId, webhook/github_app/deploy_key/ssh_signing/other kind, approved label, active              |
| identity       | users           | run-scoped pseudonym, outsideCollaborator, ssoStatus, membership                                                 |
| asset          | packages        | repositoryId, package/release/large_asset kind, name, size                                                       |

These are initial metadata shapes, not claims that every field is available from an API. Details such as full workflow/ruleset models, registry-specific packages and environment relationships need versioned extensions after verified discovery. Never fill unknown fields from assumptions.

**DATA-ID-001.** IDs are opaque namespaced identifiers, unique within each top-level collection and stable across references within a bundle. Producers should derive resource IDs from immutable upstream IDs when approved; pseudonymized person IDs are stable only within a run by default. Preserve organization ownership. AC: duplicate IDs, dangling entity/execution references and cross-organization relationships fail. Team cycles and special cross-organization relationships require additional implementation-time semantic checks; they are not supported model features.

**DATA-FIND-001.** Findings distinguish calculated results from recommendations, reference existing same-organization entities/executions, and include rule ID/version, confidence, limitations and severity. Observed facts stay in entities. AC: every displayed finding can reveal its evidence; fixture advisories are clearly synthetic and are not results of implemented rules.

**DATA-AGG-001.** Enterprise summaries are sums of observed scope, never guessed totals. No deduplication by name across organizations; no averages that treat unknowns as zero. Current summary includes only counts that can be reproduced from records. AC: summary mismatch fails validation; partial enumeration is visible at enterprise level. A single inaccessible organization can remain unknown without fabricated records.

## Privacy and compatibility

**DATA-SEC-001.** Strict objects reject undeclared fields. There are no token, password, secret value, variable value, private key, webhook URL/secret or raw diagnostic properties. Do not infer that arbitrary string content is safe merely because it passes a schema: collector allowlists and redaction remain mandatory. `minimal` means minimal redaction, not minimal data; this draft still exports identity pseudonyms only. Sensitive fields may be added only after explicit allowlist review and a versioned schema change. Current sensitive opt-in cannot add fields. AC: adding `value` to a secret record fails validation; seeded prohibited content is tested again at future serialization/log boundaries.

**DATA-VERSION-001.** Unknown fields are rejected, not retained. Register exact compatible readers and explicit pure normalizers; do not accept every future `1.x` automatically. New readers must retain supported earlier minor readers. Major changes require explicit migration with preserved originals; future minors/unknown majors reject with supported versions. See ADRs 0002 and 0004. Existing `2.0.0-proposed` collector mappings are deferred design work, not runtime support. AC: incompatible version errors never interpolate untrusted input.

## Representative synthetic example

The complete, executable examples are [organization-v1.json](../../fixtures/synthetic/organization-v1.json), [enterprise-v1.json](../../fixtures/synthetic/enterprise-v1.json), [specialized-v1.json](../../fixtures/synthetic/specialized-v1.json), and [partial-denied-v1.json](../../fixtures/synthetic/partial-denied-v1.json). The enterprise fixture contains two fictional organizations, 22 executions, 19 complete executions, two partial LFS executions and one failed security execution. Its two observed repositories are not claimed to represent an entire enterprise. The specialized fixture covers the implemented typed entity surface; the partial-denied fixture demonstrates honest unknown values and partial coverage after fictional HTTP 403 responses.

Metric excerpt (not a complete bundle):

```json
{
  "value": null,
  "unit": "bytes",
  "availability": "unknown",
  "reason": "Not measurable from available fictional evidence"
}
```

These fixtures are hand-authored design evidence. No live collector or API behavior is implied.
