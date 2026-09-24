# rest.apps.list-repos-accessible-to-installation: List repositories accessible to the app installation

Generated deterministically from the pinned research inputs and reviewed design policy. Status: specified, not implemented. Common requirements in [execution profile](../../../research/github/common-profile.json) are normative for this collector.

Official endpoint: [List repositories accessible to the app installation](https://docs.github.com/enterprise-cloud@latest/rest/apps/installations#list-repositories-accessible-to-the-app-installation). API version `2026-03-10`.

## Identity and selection

```json
{
  "id": "rest.apps.list-repos-accessible-to-installation",
  "module": "integrations",
  "scope": "platform-or-caller-resource",
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
    "rest.apps.list-repos-accessible-to-installation"
  ],
  "inputs": [],
  "queryParameters": [
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
      "List repositories that an app installation can access."
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
    "recordType": "rest.apps.list-repos-accessible-to-installation",
    "recordRoot": "$.repositories[]",
    "fields": [
      {
        "output": "id",
        "source": "$.repositories[].id",
        "sourceType": "integer",
        "type": "integer",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Unique identifier of the repository"
      },
      {
        "output": "node_id",
        "source": "$.repositories[].node_id",
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
        "source": "$.repositories[].name",
        "sourceType": "string",
        "type": "string",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The name of the repository."
      },
      {
        "output": "permissions_admin",
        "source": "$.repositories[].permissions.admin",
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
        "output": "permissions_pull",
        "source": "$.repositories[].permissions.pull",
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
        "output": "permissions_triage",
        "source": "$.repositories[].permissions.triage",
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
        "source": "$.repositories[].permissions.push",
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
        "output": "permissions_maintain",
        "source": "$.repositories[].permissions.maintain",
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
        "output": "private",
        "source": "$.repositories[].private",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether the repository is private or public."
      },
      {
        "output": "fork",
        "source": "$.repositories[].fork",
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
        "source": "$.repositories[].size",
        "sourceType": "integer",
        "type": "integer",
        "nullable": false,
        "unit": "source-unit-unverified",
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The size of the repository, in kilobytes. Size is calculated hourly. When a repository is initially created, the size is 0."
      },
      {
        "output": "default_branch",
        "source": "$.repositories[].default_branch",
        "sourceType": "string",
        "type": "string",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The default branch of the repository."
      },
      {
        "output": "is_template",
        "source": "$.repositories[].is_template",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether this repository acts as a template that can be used to generate new repositories."
      },
      {
        "output": "has_issues",
        "source": "$.repositories[].has_issues",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether issues are enabled."
      },
      {
        "output": "has_projects",
        "source": "$.repositories[].has_projects",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether projects are enabled."
      },
      {
        "output": "has_wiki",
        "source": "$.repositories[].has_wiki",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether the wiki is enabled."
      },
      {
        "output": "has_pages",
        "source": "$.repositories[].has_pages",
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
        "output": "has_discussions",
        "source": "$.repositories[].has_discussions",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether discussions are enabled."
      },
      {
        "output": "has_pull_requests",
        "source": "$.repositories[].has_pull_requests",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether pull requests are enabled."
      },
      {
        "output": "pull_request_creation_policy",
        "source": "$.repositories[].pull_request_creation_policy",
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
        "source": "$.repositories[].archived",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether the repository is archived."
      },
      {
        "output": "disabled",
        "source": "$.repositories[].disabled",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Returns whether or not this repository disabled."
      },
      {
        "output": "visibility",
        "source": "$.repositories[].visibility",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The repository visibility: public, private, or internal."
      },
      {
        "output": "pushed_at",
        "source": "$.repositories[].pushed_at",
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
        "source": "$.repositories[].created_at",
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
        "source": "$.repositories[].updated_at",
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
        "output": "allow_rebase_merge",
        "source": "$.repositories[].allow_rebase_merge",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether to allow rebase merges for pull requests."
      },
      {
        "output": "allow_squash_merge",
        "source": "$.repositories[].allow_squash_merge",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether to allow squash merges for pull requests."
      },
      {
        "output": "allow_auto_merge",
        "source": "$.repositories[].allow_auto_merge",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether to allow Auto-merge to be used on pull requests."
      },
      {
        "output": "delete_branch_on_merge",
        "source": "$.repositories[].delete_branch_on_merge",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether to delete head branches when pull requests are merged"
      },
      {
        "output": "allow_update_branch",
        "source": "$.repositories[].allow_update_branch",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether or not a pull request head branch that is behind its base branch can always be updated even if it is not required to be up to date before merging."
      },
      {
        "output": "squash_merge_commit_title",
        "source": "$.repositories[].squash_merge_commit_title",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "PR_TITLE",
          "COMMIT_OR_PR_TITLE"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The default value for a squash merge commit title:\n\n- `PR_TITLE` - default to the pull request's title.\n- `COMMIT_OR_PR_TITLE` - default to the commit's title (if only one commit) or the pull request's title (when more than one commit)."
      },
      {
        "output": "squash_merge_commit_message",
        "source": "$.repositories[].squash_merge_commit_message",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "PR_BODY",
          "COMMIT_MESSAGES",
          "BLANK"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The default value for a squash merge commit message:\n\n- `PR_BODY` - default to the pull request's body.\n- `COMMIT_MESSAGES` - default to the branch's commit messages.\n- `BLANK` - default to a blank commit message."
      },
      {
        "output": "merge_commit_title",
        "source": "$.repositories[].merge_commit_title",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "PR_TITLE",
          "MERGE_MESSAGE"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The default value for a merge commit title.\n\n- `PR_TITLE` - default to the pull request's title.\n- `MERGE_MESSAGE` - default to the classic title for a merge message (e.g., Merge pull request #123 from branch-name)."
      },
      {
        "output": "merge_commit_message",
        "source": "$.repositories[].merge_commit_message",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "PR_BODY",
          "PR_TITLE",
          "BLANK"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The default value for a merge commit message.\n\n- `PR_TITLE` - default to the pull request's title.\n- `PR_BODY` - default to the pull request's body.\n- `BLANK` - default to a blank commit message."
      },
      {
        "output": "allow_merge_commit",
        "source": "$.repositories[].allow_merge_commit",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether to allow merge commits for pull requests."
      },
      {
        "output": "allow_forking",
        "source": "$.repositories[].allow_forking",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether to allow forking this repo"
      },
      {
        "output": "web_commit_signoff_required",
        "source": "$.repositories[].web_commit_signoff_required",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether to require contributors to sign off on web-based commits"
      },
      {
        "output": "anonymous_access_enabled",
        "source": "$.repositories[].anonymous_access_enabled",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether anonymous git access is enabled for this repository"
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
      "permissions_admin",
      "permissions_pull",
      "permissions_triage",
      "permissions_push",
      "permissions_maintain",
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
      "allow_rebase_merge",
      "allow_squash_merge",
      "allow_auto_merge",
      "delete_branch_on_merge",
      "allow_update_branch",
      "squash_merge_commit_title",
      "squash_merge_commit_message",
      "merge_commit_title",
      "merge_commit_message",
      "allow_merge_commit",
      "allow_forking",
      "web_commit_signoff_required",
      "anonymous_access_enabled"
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
    "fanoutKeys": [],
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
      "403",
      "304",
      "401"
    ],
    "policy": "common-profile.json#/http"
  },
  "acceptanceCriteria": [
    "Only GET /installation/repositories at 2026-03-10 and reviewed dependencies can be requested.",
    "Normalize only the 39 declared output fields; exact source types and missing/null states are preserved.",
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
