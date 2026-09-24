# rest.billing.get-all-budgets: Get all budgets

Generated deterministically from the pinned research inputs and reviewed design policy. Status: specified, not implemented. Common requirements in [execution profile](../../../research/github/common-profile.json) are normative for this collector.

Official endpoint: [Get all budgets](https://docs.github.com/enterprise-cloud@latest/rest/billing/budgets#get-all-budgets). API version `2026-03-10`.

## Identity and selection

```json
{
  "id": "rest.billing.get-all-budgets",
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
    "rest.billing.get-all-budgets"
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
      "name": "page",
      "description": "The page number of results to fetch.",
      "in": "query",
      "schema": {
        "type": "integer",
        "default": 1
      }
    },
    {
      "name": "per_page",
      "description": "The number of results per page (max 100).",
      "in": "query",
      "schema": {
        "type": "integer",
        "default": 10
      }
    },
    {
      "name": "scope",
      "description": "Filter budgets by scope type.\n\n- `enterprise`: Budgets that apply to the entire enterprise.\n- `organization`: Budgets scoped to an organization in the enterprise.\n- `repository`: Budgets scoped to a repository.\n- `cost_center`: Budgets scoped to a cost center.\n- `multi_user_customer`: Universal budgets that apply to all users in the enterprise.\n- `multi_user_cost_center`: Universal budgets that apply to all users in a cost center.\n- `user`: Budgets scoped to an individual user.",
      "in": "query",
      "schema": {
        "type": "string",
        "enum": [
          "enterprise",
          "organization",
          "repository",
          "cost_center",
          "multi_user_customer",
          "multi_user_cost_center",
          "user"
        ]
      }
    },
    {
      "name": "user",
      "description": "Filter consumed amount details for budgets by the specified user login.",
      "in": "query",
      "schema": {
        "type": "string"
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
        "support": "documented-with-conditions",
        "requirements": [
          "Enterprise owners and billing managers can view all budgets, and organization administrators can view budgets scoped to organizations and repositories they administer.",
          "A custom role holder with fine-grained read access to enterprise billing can view non-repository budgets; repository-scoped budgets require the organization administrator permissions described above."
        ],
        "empirical": "not-tested"
      }
    },
    "permissionExpression": null,
    "additionalPermissionsRequireEndpointReview": false,
    "endpointRequirements": "",
    "documentSource": null,
    "roleAndPlanEvidence": [
      "Gets budgets for an enterprise.",
      "Enterprise owners and billing managers can view all budgets, and organization administrators can view budgets scoped to organizations and repositories they administer.",
      "A custom role holder with fine-grained read access to enterprise billing can view non-repository budgets; repository-scoped budgets require the organization administrator permissions described above.",
      "An installation access token for a GitHub App installed on the enterprise with read access to enterprise billing can list all budgets in the enterprise."
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
    "recordType": "rest.billing.get-all-budgets",
    "recordRoot": "$.budgets[]",
    "fields": [
      {
        "output": "id",
        "source": "$.budgets[].id",
        "sourceType": "string",
        "type": "string",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The unique identifier for the budget"
      },
      {
        "output": "budget_amount",
        "source": "$.budgets[].budget_amount",
        "sourceType": "integer",
        "type": "integer",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The budget amount limit in whole dollars. For license-based products, this represents the number of licenses."
      },
      {
        "output": "prevent_further_usage",
        "source": "$.budgets[].prevent_further_usage",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The type of limit enforcement for the budget"
      },
      {
        "output": "budget_scope",
        "source": "$.budgets[].budget_scope",
        "sourceType": "string",
        "type": "string",
        "nullable": false,
        "unit": null,
        "enum": [
          "enterprise",
          "organization",
          "repository",
          "cost_center",
          "multi_user_customer",
          "multi_user_cost_center",
          "user"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The scope of the budget"
      },
      {
        "output": "consumed_amount",
        "source": "$.budgets[].consumed_amount",
        "sourceType": "number",
        "type": "number",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The amount consumed for a user-scoped budget, or for a multi-user budget when filtering by user."
      },
      {
        "output": "expires_at",
        "source": "$.budgets[].expires_at",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The date the budget will expire in `YYYY-MM-DD` format. Only dates in the future are accepted.\nIf not provided, the budget will not expire.\n\nOnly supported for budgets with `budget_scope` of `user`"
      }
    ],
    "envelope": "common-profile.json#/outputEnvelope",
    "relationships": "scopeRef refers to enterprise/organization/repository/resource anchor. Immutable IDs are namespaced by product, resource type and parent; person IDs are run scoped pseudonyms. Detail inputs may remain ephemeral and are not automatically evidence fields."
  },
  "privacy": {
    "allowlist": [
      "id",
      "budget_amount",
      "prevent_further_usage",
      "budget_scope",
      "consumed_amount",
      "expires_at"
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
    "mode": "link",
    "parameters": [
      {
        "name": "page",
        "description": "The page number of results to fetch.",
        "in": "query",
        "schema": {
          "type": "integer",
          "default": 1
        }
      },
      {
        "name": "per_page",
        "description": "The number of results per page (max 100).",
        "in": "query",
        "schema": {
          "type": "integer",
          "default": 10
        }
      },
      {
        "name": "scope",
        "description": "Filter budgets by scope type.\n\n- `enterprise`: Budgets that apply to the entire enterprise.\n- `organization`: Budgets scoped to an organization in the enterprise.\n- `repository`: Budgets scoped to a repository.\n- `cost_center`: Budgets scoped to a cost center.\n- `multi_user_customer`: Universal budgets that apply to all users in the enterprise.\n- `multi_user_cost_center`: Universal budgets that apply to all users in a cost center.\n- `user`: Budgets scoped to an individual user.",
        "in": "query",
        "schema": {
          "type": "string",
          "enum": [
            "enterprise",
            "organization",
            "repository",
            "cost_center",
            "multi_user_customer",
            "multi_user_cost_center",
            "user"
          ]
        }
      },
      {
        "name": "user",
        "description": "Filter consumed amount details for budgets by the specified user login.",
        "in": "query",
        "schema": {
          "type": "string"
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
      "404",
      "403"
    ],
    "policy": "common-profile.json#/http"
  },
  "acceptanceCriteria": [
    "Only GET /enterprises/{enterprise}/settings/billing/budgets at 2026-03-10 and reviewed dependencies can be requested.",
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
