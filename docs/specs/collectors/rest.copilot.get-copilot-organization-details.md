# rest.copilot.get-copilot-organization-details: Get Copilot seat information and settings for an organization

Generated deterministically from the pinned research inputs and reviewed design policy. Status: specified, not implemented. Common requirements in [execution profile](../../../research/github/common-profile.json) are normative for this collector.

Official endpoint: [Get Copilot seat information and settings for an organization](https://docs.github.com/enterprise-cloud@latest/rest/copilot/copilot-user-management#get-copilot-seat-information-and-settings-for-an-organization). API version `2026-03-10`.

## Identity and selection

```json
{
  "id": "rest.copilot.get-copilot-organization-details",
  "module": "billing",
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
    "rest.copilot.get-copilot-organization-details"
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
    "documentationStatus": "unresolved",
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
          "OAuth app tokens and personal access tokens (classic) need either the `manage_billing:copilot` or `read:org` scopes to use this endpoint."
        ],
        "empirical": "not-tested"
      }
    },
    "permissionExpression": null,
    "additionalPermissionsRequireEndpointReview": true,
    "endpointRequirements": "",
    "documentSource": null,
    "roleAndPlanEvidence": [
      "For more information, see \"[Managing policies for Copilot in your organization](https://docs.github.com/enterprise-cloud@latest/copilot/managing-copilot/managing-policies-for-copilot-business-in-your-organization).\"\n\nOnly organization owners can view details about the organization's Copilot Business or Copilot Enterprise subscription."
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
    "recordType": "rest.copilot.get-copilot-organization-details",
    "recordRoot": "$",
    "fields": [
      {
        "output": "seat_breakdown_total",
        "source": "$.seat_breakdown.total",
        "sourceType": "integer",
        "type": "integer",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The total number of seats being billed for the organization as of the current billing cycle."
      },
      {
        "output": "seat_breakdown_pending_cancellation",
        "source": "$.seat_breakdown.pending_cancellation",
        "sourceType": "integer",
        "type": "integer",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The number of seats that are pending cancellation at the end of the current billing cycle."
      },
      {
        "output": "seat_breakdown_pending_invitation",
        "source": "$.seat_breakdown.pending_invitation",
        "sourceType": "integer",
        "type": "integer",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The number of users who have been invited to receive a Copilot seat through this organization."
      },
      {
        "output": "seat_breakdown_active_this_cycle",
        "source": "$.seat_breakdown.active_this_cycle",
        "sourceType": "integer",
        "type": "integer",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The number of seats that have used Copilot during the current billing cycle."
      },
      {
        "output": "seat_breakdown_inactive_this_cycle",
        "source": "$.seat_breakdown.inactive_this_cycle",
        "sourceType": "integer",
        "type": "integer",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The number of seats that have not used Copilot during the current billing cycle."
      },
      {
        "output": "public_code_suggestions",
        "source": "$.public_code_suggestions",
        "sourceType": "string",
        "type": "string",
        "nullable": false,
        "unit": null,
        "enum": [
          "allow",
          "block",
          "unconfigured"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The organization policy for allowing or blocking suggestions matching public code (duplication detection filter)."
      },
      {
        "output": "ide_chat",
        "source": "$.ide_chat",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "unconfigured"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The organization policy for allowing or disallowing Copilot Chat in the IDE."
      },
      {
        "output": "platform_chat",
        "source": "$.platform_chat",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "unconfigured"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The organization policy for allowing or disallowing Copilot features on GitHub.com."
      },
      {
        "output": "cli",
        "source": "$.cli",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "unconfigured"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The organization policy for allowing or disallowing Copilot CLI."
      },
      {
        "output": "seat_management_setting",
        "source": "$.seat_management_setting",
        "sourceType": "string",
        "type": "string",
        "nullable": false,
        "unit": null,
        "enum": [
          "assign_all",
          "assign_selected",
          "disabled",
          "unconfigured"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The mode of assigning new seats."
      },
      {
        "output": "plan_type",
        "source": "$.plan_type",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "business",
          "enterprise"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The Copilot plan of the organization, or the parent enterprise, when applicable."
      }
    ],
    "envelope": "common-profile.json#/outputEnvelope",
    "relationships": "scopeRef refers to enterprise/organization/repository/resource anchor. Immutable IDs are namespaced by product, resource type and parent; person IDs are run scoped pseudonyms. Detail inputs may remain ephemeral and are not automatically evidence fields."
  },
  "privacy": {
    "allowlist": [
      "seat_breakdown_total",
      "seat_breakdown_pending_cancellation",
      "seat_breakdown_pending_invitation",
      "seat_breakdown_active_this_cycle",
      "seat_breakdown_inactive_this_cycle",
      "public_code_suggestions",
      "ide_chat",
      "platform_chat",
      "cli",
      "seat_management_setting",
      "plan_type"
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
      "200",
      "500",
      "401",
      "403",
      "404",
      "422"
    ],
    "policy": "common-profile.json#/http"
  },
  "acceptanceCriteria": [
    "Only GET /orgs/{org}/copilot/billing at 2026-03-10 and reviewed dependencies can be requested.",
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
