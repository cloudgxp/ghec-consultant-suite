# rest.packages.get-package-for-organization: Get a package for an organization

Generated deterministically from the pinned research inputs and reviewed design policy. Status: specified, not implemented. Common requirements in [execution profile](../../../research/github/common-profile.json) are normative for this collector.

Official endpoint: [Get a package for an organization](https://docs.github.com/enterprise-cloud@latest/rest/packages/packages#get-a-package-for-an-organization). API version `2026-03-10`.

## Identity and selection

```json
{
  "id": "rest.packages.get-package-for-organization",
  "module": "packages",
  "scope": "organization",
  "priority": "P2",
  "phase": "C2",
  "researchStatus": "documented-with-gaps",
  "selection": "optional",
  "executable": false
}
```

## Operations, inputs and discovery

```json
{
  "operations": [
    "rest.packages.get-package-for-organization"
  ],
  "inputs": [
    {
      "name": "package_type",
      "schema": {
        "type": "string",
        "enum": [
          "npm",
          "maven",
          "rubygems",
          "docker",
          "nuget",
          "container"
        ]
      },
      "required": true,
      "origin": "discovered",
      "collector": "rest.packages.list-packages-for-organization",
      "sourceField": "id",
      "note": "Check list response field against pinned schema; do not infer IDs from names."
    },
    {
      "name": "package_name",
      "schema": {
        "type": "string"
      },
      "required": true,
      "origin": "discovered",
      "collector": "rest.packages.list-packages-for-organization",
      "sourceField": "name",
      "note": "Scoped parent-list discovery; child pagination independent."
    },
    {
      "name": "org",
      "schema": {
        "type": "string"
      },
      "required": true,
      "origin": "caller-supplied",
      "sourceField": "org",
      "note": "Explicit approved target; enterprise membership not inferred from name."
    }
  ],
  "queryParameters": [
    {
      "name": "package_type",
      "description": "The type of supported package. Packages in GitHub's Gradle registry have the type `maven`. Docker images pushed to GitHub's Container registry (`ghcr.io`) have the type `container`. You can use the type `docker` to find images that were pushed to GitHub's Docker registry (`docker.pkg.github.com`), even if these have now been migrated to the Container registry.",
      "in": "path",
      "required": true,
      "schema": {
        "type": "string",
        "enum": [
          "npm",
          "maven",
          "rubygems",
          "docker",
          "nuget",
          "container"
        ]
      }
    },
    {
      "name": "package_name",
      "description": "The name of the package.",
      "in": "path",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "name": "org",
      "description": "The organization name. The name is not case sensitive.",
      "in": "path",
      "required": true,
      "schema": {
        "type": "string"
      }
    }
  ],
  "dependencies": [
    "rest.orgs.get",
    "rest.packages.list-packages-for-organization"
  ],
  "executionOrder": "Topological dependencies, then stable collector ID; per-resource work starts only after its selectors and anchors are known."
}
```

## Authentication and capability gates

```json
{
  "authentication": {
    "documentationStatus": "unresolved",
    "empiricalStatus": "not-tested",
    "tokens": {
      "appInstallation": {
        "support": "unknown",
        "source": "app-permissions",
        "empirical": "not-tested"
      },
      "appUser": {
        "support": "unknown",
        "source": "app-permissions",
        "empirical": "not-tested"
      },
      "fineGrainedPat": {
        "support": "unknown",
        "source": "047f030efe47b8a5",
        "empirical": "not-tested"
      },
      "classicPat": {
        "support": "documented-with-conditions",
        "requirements": [
          "OAuth app tokens and personal access tokens (classic) need the `read:packages` scope to use this endpoint.",
          "For more information, see \"[About permissions for GitHub Packages](https://docs.github.com/enterprise-cloud@latest/packages/learn-github-packages/about-permissions-for-github-packages#permissions-for-repository-scoped-packages).\""
        ],
        "empirical": "not-tested"
      }
    },
    "permissionExpression": null,
    "additionalPermissionsRequireEndpointReview": false,
    "endpointRequirements": "",
    "documentSource": null,
    "roleAndPlanEvidence": [
      "For more information, see \"[About permissions for GitHub Packages](https://docs.github.com/enterprise-cloud@latest/packages/learn-github-packages/about-permissions-for-github-packages#permissions-for-repository-scoped-packages).\""
    ],
    "constraints": "Fine-grained PAT owner/repository selection and approval; installation repository selection; user token limited by both user and app grants; classic PAT SSO authorization where enforced; token scopes do not grant account roles. Enterprise access is separately verified.",
    "unresolved": [
      "Verify any undocumented token model, classic scope minimum, role, plan and SSO condition against this exact endpoint section before enabling that auth profile; do not broaden grants."
    ]
  },
  "runtimeBlockers": [
    "Live implementation intentionally absent",
    "Contract 2.0.0 reader/writer and privacy release review pending",
    "Synthetic least-privilege verification not performed",
    "Verify any undocumented token model, classic scope minimum, role, plan and SSO condition against this exact endpoint section before enabling that auth profile; do not broaden grants."
  ]
}
```

## Exact evidence contract and privacy

```json
{
  "output": {
    "target": "2.0.0-proposed",
    "currentReaderCompatible": false,
    "reason": "Scoped collector executions and typed metadata records require a new registered reader; existing strict 1.0.0 writer/reader remain unchanged.",
    "recordType": "rest.packages.get-package-for-organization",
    "recordRoot": "$",
    "fields": [
      {
        "output": "id",
        "source": "$.id",
        "sourceType": "integer",
        "type": "integer",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Unique identifier of the package."
      },
      {
        "output": "name",
        "source": "$.name",
        "sourceType": "string",
        "type": "string",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The name of the package."
      },
      {
        "output": "package_type",
        "source": "$.package_type",
        "sourceType": "string",
        "type": "string",
        "nullable": false,
        "unit": null,
        "enum": [
          "npm",
          "maven",
          "rubygems",
          "docker",
          "nuget",
          "container"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "visibility",
        "source": "$.visibility",
        "sourceType": "string",
        "type": "string",
        "nullable": false,
        "unit": null,
        "enum": [
          "private",
          "public"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "created_at",
        "source": "$.created_at",
        "sourceType": "string",
        "type": "string",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "updated_at",
        "source": "$.updated_at",
        "sourceType": "string",
        "type": "string",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      }
    ],
    "envelope": "common-profile.json#/outputEnvelope",
    "relationships": "scopeRef refers to enterprise/organization/repository/resource anchor. Immutable IDs are namespaced by product, resource type and parent; person IDs are run scoped pseudonyms. Detail inputs may remain ephemeral and are not automatically evidence fields."
  },
  "privacy": {
    "allowlist": [
      "id",
      "name",
      "package_type",
      "visibility",
      "created_at",
      "updated_at"
    ],
    "prohibited": "common-profile.json#/privacy",
    "sensitivity": "restricted",
    "redaction": "Standard/minimal both obey exact allowlist. User identifiers pseudonymized; runner names/labels, webhook URLs, arbitrary free text and keys omitted. No flag permits prohibited retrieval."
  }
}
```

## Pagination, cost and coverage

```json
{
  "pagination": {
    "mode": "unpaged-or-endpoint-defined",
    "parameters": [],
    "pageSize": "min(100, endpoint documented maximum), never override a smaller limit; use endpoint default if maximum undocumented",
    "filters": "Only listed query parameters. Default time-bounded collectors to last 30 days where a documented filter exists; freeze until at scan start; otherwise disclose unbounded history and require optional request budget.",
    "retention": "Endpoint-specific documented limits in operation description/parameters; unknown where undocumented, never assume a full history.",
    "ordering": "Use endpoint-supported sort/direction only; Link next or documented cursor is authoritative; detect repeated cursor/URL.",
    "termination": "Exhaust next link/cursor; missing total is unknown; budget exhaustion yields partial. Pagination never proves token-wide or enterprise-wide completeness."
  },
  "cost": {
    "requests": "sum over scoped input tuples of max(1, ceil(visible_records / negotiated_page_size)); one for a nonpaged detail. Add dependency requests only once.",
    "fanoutKeys": [
      "package_type",
      "package_name",
      "org"
    ],
    "estimate": "unknown until scope and cardinality known; show lower bound, unknown upper bound and explicit operator request budget",
    "concurrency": 2,
    "timeoutSeconds": 30,
    "maxAttempts": 4,
    "maxRetrySeconds": 300
  },
  "coverage": {
    "denominator": "visible scoped resources only; enterprise total unknown unless separately attested",
    "observed": "deduplicated returned records, including zero only after exhausted successful enumeration",
    "truncation": "record page/request budget, last safe cursor, filters, failed resource count and unknown remaining count",
    "deduplication": "scope + upstream immutable record ID; else reviewed natural key (secret name, branch name, version) + parent; never dedupe by display name across scopes",
    "incremental": "Only when endpoint exposes a documented time/cursor filter; retained cursor is not assumed a durable change feed. Otherwise full reconciliation; deletions cannot be inferred from partial runs."
  },
  "limitations": [
    "Verify any undocumented token model, classic scope minimum, role, plan and SSO condition against this exact endpoint section before enabling that auth profile; do not broaden grants.",
    "Successful authentication is not proof of complete resource visibility.",
    "Snapshot is non-atomic; resources and grants may change between pages."
  ]
}
```

## Outcomes and acceptance

```json
{
  "outcomes": "common-profile.json#/outcomes",
  "httpBehavior": {
    "documentedResponseCodes": [
      "200"
    ],
    "policy": "common-profile.json#/http"
  },
  "acceptanceCriteria": [
    "Only GET /orgs/{org}/packages/{package_type}/{package_name} at 2026-03-10 and reviewed dependencies can be requested.",
    "Normalize only the 6 declared output fields; exact source types and missing/null states are preserved.",
    "Two synthetic pages plus an empty terminal page produce deduplicated scoped records; repeated cursor yields partial, not complete.",
    "401, ordinary 403, hidden 404, 429, 5xx, timeout and abort produce common-profile outcomes without raw payload diagnostics.",
    "No request is sent when capability, privacy, contract, selector or dependency gates fail.",
    "Inaccessible parent resources skip only dependent work; independent scopes retain successful evidence.",
    "Validate a synthetic 2.0.0 record and relationships before enabling a writer; current 1.0.0 reader must reject it."
  ],
  "syntheticScenarios": [
    {
      "name": "empty-visible-set",
      "given": "200 with documented empty shape and no next page",
      "expect": "complete for observed scope; observed=0, enterprise denominator unknown"
    },
    {
      "name": "partial-visibility",
      "given": "first page succeeds, next page 403",
      "expect": "partial, preserved first-page evidence, expected=null"
    },
    {
      "name": "missing-detail-id",
      "given": "required selector absent",
      "expect": "skipped before transport, no guessed ID"
    },
    {
      "name": "prohibited-field-drift",
      "given": "schema review shows new credential/value field",
      "expect": "operation blocked before customer execution; refresh review required"
    }
  ]
}
```
