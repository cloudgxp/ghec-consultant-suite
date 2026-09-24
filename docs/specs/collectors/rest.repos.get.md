# rest.repos.get: Get a repository

Generated deterministically from the pinned research inputs and reviewed design policy. Status: specified, not implemented. Common requirements in [execution profile](../../../research/github/common-profile.json) are normative for this collector.

Official endpoint: [Get a repository](https://docs.github.com/enterprise-cloud@latest/rest/repos/repos#get-a-repository). API version `2026-03-10`.

## Identity and selection

```json
{
  "id": "rest.repos.get",
  "module": "repos",
  "scope": "repository",
  "priority": "P0",
  "phase": "C1",
  "researchStatus": "documented-with-gaps",
  "selection": "default",
  "executable": false
}
```

## Operations, inputs and discovery

```json
{
  "operations": [
    "rest.repos.get"
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
    "roleAndPlanEvidence": [
      "> [!NOTE]\n> - In order to see the `security_and_analysis` block for a repository you must have admin permissions for the repository or be an owner or security manager for the organization that owns the repository.",
      "For more information, see \"[Managing security managers in your organization](https://docs.github.com/enterprise-cloud@latest/organizations/managing-peoples-access-to-your-organization-with-roles/managing-security-managers-in-your-organization).\"\n> - To view merge-related settings, you must have the `contents:read` and `contents:write` permissions."
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
    "recordType": "rest.repos.get",
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
        "description": ""
      },
      {
        "output": "node_id",
        "source": "$.node_id",
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
        "source": "$.name",
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
        "source": "$.private",
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
        "source": "$.fork",
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
        "source": "$.size",
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
        "source": "$.default_branch",
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
        "output": "is_template",
        "source": "$.is_template",
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
        "source": "$.has_issues",
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
        "output": "has_projects",
        "source": "$.has_projects",
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
        "output": "has_wiki",
        "source": "$.has_wiki",
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
        "output": "has_pages",
        "source": "$.has_pages",
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
        "source": "$.has_discussions",
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
        "output": "has_pull_requests",
        "source": "$.has_pull_requests",
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
        "source": "$.pull_request_creation_policy",
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
        "source": "$.archived",
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
        "output": "disabled",
        "source": "$.disabled",
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
        "source": "$.visibility",
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
        "source": "$.pushed_at",
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
        "output": "permissions_admin",
        "source": "$.permissions.admin",
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
        "source": "$.permissions.maintain",
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
        "source": "$.permissions.push",
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
        "source": "$.permissions.triage",
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
        "source": "$.permissions.pull",
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
        "output": "allow_rebase_merge",
        "source": "$.allow_rebase_merge",
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
        "output": "allow_squash_merge",
        "source": "$.allow_squash_merge",
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
        "output": "allow_auto_merge",
        "source": "$.allow_auto_merge",
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
        "output": "delete_branch_on_merge",
        "source": "$.delete_branch_on_merge",
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
        "output": "allow_merge_commit",
        "source": "$.allow_merge_commit",
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
        "output": "allow_update_branch",
        "source": "$.allow_update_branch",
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
        "output": "squash_merge_commit_title",
        "source": "$.squash_merge_commit_title",
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
        "source": "$.squash_merge_commit_message",
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
        "source": "$.merge_commit_title",
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
        "description": "The default value for a merge commit title.\n\n  - `PR_TITLE` - default to the pull request's title.\n  - `MERGE_MESSAGE` - default to the classic title for a merge message (e.g., Merge pull request #123 from branch-name)."
      },
      {
        "output": "merge_commit_message",
        "source": "$.merge_commit_message",
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
        "output": "allow_forking",
        "source": "$.allow_forking",
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
        "source": "$.web_commit_signoff_required",
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
        "output": "parent_id",
        "source": "$.parent.id",
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
        "output": "parent_node_id",
        "source": "$.parent.node_id",
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
        "output": "parent_name",
        "source": "$.parent.name",
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
        "output": "parent_license_name",
        "source": "$.parent.license.name",
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
        "output": "parent_license_node_id",
        "source": "$.parent.license.node_id",
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
        "output": "parent_permissions_admin",
        "source": "$.parent.permissions.admin",
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
        "output": "parent_permissions_pull",
        "source": "$.parent.permissions.pull",
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
        "output": "parent_permissions_triage",
        "source": "$.parent.permissions.triage",
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
        "output": "parent_permissions_push",
        "source": "$.parent.permissions.push",
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
        "output": "parent_permissions_maintain",
        "source": "$.parent.permissions.maintain",
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
        "output": "parent_owner_name",
        "source": "$.parent.owner.name",
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
        "output": "parent_owner_id",
        "source": "$.parent.owner.id",
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
        "output": "parent_owner_node_id",
        "source": "$.parent.owner.node_id",
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
        "output": "parent_owner_type",
        "source": "$.parent.owner.type",
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
        "output": "parent_owner_site_admin",
        "source": "$.parent.owner.site_admin",
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
        "output": "parent_private",
        "source": "$.parent.private",
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
        "output": "parent_fork",
        "source": "$.parent.fork",
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
        "output": "parent_size",
        "source": "$.parent.size",
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
        "output": "parent_default_branch",
        "source": "$.parent.default_branch",
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
        "output": "parent_is_template",
        "source": "$.parent.is_template",
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
        "output": "parent_has_issues",
        "source": "$.parent.has_issues",
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
        "output": "parent_has_projects",
        "source": "$.parent.has_projects",
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
        "output": "parent_has_wiki",
        "source": "$.parent.has_wiki",
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
        "output": "parent_has_pages",
        "source": "$.parent.has_pages",
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
        "output": "parent_has_discussions",
        "source": "$.parent.has_discussions",
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
        "output": "parent_has_pull_requests",
        "source": "$.parent.has_pull_requests",
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
        "output": "parent_pull_request_creation_policy",
        "source": "$.parent.pull_request_creation_policy",
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
        "output": "parent_archived",
        "source": "$.parent.archived",
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
        "output": "parent_disabled",
        "source": "$.parent.disabled",
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
        "output": "parent_visibility",
        "source": "$.parent.visibility",
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
        "output": "parent_pushed_at",
        "source": "$.parent.pushed_at",
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
        "output": "parent_created_at",
        "source": "$.parent.created_at",
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
        "output": "parent_updated_at",
        "source": "$.parent.updated_at",
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
        "output": "parent_allow_rebase_merge",
        "source": "$.parent.allow_rebase_merge",
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
        "output": "parent_allow_squash_merge",
        "source": "$.parent.allow_squash_merge",
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
        "output": "parent_allow_auto_merge",
        "source": "$.parent.allow_auto_merge",
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
        "output": "parent_delete_branch_on_merge",
        "source": "$.parent.delete_branch_on_merge",
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
        "output": "parent_allow_update_branch",
        "source": "$.parent.allow_update_branch",
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
        "output": "parent_squash_merge_commit_title",
        "source": "$.parent.squash_merge_commit_title",
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
        "output": "parent_squash_merge_commit_message",
        "source": "$.parent.squash_merge_commit_message",
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
        "output": "parent_merge_commit_title",
        "source": "$.parent.merge_commit_title",
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
        "output": "parent_merge_commit_message",
        "source": "$.parent.merge_commit_message",
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
        "output": "parent_allow_merge_commit",
        "source": "$.parent.allow_merge_commit",
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
        "output": "parent_allow_forking",
        "source": "$.parent.allow_forking",
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
        "output": "parent_web_commit_signoff_required",
        "source": "$.parent.web_commit_signoff_required",
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
        "output": "parent_anonymous_access_enabled",
        "source": "$.parent.anonymous_access_enabled",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether anonymous git access is enabled for this repository"
      },
      {
        "output": "parent_code_search_index_status_lexical_search_ok",
        "source": "$.parent.code_search_index_status.lexical_search_ok",
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
        "output": "anonymous_access_enabled",
        "source": "$.anonymous_access_enabled",
        "sourceType": "boolean",
        "type": "boolean",
        "nullable": true,
        "unit": null,
        "enum": null,
        "transform": "copy",
        "missing": "null with fieldAvailability=unknown; never synthesize false or zero",
        "sensitivity": "confidential-metadata",
        "description": "Whether anonymous git access is allowed."
      },
      {
        "output": "security_and_analysis_advanced_security_status",
        "source": "$.security_and_analysis.advanced_security.status",
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
        "source": "$.security_and_analysis.code_security.status",
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
        "source": "$.security_and_analysis.dependabot_security_updates.status",
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
        "source": "$.security_and_analysis.secret_scanning.status",
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
        "source": "$.security_and_analysis.secret_scanning_push_protection.status",
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
        "source": "$.security_and_analysis.secret_scanning_non_provider_patterns.status",
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
        "source": "$.security_and_analysis.secret_scanning_ai_detection.status",
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
        "source": "$.security_and_analysis.secret_scanning_validity_checks.status",
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
        "source": "$.security_and_analysis.secret_scanning_delegated_alert_dismissal.status",
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
        "source": "$.security_and_analysis.secret_scanning_delegated_bypass.status",
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
      "allow_rebase_merge",
      "allow_squash_merge",
      "allow_auto_merge",
      "delete_branch_on_merge",
      "allow_merge_commit",
      "allow_update_branch",
      "squash_merge_commit_title",
      "squash_merge_commit_message",
      "merge_commit_title",
      "merge_commit_message",
      "allow_forking",
      "web_commit_signoff_required",
      "parent_id",
      "parent_node_id",
      "parent_name",
      "parent_license_name",
      "parent_license_node_id",
      "parent_permissions_admin",
      "parent_permissions_pull",
      "parent_permissions_triage",
      "parent_permissions_push",
      "parent_permissions_maintain",
      "parent_owner_name",
      "parent_owner_id",
      "parent_owner_node_id",
      "parent_owner_type",
      "parent_owner_site_admin",
      "parent_private",
      "parent_fork",
      "parent_size",
      "parent_default_branch",
      "parent_is_template",
      "parent_has_issues",
      "parent_has_projects",
      "parent_has_wiki",
      "parent_has_pages",
      "parent_has_discussions",
      "parent_has_pull_requests",
      "parent_pull_request_creation_policy",
      "parent_archived",
      "parent_disabled",
      "parent_visibility",
      "parent_pushed_at",
      "parent_created_at",
      "parent_updated_at",
      "parent_allow_rebase_merge",
      "parent_allow_squash_merge",
      "parent_allow_auto_merge",
      "parent_delete_branch_on_merge",
      "parent_allow_update_branch",
      "parent_squash_merge_commit_title",
      "parent_squash_merge_commit_message",
      "parent_merge_commit_title",
      "parent_merge_commit_message",
      "parent_allow_merge_commit",
      "parent_allow_forking",
      "parent_web_commit_signoff_required",
      "parent_anonymous_access_enabled",
      "parent_code_search_index_status_lexical_search_ok",
      "anonymous_access_enabled",
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
      "403",
      "404",
      "301"
    ],
    "policy": "common-profile.json#/http"
  },
  "acceptanceCriteria": [
    "Only GET /repos/{owner}/{repo} at 2026-03-10 and reviewed dependencies can be requested.",
    "Normalize only the 96 declared output fields; exact source types and missing/null states are preserved.",
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
