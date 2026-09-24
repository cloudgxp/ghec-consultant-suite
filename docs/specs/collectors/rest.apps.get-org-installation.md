# rest.apps.get-org-installation: Get an organization installation for the authenticated app

Generated deterministically from the pinned research inputs and reviewed design policy. Status: specified, not implemented. Common requirements in [execution profile](../../../research/github/common-profile.json) are normative for this collector.

Official endpoint: [Get an organization installation for the authenticated app](https://docs.github.com/enterprise-cloud@latest/rest/apps/apps#get-an-organization-installation-for-the-authenticated-app). API version `2026-03-10`.

## Identity and selection

```json
{
  "id": "rest.apps.get-org-installation",
  "module": "integrations",
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
    "rest.apps.get-org-installation"
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
      "Enables an authenticated GitHub App to find the organization's installation information.",
      "You must use a [JWT](https://docs.github.com/enterprise-cloud@latest/apps/building-github-apps/authenticating-with-github-apps/#authenticating-as-a-github-app) to access this endpoint."
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
    "recordType": "rest.apps.get-org-installation",
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
        "description": "The ID of the installation."
      },
      {
        "output": "repository_selection",
        "source": "$.repository_selection",
        "sourceType": "string",
        "type": "string",
        "nullable": false,
        "unit": null,
        "enum": [
          "all",
          "selected"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Describe whether all repositories have been selected or there's a selection involved. For enterprise installations this is `selected`."
      },
      {
        "output": "app_id",
        "source": "$.app_id",
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
        "output": "target_id",
        "source": "$.target_id",
        "sourceType": "integer",
        "type": "integer",
        "nullable": false,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The ID of the user or organization this token is being scoped to."
      },
      {
        "output": "target_type",
        "source": "$.target_type",
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
        "output": "permissions_actions",
        "source": "$.permissions.actions",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for GitHub Actions workflows, workflow runs, and artifacts."
      },
      {
        "output": "permissions_administration",
        "source": "$.permissions.administration",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for repository creation, deletion, settings, teams, and collaborators creation."
      },
      {
        "output": "permissions_artifact_metadata",
        "source": "$.permissions.artifact_metadata",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to create and retrieve build artifact metadata records."
      },
      {
        "output": "permissions_attestations",
        "source": "$.permissions.attestations",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to create and retrieve the access token for repository attestations."
      },
      {
        "output": "permissions_checks",
        "source": "$.permissions.checks",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for checks on code."
      },
      {
        "output": "permissions_code_quality",
        "source": "$.permissions.code_quality",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to view and manage code quality data."
      },
      {
        "output": "permissions_codespaces",
        "source": "$.permissions.codespaces",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to create, edit, delete, and list Codespaces."
      },
      {
        "output": "permissions_contents",
        "source": "$.permissions.contents",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for repository contents, commits, branches, downloads, releases, and merges."
      },
      {
        "output": "permissions_dependabot_secrets",
        "source": "$.permissions.dependabot_secrets",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to manage Dependabot secrets."
      },
      {
        "output": "permissions_deployments",
        "source": "$.permissions.deployments",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for deployments and deployment statuses."
      },
      {
        "output": "permissions_discussions",
        "source": "$.permissions.discussions",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for discussions and related comments and labels."
      },
      {
        "output": "permissions_environments",
        "source": "$.permissions.environments",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for managing repository environments."
      },
      {
        "output": "permissions_issues",
        "source": "$.permissions.issues",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for issues and related comments, assignees, labels, and milestones."
      },
      {
        "output": "permissions_merge_queues",
        "source": "$.permissions.merge_queues",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to manage the merge queues for a repository."
      },
      {
        "output": "permissions_metadata",
        "source": "$.permissions.metadata",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to search repositories, list collaborators, and access repository metadata."
      },
      {
        "output": "permissions_packages",
        "source": "$.permissions.packages",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for packages published to GitHub Packages."
      },
      {
        "output": "permissions_pages",
        "source": "$.permissions.pages",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to retrieve Pages statuses, configuration, and builds, as well as create new builds."
      },
      {
        "output": "permissions_pull_requests",
        "source": "$.permissions.pull_requests",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for pull requests and related comments, assignees, labels, milestones, and merges."
      },
      {
        "output": "permissions_repository_custom_properties",
        "source": "$.permissions.repository_custom_properties",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to view and edit custom properties for a repository, when allowed by the property."
      },
      {
        "output": "permissions_repository_hooks",
        "source": "$.permissions.repository_hooks",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to manage the post-receive hooks for a repository."
      },
      {
        "output": "permissions_repository_projects",
        "source": "$.permissions.repository_projects",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write",
          "admin"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to manage repository projects, columns, and cards."
      },
      {
        "output": "permissions_secret_scanning_alerts",
        "source": "$.permissions.secret_scanning_alerts",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to view and manage secret scanning alerts."
      },
      {
        "output": "permissions_secrets",
        "source": "$.permissions.secrets",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to manage repository secrets."
      },
      {
        "output": "permissions_security_events",
        "source": "$.permissions.security_events",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to view and manage security events like code scanning alerts."
      },
      {
        "output": "permissions_single_file",
        "source": "$.permissions.single_file",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to manage just a single file."
      },
      {
        "output": "permissions_statuses",
        "source": "$.permissions.statuses",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for commit statuses."
      },
      {
        "output": "permissions_vulnerability_alerts",
        "source": "$.permissions.vulnerability_alerts",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to manage Dependabot alerts."
      },
      {
        "output": "permissions_workflows",
        "source": "$.permissions.workflows",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to update GitHub Actions workflow files."
      },
      {
        "output": "permissions_custom_properties_for_organizations",
        "source": "$.permissions.custom_properties_for_organizations",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to view and edit custom properties for an organization, when allowed by the property."
      },
      {
        "output": "permissions_members",
        "source": "$.permissions.members",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for organization teams and members."
      },
      {
        "output": "permissions_organization_administration",
        "source": "$.permissions.organization_administration",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to manage access to an organization."
      },
      {
        "output": "permissions_organization_custom_roles",
        "source": "$.permissions.organization_custom_roles",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for custom repository roles management."
      },
      {
        "output": "permissions_organization_custom_org_roles",
        "source": "$.permissions.organization_custom_org_roles",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for custom organization roles management."
      },
      {
        "output": "permissions_organization_custom_properties",
        "source": "$.permissions.organization_custom_properties",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write",
          "admin"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for repository custom properties management at the organization level."
      },
      {
        "output": "permissions_organization_copilot_seat_management",
        "source": "$.permissions.organization_copilot_seat_management",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for managing access to GitHub Copilot for members of an organization with a Copilot Business subscription. This property is in public preview and is subject to change."
      },
      {
        "output": "permissions_organization_copilot_agent_settings",
        "source": "$.permissions.organization_copilot_agent_settings",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to view and manage Copilot cloud agent settings for an organization."
      },
      {
        "output": "permissions_organization_announcement_banners",
        "source": "$.permissions.organization_announcement_banners",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to view and manage announcement banners for an organization."
      },
      {
        "output": "permissions_organization_events",
        "source": "$.permissions.organization_events",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to view events triggered by an activity in an organization."
      },
      {
        "output": "permissions_organization_hooks",
        "source": "$.permissions.organization_hooks",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to manage the post-receive hooks for an organization."
      },
      {
        "output": "permissions_organization_personal_access_tokens",
        "source": "$.permissions.organization_personal_access_tokens",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for viewing and managing fine-grained personal access token requests to an organization."
      },
      {
        "output": "permissions_organization_personal_access_token_requests",
        "source": "$.permissions.organization_personal_access_token_requests",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for viewing and managing fine-grained personal access tokens that have been approved by an organization."
      },
      {
        "output": "permissions_organization_plan",
        "source": "$.permissions.organization_plan",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for viewing an organization's plan."
      },
      {
        "output": "permissions_organization_projects",
        "source": "$.permissions.organization_projects",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write",
          "admin"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to manage organization projects and projects public preview (where available)."
      },
      {
        "output": "permissions_organization_packages",
        "source": "$.permissions.organization_packages",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for organization packages published to GitHub Packages."
      },
      {
        "output": "permissions_organization_secrets",
        "source": "$.permissions.organization_secrets",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to manage organization secrets."
      },
      {
        "output": "permissions_organization_self_hosted_runners",
        "source": "$.permissions.organization_self_hosted_runners",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to view and manage GitHub Actions self-hosted runners available to an organization."
      },
      {
        "output": "permissions_organization_user_blocking",
        "source": "$.permissions.organization_user_blocking",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to view and manage users blocked by the organization."
      },
      {
        "output": "permissions_email_addresses",
        "source": "$.permissions.email_addresses",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to manage the email addresses belonging to a user."
      },
      {
        "output": "permissions_followers",
        "source": "$.permissions.followers",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to manage the followers belonging to a user."
      },
      {
        "output": "permissions_git_ssh_keys",
        "source": "$.permissions.git_ssh_keys",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to manage git SSH keys."
      },
      {
        "output": "permissions_gpg_keys",
        "source": "$.permissions.gpg_keys",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to view and manage GPG keys belonging to a user."
      },
      {
        "output": "permissions_interaction_limits",
        "source": "$.permissions.interaction_limits",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to view and manage interaction limits on a repository."
      },
      {
        "output": "permissions_profile",
        "source": "$.permissions.profile",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to manage the profile settings belonging to a user."
      },
      {
        "output": "permissions_starring",
        "source": "$.permissions.starring",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to list and manage repositories a user is starring."
      },
      {
        "output": "permissions_enterprise_administration",
        "source": "$.permissions.enterprise_administration",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to administer an enterprise account."
      },
      {
        "output": "permissions_enterprise_custom_properties_for_organizations",
        "source": "$.permissions.enterprise_custom_properties_for_organizations",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write",
          "admin"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token for organization custom properties management at the enterprise level."
      },
      {
        "output": "permissions_enterprise_organization_installations",
        "source": "$.permissions.enterprise_organization_installations",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to manage installation of GitHub Apps on Enterprise-owned organizations."
      },
      {
        "output": "permissions_enterprise_organization_installation_repositories",
        "source": "$.permissions.enterprise_organization_installation_repositories",
        "sourceType": "string",
        "type": "string",
        "nullable": true,
        "unit": null,
        "enum": [
          "read",
          "write"
        ],
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "The level of permission to grant the access token to manage repository access of GitHub Apps on Enterprise-owned organizations."
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
      },
      {
        "output": "has_multiple_single_files",
        "source": "$.has_multiple_single_files",
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
        "output": "suspended_at",
        "source": "$.suspended_at",
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
      "id",
      "repository_selection",
      "app_id",
      "target_id",
      "target_type",
      "permissions_actions",
      "permissions_administration",
      "permissions_artifact_metadata",
      "permissions_attestations",
      "permissions_checks",
      "permissions_code_quality",
      "permissions_codespaces",
      "permissions_contents",
      "permissions_dependabot_secrets",
      "permissions_deployments",
      "permissions_discussions",
      "permissions_environments",
      "permissions_issues",
      "permissions_merge_queues",
      "permissions_metadata",
      "permissions_packages",
      "permissions_pages",
      "permissions_pull_requests",
      "permissions_repository_custom_properties",
      "permissions_repository_hooks",
      "permissions_repository_projects",
      "permissions_secret_scanning_alerts",
      "permissions_secrets",
      "permissions_security_events",
      "permissions_single_file",
      "permissions_statuses",
      "permissions_vulnerability_alerts",
      "permissions_workflows",
      "permissions_custom_properties_for_organizations",
      "permissions_members",
      "permissions_organization_administration",
      "permissions_organization_custom_roles",
      "permissions_organization_custom_org_roles",
      "permissions_organization_custom_properties",
      "permissions_organization_copilot_seat_management",
      "permissions_organization_copilot_agent_settings",
      "permissions_organization_announcement_banners",
      "permissions_organization_events",
      "permissions_organization_hooks",
      "permissions_organization_personal_access_tokens",
      "permissions_organization_personal_access_token_requests",
      "permissions_organization_plan",
      "permissions_organization_projects",
      "permissions_organization_packages",
      "permissions_organization_secrets",
      "permissions_organization_self_hosted_runners",
      "permissions_organization_user_blocking",
      "permissions_email_addresses",
      "permissions_followers",
      "permissions_git_ssh_keys",
      "permissions_gpg_keys",
      "permissions_interaction_limits",
      "permissions_profile",
      "permissions_starring",
      "permissions_enterprise_administration",
      "permissions_enterprise_custom_properties_for_organizations",
      "permissions_enterprise_organization_installations",
      "permissions_enterprise_organization_installation_repositories",
      "created_at",
      "updated_at",
      "has_multiple_single_files",
      "suspended_at"
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
      "200"
    ],
    "policy": "common-profile.json#/http"
  },
  "acceptanceCriteria": [
    "Only GET /orgs/{org}/installation at 2026-03-10 and reviewed dependencies can be requested.",
    "Normalize only the 67 declared output fields; exact source types and missing/null states are preserved.",
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
