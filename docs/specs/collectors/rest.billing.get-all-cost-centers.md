# rest.billing.get-all-cost-centers: Get all cost centers for an enterprise

Generated deterministically from the pinned research inputs and reviewed design policy. Status: specified, not implemented. Common requirements in [execution profile](../../../research/github/common-profile.json) are normative for this collector.

Official endpoint: [Get all cost centers for an enterprise](https://docs.github.com/enterprise-cloud@latest/rest/billing/cost-centers#get-all-cost-centers-for-an-enterprise). API version `2026-03-10`.

## Identity and selection

```json
{
  "id": "rest.billing.get-all-cost-centers",
  "module": "billing",
  "scope": "enterprise",
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
    "rest.billing.get-all-cost-centers"
  ],
  "inputs": [
    {
      "name": "enterprise",
      "schema": {
        "type": "string"
      },
      "required": true,
      "origin": "caller-supplied",
      "sourceField": "enterprise",
      "note": "Explicit approved target; enterprise membership not inferred from name."
    }
  ],
  "queryParameters": [
    {
      "name": "enterprise",
      "description": "The slug version of the enterprise name.",
      "in": "path",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "name": "state",
      "in": "query",
      "description": "Set to `active` or `deleted` to only list cost centers in a specific state.",
      "required": false,
      "schema": {
        "type": "string",
        "enum": [
          "active",
          "deleted"
        ]
      }
    }
  ],
  "dependencies": [],
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
        "support": "unknown",
        "requirements": [],
        "empirical": "not-tested"
      }
    },
    "permissionExpression": null,
    "additionalPermissionsRequireEndpointReview": false,
    "endpointRequirements": "",
    "documentSource": null,
    "roleAndPlanEvidence": [
      "Gets a list of all the cost centers for an enterprise.",
      "Enterprise owners and billing managers can view all cost centers, and organization owners can view cost centers associated with resources they administer.",
      "A custom role holder with fine-grained read access to enterprise billing can also view cost centers.",
      "An installation access token for a GitHub App installed on the enterprise with read access to enterprise billing can list all cost centers in the enterprise."
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
    "recordType": "rest.billing.get-all-cost-centers",
    "recordRoot": "$.costCenters[]",
    "fields": [
      {
        "output": "id",
        "source": "$.costCenters[].id",
        "sourceType": "string",
        "type": "string",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "ID of the cost center."
      },
      {
        "output": "name",
        "source": "$.costCenters[].name",
        "sourceType": "string",
        "type": "string",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Name of the cost center."
      },
      {
        "output": "state",
        "source": "$.costCenters[].state",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "active",
          "deleted"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "State of the cost center."
      },
      {
        "output": "ai_credit_pool_enabled",
        "source": "$.costCenters[].ai_credit_pool_enabled",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether the cost center draws from the AI credit pool.\n\nThis can only be enabled for cost centers that contain only user or team resources.\n\n- `false` — no cap; the cost center draws from the shared enterprise pool.\n- `true` — the cost center is capped at an amount derived from its members' license entitlements."
      }
    ],
    "envelope": "common-profile.json#/outputEnvelope",
    "relationships": "scopeRef refers to enterprise/organization/repository/resource anchor. Immutable IDs are namespaced by product, resource type and parent; person IDs are run scoped pseudonyms. Detail inputs may remain ephemeral and are not automatically evidence fields."
  },
  "privacy": {
    "allowlist": [
      "id",
      "name",
      "state",
      "ai_credit_pool_enabled"
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
    "parameters": [
      {
        "name": "state",
        "in": "query",
        "description": "Set to `active` or `deleted` to only list cost centers in a specific state.",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "active",
            "deleted"
          ]
        }
      }
    ],
    "pageSize": "min(100, endpoint documented maximum), never override a smaller limit; use endpoint default if maximum undocumented",
    "filters": "Only listed query parameters. Default time-bounded collectors to last 30 days where a documented filter exists; freeze until at scan start; otherwise disclose unbounded history and require optional request budget.",
    "retention": "Endpoint-specific documented limits in operation description/parameters; unknown where undocumented, never assume a full history.",
    "ordering": "Use endpoint-supported sort/direction only; Link next or documented cursor is authoritative; detect repeated cursor/URL.",
    "termination": "Exhaust next link/cursor; missing total is unknown; budget exhaustion yields partial. Pagination never proves token-wide or enterprise-wide completeness."
  },
  "cost": {
    "requests": "sum over scoped input tuples of max(1, ceil(visible_records / negotiated_page_size)); one for a nonpaged detail. Add dependency requests only once.",
    "fanoutKeys": [
      "enterprise"
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
      "200",
      "400",
      "403",
      "500",
      "503"
    ],
    "policy": "common-profile.json#/http"
  },
  "acceptanceCriteria": [
    "Only GET /enterprises/{enterprise}/settings/billing/cost-centers at 2026-03-10 and reviewed dependencies can be requested.",
    "Normalize only the 4 declared output fields; exact source types and missing/null states are preserved.",
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
