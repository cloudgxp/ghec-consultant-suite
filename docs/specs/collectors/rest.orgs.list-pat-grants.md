# rest.orgs.list-pat-grants: List fine-grained personal access tokens with access to organization resources

Generated deterministically from the pinned research inputs and reviewed design policy. Status: specified, not implemented. Common requirements in [execution profile](../../../research/github/common-profile.json) are normative for this collector.

Official endpoint: [List fine-grained personal access tokens with access to organization resources](https://docs.github.com/enterprise-cloud@latest/rest/orgs/personal-access-tokens#list-fine-grained-personal-access-tokens-with-access-to-organization-resources). API version `2026-03-10`.

## Identity and selection

```json
{
  "id": "rest.orgs.list-pat-grants",
  "module": "orgs",
  "scope": "organization",
  "priority": "P1",
  "phase": "C2",
  "researchStatus": "documented-with-gaps",
  "selection": "default",
  "executable": false
}
```

## Operations, inputs and discovery

```json
{
  "operations": [
    "rest.orgs.list-pat-grants"
  ],
  "inputs": [
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
      "name": "org",
      "description": "The organization name. The name is not case sensitive.",
      "in": "path",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "name": "per_page",
      "description": "The number of results per page (max 100). For more information, see \"[Using pagination in the REST API](https://docs.github.com/enterprise-cloud@latest/rest/using-the-rest-api/using-pagination-in-the-rest-api).\"",
      "in": "query",
      "schema": {
        "type": "integer",
        "default": 30
      }
    },
    {
      "name": "page",
      "description": "The page number of the results to fetch. For more information, see \"[Using pagination in the REST API](https://docs.github.com/enterprise-cloud@latest/rest/using-the-rest-api/using-pagination-in-the-rest-api).\"",
      "in": "query",
      "schema": {
        "type": "integer",
        "default": 1
      }
    },
    {
      "name": "sort",
      "description": "The property by which to sort the results.",
      "in": "query",
      "required": false,
      "schema": {
        "type": "string",
        "enum": [
          "created_at"
        ],
        "default": "created_at"
      }
    },
    {
      "name": "direction",
      "description": "The direction to sort the results by.",
      "in": "query",
      "required": false,
      "schema": {
        "type": "string",
        "enum": [
          "asc",
          "desc"
        ],
        "default": "desc"
      }
    },
    {
      "name": "owner",
      "description": "A list of owner usernames to use to filter the results.",
      "in": "query",
      "required": false,
      "schema": {
        "type": "array",
        "maxItems": 10,
        "items": {
          "type": "string"
        },
        "example": "owner[]=octocat1,owner[]=octocat2"
      }
    },
    {
      "name": "repository",
      "description": "The name of the repository to use to filter the results.",
      "in": "query",
      "required": false,
      "schema": {
        "type": "string",
        "example": "Hello-World"
      }
    },
    {
      "name": "permission",
      "description": "The permission to use to filter the results.",
      "in": "query",
      "required": false,
      "schema": {
        "type": "string",
        "example": "issues_read"
      }
    },
    {
      "name": "last_used_before",
      "description": "Only show fine-grained personal access tokens used before the given time. This is a timestamp in [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) format: `YYYY-MM-DDTHH:MM:SSZ`.",
      "in": "query",
      "required": false,
      "schema": {
        "type": "string",
        "format": "date-time"
      }
    },
    {
      "name": "last_used_after",
      "description": "Only show fine-grained personal access tokens used after the given time. This is a timestamp in [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) format: `YYYY-MM-DDTHH:MM:SSZ`.",
      "in": "query",
      "required": false,
      "schema": {
        "type": "string",
        "format": "date-time"
      }
    },
    {
      "name": "token_id",
      "description": "The ID of the token",
      "in": "query",
      "required": false,
      "schema": {
        "type": "array",
        "maxItems": 50,
        "items": {
          "type": "string"
        },
        "example": "token_id[]=1,token_id[]=2"
      }
    }
  ],
  "dependencies": [
    "rest.orgs.get"
  ],
  "executionOrder": "Topological dependencies, then stable collector ID; per-resource work starts only after its selectors and anchors are known."
}
```

## Authentication and capability gates

```json
{
  "authentication": {
    "documentationStatus": "permission-reference-documented",
    "empiricalStatus": "not-tested",
    "tokens": {
      "appInstallation": {
        "support": "documented",
        "source": "app-permissions",
        "empirical": "not-tested"
      },
      "appUser": {
        "support": "documented",
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
    "permissionExpression": {
      "anyOf": [
        {
          "allOf": [
            {
              "permission": "Organization permissions for \"Personal access tokens\"",
              "access": "read"
            }
          ]
        }
      ]
    },
    "additionalPermissionsRequireEndpointReview": false,
    "endpointRequirements": "",
    "documentSource": null,
    "roleAndPlanEvidence": [
      "Lists approved fine-grained personal access tokens owned by organization members that can access organization resources."
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
    "recordType": "rest.orgs.list-pat-grants",
    "recordRoot": "$[]",
    "fields": [
      {
        "output": "id",
        "source": "$[].id",
        "sourceType": "integer",
        "type": "integer",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Unique identifier of the fine-grained personal access token grant. The `pat_id` used to get details about an approved fine-grained personal access token."
      },
      {
        "output": "repository_selection",
        "source": "$[].repository_selection",
        "sourceType": "string",
        "type": "string",
        "nullable": false,
        "unit": null,
        "enum": [
          "none",
          "all",
          "subset"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Type of repository selection requested."
      },
      {
        "output": "token_expired",
        "source": "$[].token_expired",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether the associated fine-grained personal access token has expired."
      }
    ],
    "envelope": "common-profile.json#/outputEnvelope",
    "relationships": "scopeRef refers to enterprise/organization/repository/resource anchor. Immutable IDs are namespaced by product, resource type and parent; person IDs are run scoped pseudonyms. Detail inputs may remain ephemeral and are not automatically evidence fields."
  },
  "privacy": {
    "allowlist": [
      "id",
      "repository_selection",
      "token_expired"
    ],
    "prohibited": "common-profile.json#/privacy",
    "sensitivity": "confidential",
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
        "name": "per_page",
        "description": "The number of results per page (max 100). For more information, see \"[Using pagination in the REST API](https://docs.github.com/enterprise-cloud@latest/rest/using-the-rest-api/using-pagination-in-the-rest-api).\"",
        "in": "query",
        "schema": {
          "type": "integer",
          "default": 30
        }
      },
      {
        "name": "page",
        "description": "The page number of the results to fetch. For more information, see \"[Using pagination in the REST API](https://docs.github.com/enterprise-cloud@latest/rest/using-the-rest-api/using-pagination-in-the-rest-api).\"",
        "in": "query",
        "schema": {
          "type": "integer",
          "default": 1
        }
      },
      {
        "name": "sort",
        "description": "The property by which to sort the results.",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "created_at"
          ],
          "default": "created_at"
        }
      },
      {
        "name": "direction",
        "description": "The direction to sort the results by.",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "asc",
            "desc"
          ],
          "default": "desc"
        }
      },
      {
        "name": "owner",
        "description": "A list of owner usernames to use to filter the results.",
        "in": "query",
        "required": false,
        "schema": {
          "type": "array",
          "maxItems": 10,
          "items": {
            "type": "string"
          },
          "example": "owner[]=octocat1,owner[]=octocat2"
        }
      },
      {
        "name": "repository",
        "description": "The name of the repository to use to filter the results.",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "example": "Hello-World"
        }
      },
      {
        "name": "permission",
        "description": "The permission to use to filter the results.",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "example": "issues_read"
        }
      },
      {
        "name": "last_used_before",
        "description": "Only show fine-grained personal access tokens used before the given time. This is a timestamp in [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) format: `YYYY-MM-DDTHH:MM:SSZ`.",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "format": "date-time"
        }
      },
      {
        "name": "last_used_after",
        "description": "Only show fine-grained personal access tokens used after the given time. This is a timestamp in [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) format: `YYYY-MM-DDTHH:MM:SSZ`.",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "format": "date-time"
        }
      },
      {
        "name": "token_id",
        "description": "The ID of the token",
        "in": "query",
        "required": false,
        "schema": {
          "type": "array",
          "maxItems": 50,
          "items": {
            "type": "string"
          },
          "example": "token_id[]=1,token_id[]=2"
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
      "500",
      "422",
      "404",
      "403",
      "200"
    ],
    "policy": "common-profile.json#/http"
  },
  "acceptanceCriteria": [
    "Only GET /orgs/{org}/personal-access-tokens at 2026-03-10 and reviewed dependencies can be requested.",
    "Normalize only the 3 declared output fields; exact source types and missing/null states are preserved.",
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
