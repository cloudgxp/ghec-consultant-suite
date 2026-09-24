# rest.actions.list-workflow-runs-for-repo: List workflow runs for a repository

Generated deterministically from the pinned research inputs and reviewed design policy. Status: specified, not implemented. Common requirements in [execution profile](../../../research/github/common-profile.json) are normative for this collector.

Official endpoint: [List workflow runs for a repository](https://docs.github.com/enterprise-cloud@latest/rest/actions/workflow-runs#list-workflow-runs-for-a-repository). API version `2026-03-10`.

## Identity and selection

```json
{
  "id": "rest.actions.list-workflow-runs-for-repo",
  "module": "actions",
  "scope": "repository",
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
    "rest.actions.list-workflow-runs-for-repo"
  ],
  "inputs": [
    {
      "name": "owner",
      "schema": {
        "type": "string"
      },
      "required": true,
      "origin": "discovered",
      "collector": "rest.repos.list-for-org",
      "sourceField": "owner.login",
      "note": "Routing selector held ephemerally; verify immutable parent identity."
    },
    {
      "name": "repo",
      "schema": {
        "type": "string"
      },
      "required": true,
      "origin": "discovered",
      "collector": "rest.repos.list-for-org",
      "sourceField": "name",
      "note": "Routing selector held ephemerally; verify immutable parent identity."
    }
  ],
  "queryParameters": [
    {
      "name": "owner",
      "description": "The account owner of the repository. The name is not case sensitive.",
      "in": "path",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "name": "repo",
      "description": "The name of the repository without the `.git` extension. The name is not case sensitive.",
      "in": "path",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "name": "actor",
      "description": "Returns someone's workflow runs. Use the login for the user who created the `push` associated with the check suite or workflow run.",
      "in": "query",
      "required": false,
      "schema": {
        "type": "string"
      }
    },
    {
      "name": "branch",
      "description": "Returns workflow runs associated with a branch. Use the name of the branch of the `push`.",
      "in": "query",
      "required": false,
      "schema": {
        "type": "string"
      }
    },
    {
      "name": "event",
      "description": "Returns workflow run triggered by the event you specify. For example, `push`, `pull_request` or `issue`. For more information, see \"[Events that trigger workflows](https://docs.github.com/enterprise-cloud@latest/actions/automating-your-workflow-with-github-actions/events-that-trigger-workflows).\"",
      "in": "query",
      "required": false,
      "schema": {
        "type": "string"
      }
    },
    {
      "name": "status",
      "description": "Returns workflow runs with the check run `status` or `conclusion` that you specify. For example, a conclusion can be `success` or a status can be `in_progress`. Only GitHub Actions can set a status of `waiting`, `pending`, or `requested`.",
      "in": "query",
      "required": false,
      "schema": {
        "type": "string",
        "enum": [
          "completed",
          "action_required",
          "cancelled",
          "failure",
          "neutral",
          "skipped",
          "stale",
          "success",
          "timed_out",
          "in_progress",
          "queued",
          "requested",
          "waiting",
          "pending"
        ]
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
      "name": "created",
      "description": "Returns workflow runs created within the given date-time range. For more information on the syntax, see \"[Understanding the search syntax](https://docs.github.com/enterprise-cloud@latest/search-github/getting-started-with-searching-on-github/understanding-the-search-syntax#query-for-dates).\"",
      "in": "query",
      "required": false,
      "schema": {
        "type": "string",
        "format": "date-time"
      }
    },
    {
      "name": "exclude_pull_requests",
      "description": "If `true` pull requests are omitted from the response (empty array).",
      "in": "query",
      "required": false,
      "schema": {
        "type": "boolean",
        "default": false
      }
    },
    {
      "name": "check_suite_id",
      "description": "Returns workflow runs with the `check_suite_id` that you specify.",
      "in": "query",
      "schema": {
        "type": "integer",
        "format": "int64"
      }
    },
    {
      "name": "head_sha",
      "description": "Only returns workflow runs that are associated with the specified `head_sha`.",
      "in": "query",
      "required": false,
      "schema": {
        "type": "string"
      }
    }
  ],
  "dependencies": [
    "rest.repos.list-for-org"
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
        "support": "documented",
        "source": "047f030efe47b8a5",
        "empirical": "not-tested"
      },
      "classicPat": {
        "support": "documented-with-conditions",
        "requirements": [
          "OAuth app tokens and personal access tokens (classic) need the `repo` scope to use this endpoint with a private repository."
        ],
        "empirical": "not-tested"
      }
    },
    "permissionExpression": {
      "anyOf": [
        {
          "allOf": [
            {
              "permission": "Repository permissions for \"Actions\"",
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
      "For more information about using parameters, see [Parameters](https://docs.github.com/enterprise-cloud@latest/rest/guides/getting-started-with-the-rest-api#parameters).",
      "Anyone with read access to the repository can use this endpoint."
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
    "recordType": "rest.actions.list-workflow-runs-for-repo",
    "recordRoot": "$.workflow_runs[]",
    "fields": [
      {
        "output": "id",
        "source": "$.workflow_runs[].id",
        "sourceType": "integer",
        "type": "integer",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The ID of the workflow run."
      },
      {
        "output": "name",
        "source": "$.workflow_runs[].name",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The name of the workflow run."
      },
      {
        "output": "node_id",
        "source": "$.workflow_runs[].node_id",
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
        "output": "run_number",
        "source": "$.workflow_runs[].run_number",
        "sourceType": "integer",
        "type": "integer",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The auto incrementing run number for the workflow run."
      },
      {
        "output": "run_attempt",
        "source": "$.workflow_runs[].run_attempt",
        "sourceType": "integer",
        "type": "integer",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Attempt number of the run, 1 for first attempt and higher if the workflow was re-run."
      },
      {
        "output": "event",
        "source": "$.workflow_runs[].event",
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
        "output": "status",
        "source": "$.workflow_runs[].status",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "conclusion",
        "source": "$.workflow_runs[].conclusion",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "workflow_id",
        "source": "$.workflow_runs[].workflow_id",
        "sourceType": "integer",
        "type": "integer",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The ID of the parent workflow."
      },
      {
        "output": "created_at",
        "source": "$.workflow_runs[].created_at",
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
        "source": "$.workflow_runs[].updated_at",
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
      "node_id",
      "run_number",
      "run_attempt",
      "event",
      "status",
      "conclusion",
      "workflow_id",
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
    "mode": "link",
    "parameters": [
      {
        "name": "actor",
        "description": "Returns someone's workflow runs. Use the login for the user who created the `push` associated with the check suite or workflow run.",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        }
      },
      {
        "name": "branch",
        "description": "Returns workflow runs associated with a branch. Use the name of the branch of the `push`.",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        }
      },
      {
        "name": "event",
        "description": "Returns workflow run triggered by the event you specify. For example, `push`, `pull_request` or `issue`. For more information, see \"[Events that trigger workflows](https://docs.github.com/enterprise-cloud@latest/actions/automating-your-workflow-with-github-actions/events-that-trigger-workflows).\"",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        }
      },
      {
        "name": "status",
        "description": "Returns workflow runs with the check run `status` or `conclusion` that you specify. For example, a conclusion can be `success` or a status can be `in_progress`. Only GitHub Actions can set a status of `waiting`, `pending`, or `requested`.",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "completed",
            "action_required",
            "cancelled",
            "failure",
            "neutral",
            "skipped",
            "stale",
            "success",
            "timed_out",
            "in_progress",
            "queued",
            "requested",
            "waiting",
            "pending"
          ]
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
        "name": "created",
        "description": "Returns workflow runs created within the given date-time range. For more information on the syntax, see \"[Understanding the search syntax](https://docs.github.com/enterprise-cloud@latest/search-github/getting-started-with-searching-on-github/understanding-the-search-syntax#query-for-dates).\"",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "format": "date-time"
        }
      },
      {
        "name": "exclude_pull_requests",
        "description": "If `true` pull requests are omitted from the response (empty array).",
        "in": "query",
        "required": false,
        "schema": {
          "type": "boolean",
          "default": false
        }
      },
      {
        "name": "check_suite_id",
        "description": "Returns workflow runs with the `check_suite_id` that you specify.",
        "in": "query",
        "schema": {
          "type": "integer",
          "format": "int64"
        }
      },
      {
        "name": "head_sha",
        "description": "Only returns workflow runs that are associated with the specified `head_sha`.",
        "in": "query",
        "required": false,
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
      "owner",
      "repo"
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
    "Only GET /repos/{owner}/{repo}/actions/runs at 2026-03-10 and reviewed dependencies can be requested.",
    "Normalize only the 11 declared output fields; exact source types and missing/null states are preserved.",
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
