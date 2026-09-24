# rest.repos.list-forks: List forks

Generated deterministically from the pinned research inputs and reviewed design policy. Status: specified, not implemented. Common requirements in [execution profile](../../../research/github/common-profile.json) are normative for this collector.

Official endpoint: [List forks](https://docs.github.com/enterprise-cloud@latest/rest/repos/forks#list-forks). API version `2026-03-10`.

## Identity and selection

```json
{
  "id": "rest.repos.list-forks",
  "module": "repos",
  "scope": "repository",
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
    "rest.repos.list-forks"
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
      "name": "sort",
      "description": "The sort order. `stargazers` will sort by star count.",
      "in": "query",
      "required": false,
      "schema": {
        "type": "string",
        "enum": [
          "newest",
          "oldest",
          "stargazers",
          "watchers"
        ],
        "default": "newest"
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
              "permission": "Repository permissions for \"Metadata\"",
              "access": "read"
            }
          ]
        }
      ]
    },
    "additionalPermissionsRequireEndpointReview": false,
    "endpointRequirements": "",
    "documentSource": null,
    "roleAndPlanEvidence": [],
    "constraints": "Fine-grained PAT owner/repository selection and approval; installation repository selection; user token limited by both user and app grants; classic PAT SSO authorization where enforced; token scopes do not grant account roles. Enterprise access is separately verified.",
    "unresolved": [
      "Verify any undocumented token model, classic scope minimum, role, plan and SSO condition against this exact endpoint section before enabling that auth profile; do not broaden grants."
    ]
  },
  "runtimeBlockers": [
    "Live implementation intentionally absent",
    "Contract 2.0.0 reader/writer and privacy release review pending",
    "Synthetic least-privilege verification not performed",
    "Verify any undocumented token model, classic scope minimum, role, plan and SSO condition against this exact endpoint section before enabling that auth profile; do not broaden grants.",
    "Source size unit/meaning not sufficiently verified; preserve source measurement with unverified unit and do not map to v1 bytes or LFS."
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
    "recordType": "rest.repos.list-forks",
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
        "description": ""
      },
      {
        "output": "node_id",
        "source": "$[].node_id",
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
        "output": "name",
        "source": "$[].name",
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
        "output": "private",
        "source": "$[].private",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "fork",
        "source": "$[].fork",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "size",
        "source": "$[].size",
        "sourceType": "integer",
        "type": "integer",
        "nullable": true,
        "unit": "source-unit-unverified",
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The size of the repository, in kilobytes. Size is calculated hourly. When a repository is initially created, the size is 0."
      },
      {
        "output": "default_branch",
        "source": "$[].default_branch",
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
        "output": "is_template",
        "source": "$[].is_template",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "has_issues",
        "source": "$[].has_issues",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "has_projects",
        "source": "$[].has_projects",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "has_wiki",
        "source": "$[].has_wiki",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "has_pages",
        "source": "$[].has_pages",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "has_discussions",
        "source": "$[].has_discussions",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "has_pull_requests",
        "source": "$[].has_pull_requests",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "pull_request_creation_policy",
        "source": "$[].pull_request_creation_policy",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "all",
          "collaborators_only"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The policy controlling who can create pull requests: all or collaborators_only."
      },
      {
        "output": "archived",
        "source": "$[].archived",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "disabled",
        "source": "$[].disabled",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "visibility",
        "source": "$[].visibility",
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
        "output": "pushed_at",
        "source": "$[].pushed_at",
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
        "output": "created_at",
        "source": "$[].created_at",
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
        "output": "updated_at",
        "source": "$[].updated_at",
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
        "output": "permissions_admin",
        "source": "$[].permissions.admin",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "permissions_maintain",
        "source": "$[].permissions.maintain",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "permissions_push",
        "source": "$[].permissions.push",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "permissions_triage",
        "source": "$[].permissions.triage",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "permissions_pull",
        "source": "$[].permissions.pull",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "role_name",
        "source": "$[].role_name",
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
        "output": "delete_branch_on_merge",
        "source": "$[].delete_branch_on_merge",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "allow_forking",
        "source": "$[].allow_forking",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "web_commit_signoff_required",
        "source": "$[].web_commit_signoff_required",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "security_and_analysis_advanced_security_status",
        "source": "$[].security_and_analysis.advanced_security.status",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "security_and_analysis_code_security_status",
        "source": "$[].security_and_analysis.code_security.status",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "security_and_analysis_dependabot_security_updates_status",
        "source": "$[].security_and_analysis.dependabot_security_updates.status",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enablement status of Dependabot security updates for the repository."
      },
      {
        "output": "security_and_analysis_secret_scanning_status",
        "source": "$[].security_and_analysis.secret_scanning.status",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "security_and_analysis_secret_scanning_push_protection_status",
        "source": "$[].security_and_analysis.secret_scanning_push_protection.status",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "security_and_analysis_secret_scanning_non_provider_patterns_status",
        "source": "$[].security_and_analysis.secret_scanning_non_provider_patterns.status",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "security_and_analysis_secret_scanning_ai_detection_status",
        "source": "$[].security_and_analysis.secret_scanning_ai_detection.status",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "security_and_analysis_secret_scanning_validity_checks_status",
        "source": "$[].security_and_analysis.secret_scanning_validity_checks.status",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "security_and_analysis_secret_scanning_delegated_alert_dismissal_status",
        "source": "$[].security_and_analysis.secret_scanning_delegated_alert_dismissal.status",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": ""
      },
      {
        "output": "security_and_analysis_secret_scanning_delegated_bypass_status",
        "source": "$[].security_and_analysis.secret_scanning_delegated_bypass.status",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled"
        ],
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
      "node_id",
      "name",
      "private",
      "fork",
      "size",
      "default_branch",
      "is_template",
      "has_issues",
      "has_projects",
      "has_wiki",
      "has_pages",
      "has_discussions",
      "has_pull_requests",
      "pull_request_creation_policy",
      "archived",
      "disabled",
      "visibility",
      "pushed_at",
      "created_at",
      "updated_at",
      "permissions_admin",
      "permissions_maintain",
      "permissions_push",
      "permissions_triage",
      "permissions_pull",
      "role_name",
      "delete_branch_on_merge",
      "allow_forking",
      "web_commit_signoff_required",
      "security_and_analysis_advanced_security_status",
      "security_and_analysis_code_security_status",
      "security_and_analysis_dependabot_security_updates_status",
      "security_and_analysis_secret_scanning_status",
      "security_and_analysis_secret_scanning_push_protection_status",
      "security_and_analysis_secret_scanning_non_provider_patterns_status",
      "security_and_analysis_secret_scanning_ai_detection_status",
      "security_and_analysis_secret_scanning_validity_checks_status",
      "security_and_analysis_secret_scanning_delegated_alert_dismissal_status",
      "security_and_analysis_secret_scanning_delegated_bypass_status"
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
        "name": "sort",
        "description": "The sort order. `stargazers` will sort by star count.",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "newest",
            "oldest",
            "stargazers",
            "watchers"
          ],
          "default": "newest"
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
    "Source size unit/meaning not sufficiently verified; preserve source measurement with unverified unit and do not map to v1 bytes or LFS.",
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
      "400"
    ],
    "policy": "common-profile.json#/http"
  },
  "acceptanceCriteria": [
    "Only GET /repos/{owner}/{repo}/forks at 2026-03-10 and reviewed dependencies can be requested.",
    "Normalize only the 40 declared output fields; exact source types and missing/null states are preserved.",
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
