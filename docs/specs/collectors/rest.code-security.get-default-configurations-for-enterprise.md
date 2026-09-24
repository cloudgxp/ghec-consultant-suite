# rest.code-security.get-default-configurations-for-enterprise: Get default code security configurations for an enterprise

Generated deterministically from the pinned research inputs and reviewed design policy. Status: specified, not implemented. Common requirements in [execution profile](../../../research/github/common-profile.json) are normative for this collector.

Official endpoint: [Get default code security configurations for an enterprise](https://docs.github.com/enterprise-cloud@latest/rest/code-security/configurations#get-default-code-security-configurations-for-an-enterprise). API version `2026-03-10`.

## Identity and selection

```json
{
  "id": "rest.code-security.get-default-configurations-for-enterprise",
  "module": "security",
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
    "rest.code-security.get-default-configurations-for-enterprise"
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
          "OAuth app tokens and personal access tokens (classic) need the `read:enterprise` scope to use this endpoint."
        ],
        "empirical": "not-tested"
      }
    },
    "permissionExpression": null,
    "additionalPermissionsRequireEndpointReview": false,
    "endpointRequirements": "",
    "documentSource": null,
    "roleAndPlanEvidence": [
      "Lists the default code security configurations for an enterprise.",
      "The authenticated user must be an administrator of the enterprise in order to use this endpoint.",
      "OAuth app tokens and personal access tokens (classic) need the `read:enterprise` scope to use this endpoint."
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
    "recordType": "rest.code-security.get-default-configurations-for-enterprise",
    "recordRoot": "$[]",
    "fields": [
      {
        "output": "configuration_id",
        "source": "$[].configuration.id",
        "sourceType": "integer",
        "type": "integer",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The ID of the code security configuration"
      },
      {
        "output": "configuration_name",
        "source": "$[].configuration.name",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The name of the code security configuration. Must be unique within the organization."
      },
      {
        "output": "configuration_target_type",
        "source": "$[].configuration.target_type",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "global",
          "organization",
          "enterprise"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The type of the code security configuration."
      },
      {
        "output": "configuration_advanced_security",
        "source": "$[].configuration.advanced_security",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "code_security",
          "secret_protection"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enablement status of GitHub Advanced Security"
      },
      {
        "output": "configuration_dependency_graph",
        "source": "$[].configuration.dependency_graph",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "not_set"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enablement status of Dependency Graph"
      },
      {
        "output": "configuration_dependency_graph_autosubmit_action",
        "source": "$[].configuration.dependency_graph_autosubmit_action",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "not_set"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enablement status of Automatic dependency submission"
      },
      {
        "output": "configuration_dependency_graph_autosubmit_action_options_labeled_runners",
        "source": "$[].configuration.dependency_graph_autosubmit_action_options.labeled_runners",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether to use runners labeled with 'dependency-submission' or standard GitHub runners."
      },
      {
        "output": "configuration_dependabot_alerts",
        "source": "$[].configuration.dependabot_alerts",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "not_set"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enablement status of Dependabot alerts"
      },
      {
        "output": "configuration_dependabot_security_updates",
        "source": "$[].configuration.dependabot_security_updates",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "not_set"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enablement status of Dependabot security updates"
      },
      {
        "output": "configuration_dependabot_delegated_alert_dismissal",
        "source": "$[].configuration.dependabot_delegated_alert_dismissal",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "not_set"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enablement status of Dependabot delegated alert dismissal"
      },
      {
        "output": "configuration_code_scanning_options_allow_advanced",
        "source": "$[].configuration.code_scanning_options.allow_advanced",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether to allow repos which use advanced setup"
      },
      {
        "output": "configuration_code_scanning_default_setup",
        "source": "$[].configuration.code_scanning_default_setup",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "not_set"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enablement status of code scanning default setup"
      },
      {
        "output": "configuration_code_scanning_default_setup_options_runner_type",
        "source": "$[].configuration.code_scanning_default_setup_options.runner_type",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "standard",
          "labeled",
          "not_set"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether to use labeled runners or standard GitHub runners."
      },
      {
        "output": "configuration_code_scanning_delegated_alert_dismissal",
        "source": "$[].configuration.code_scanning_delegated_alert_dismissal",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "not_set"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enablement status of code scanning delegated alert dismissal"
      },
      {
        "output": "configuration_secret_scanning",
        "source": "$[].configuration.secret_scanning",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "not_set"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enablement status of secret scanning"
      },
      {
        "output": "configuration_secret_scanning_push_protection",
        "source": "$[].configuration.secret_scanning_push_protection",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "not_set"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enablement status of secret scanning push protection"
      },
      {
        "output": "configuration_secret_scanning_delegated_bypass",
        "source": "$[].configuration.secret_scanning_delegated_bypass",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "not_set"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enablement status of secret scanning delegated bypass"
      },
      {
        "output": "configuration_secret_scanning_validity_checks",
        "source": "$[].configuration.secret_scanning_validity_checks",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "not_set"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enablement status of secret scanning validity checks"
      },
      {
        "output": "configuration_secret_scanning_non_provider_patterns",
        "source": "$[].configuration.secret_scanning_non_provider_patterns",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "not_set"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enablement status of secret scanning non-provider patterns"
      },
      {
        "output": "configuration_secret_scanning_generic_secrets",
        "source": "$[].configuration.secret_scanning_generic_secrets",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "not_set"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enablement status of Copilot secret scanning"
      },
      {
        "output": "configuration_secret_scanning_delegated_alert_dismissal",
        "source": "$[].configuration.secret_scanning_delegated_alert_dismissal",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "not_set"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enablement status of secret scanning delegated alert dismissal"
      },
      {
        "output": "configuration_secret_scanning_extended_metadata",
        "source": "$[].configuration.secret_scanning_extended_metadata",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "not_set"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enablement status of secret scanning extended metadata"
      },
      {
        "output": "configuration_private_vulnerability_reporting",
        "source": "$[].configuration.private_vulnerability_reporting",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enabled",
          "disabled",
          "not_set"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enablement status of private vulnerability reporting"
      },
      {
        "output": "configuration_enforcement",
        "source": "$[].configuration.enforcement",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "enforced",
          "unenforced",
          "enterprise_enforced"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The enforcement status for a security configuration"
      },
      {
        "output": "configuration_created_at",
        "source": "$[].configuration.created_at",
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
        "output": "configuration_updated_at",
        "source": "$[].configuration.updated_at",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
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
      "configuration_id",
      "configuration_name",
      "configuration_target_type",
      "configuration_advanced_security",
      "configuration_dependency_graph",
      "configuration_dependency_graph_autosubmit_action",
      "configuration_dependency_graph_autosubmit_action_options_labeled_runners",
      "configuration_dependabot_alerts",
      "configuration_dependabot_security_updates",
      "configuration_dependabot_delegated_alert_dismissal",
      "configuration_code_scanning_options_allow_advanced",
      "configuration_code_scanning_default_setup",
      "configuration_code_scanning_default_setup_options_runner_type",
      "configuration_code_scanning_delegated_alert_dismissal",
      "configuration_secret_scanning",
      "configuration_secret_scanning_push_protection",
      "configuration_secret_scanning_delegated_bypass",
      "configuration_secret_scanning_validity_checks",
      "configuration_secret_scanning_non_provider_patterns",
      "configuration_secret_scanning_generic_secrets",
      "configuration_secret_scanning_delegated_alert_dismissal",
      "configuration_secret_scanning_extended_metadata",
      "configuration_private_vulnerability_reporting",
      "configuration_enforcement",
      "configuration_created_at",
      "configuration_updated_at"
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
      "200"
    ],
    "policy": "common-profile.json#/http"
  },
  "acceptanceCriteria": [
    "Only GET /enterprises/{enterprise}/code-security/configurations/defaults at 2026-03-10 and reviewed dependencies can be requested.",
    "Normalize only the 26 declared output fields; exact source types and missing/null states are preserved.",
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
