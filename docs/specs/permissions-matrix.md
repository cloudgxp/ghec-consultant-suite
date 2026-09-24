# Permissions Matrix — Authoritative Verification Ledger

This document is the authoritative permission verification ledger for the GitHub Enterprise Cloud discovery CLI.

**Status: Documentation-Derived Permissions Recorded; Empirical Synthetic Verification Pending (`not-tested`).**

---

## 1. Authentication Models and Access Token Types

GitHub Enterprise Cloud supports multiple distinct token types. They must not be conflated, and higher-privileged tokens must not be requested when least-privilege tokens suffice:

```text
+-----------------------------------+-------------------------------------------------------------------------+
| Token Model                       | Scope & Boundary Limitations                                            |
+-----------------------------------+-------------------------------------------------------------------------+
| GitHub App Installation (IAT)     | Scoped to installed repositories within an organization. No user identity. |
| GitHub App User Access (UAT)      | Intersected: limited by both the App's permissions and user's privileges. |
| Fine-Grained PAT (v2)             | Scoped to a specific resource owner (organization or user) and selected |
|                                   | repositories. Cannot span multiple organizations or an enterprise.       |
| Classic PAT / OAuth Token         | Global user-level scopes (e.g. repo, admin:org). Subject to organization|
|                                   | SAML SSO authorization where enforced.                                  |
| Enterprise-Level Access           | Requires an account with Enterprise Owner or Billing Manager roles;    |
|                                   | fine-grained PATs do not support enterprise-level administrative APIs.  |
+-----------------------------------+-------------------------------------------------------------------------+
```

---

## 2. Verification Standards

**PERM-VERIFY-001.** Every collector must record:

- Documented minimum permissions for all 4 token models (IAT, UAT, Fine-grained PAT, Classic PAT).
- Specific access level (`read` vs `write`).
- Required administrative roles (e.g., Organization Owner, Enterprise Owner, Security Manager, Repository Admin).
- Resource-owner boundaries and repository selection constraints.
- Organization SAML SSO authorization requirements.
- Status must remain `documented-not-empirically-tested` until tested against live synthetic organizations.

**PERM-PREFLIGHT-001.** Preflight permission checks must report proven capabilities, denied capabilities, and uncertainty separately without guessing or prompting for overly broad privileges.

---

## 3. Module-Level Permissions and Role Requirements Ledger

The table below reflects the documented minima derived from official GitHub documentation and OpenAPI specifications (API version `2026-03-10`). All empirical verification statuses remain pending live testing.

| Module / Scope             | Minimum Fine-Grained PAT (Resource: Access)                                   | Minimum Classic PAT Scopes                       | GitHub App Installation (IAT)                          | Required Roles (Documented)                                          | Sensitivity                            | Empirical Status        |
| -------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------- | ----------------------- |
| **Command: Help / Syntax** | None                                                                          | None                                             | None                                                   | None                                                                 | None                                   | Verified (Local)        |
| **Command: Dry-Run**       | Minimum read probe on org root                                                | `read:org`                                       | Organization: `read`                                   | Org Member                                                           | Redacted Plan                          | Scaffolded              |
| `orgs`                     | Organization administration: `read`<br>Organization members: `read`           | `admin:org`, `read:org`                          | Organization administration: `read`                    | Org Owner for full admin; Org Member for public metadata             | Confidential metadata                  | Documented (not tested) |
| `repos`                    | Repository metadata: `read`<br>Administration: `read` (for forks/settings)    | `repo`, `public_repo` (for public)               | Repository metadata: `read`                            | Org Member with repo read access; Repo Admin for protection settings | Confidential metadata                  | Documented (not tested) |
| `lfs`                      | Storage & billing: `read` (where available)<br>Repository metadata: `read`    | `read:org`, `repo`                               | Repository metadata: `read`                            | Org Owner or Billing Manager                                         | Confidential metadata                  | Documented (not tested) |
| `teams`                    | Organization administration: `read`<br>Members: `read`                        | `read:org`, `admin:org`                          | Organization administration: `read`                    | Team Maintainer or Org Owner (secret teams invisible to non-members) | Confidential metadata                  | Documented (not tested) |
| `actions`                  | Actions: `read`<br>Organization administration: `read` (for runners/policies) | `repo`, `admin:org`, `manage_runners:enterprise` | Actions: `read`<br>Organization administration: `read` | Org Owner or Enterprise Runner Admin for self-hosted runners         | Confidential metadata                  | Documented (not tested) |
| `actions-secrets`          | Secrets: `read` (metadata only)<br>Organization administration: `read`        | `admin:org`, `repo`                              | Secrets: `read`                                        | Repo Admin or Org Owner                                              | Confidential names (values prohibited) | Documented (not tested) |
| `policies`                 | Administration: `read`<br>Repository rulesets: `read`                         | `admin:org`, `repo`                              | Administration: `read`<br>Repository rulesets: `read`  | Repo Admin (repo rulesets) or Org Owner (org rulesets)               | Confidential metadata                  | Documented (not tested) |
| `security`                 | Security events: `read`<br>Administration: `read`                             | `security_events`, `admin:org`, `read:org`       | Security events: `read`                                | Security Manager, Org Owner, or Repo Admin                           | Restricted security metadata           | Documented (not tested) |
| `integrations`             | Organization administration: `read`<br>Repository administration: `read`      | `admin:org`, `admin:repo_hook`                   | Organization administration: `read`                    | Org Owner or GitHub App Manager                                      | Highly sensitive integration metadata  | Documented (not tested) |
| `users`                    | Organization members: `read`                                                  | `read:org`                                       | Organization members: `read`                           | Org Member or Org Owner                                              | Pseudonymized PII                      | Documented (not tested) |
| `packages`                 | Packages: `read`<br>Repository metadata: `read`                               | `read:packages`, `repo`                          | Packages: `read`                                       | Package reader or Repo Collaborator                                  | Confidential metadata                  | Documented (not tested) |
| `governance` _(Optional)_  | Custom repository properties: `read`<br>Organization administration: `read`   | `admin:org`                                      | Organization administration: `read`                    | Org Owner or Enterprise Owner                                        | Confidential metadata                  | Documented (not tested) |
| `billing` _(Optional)_     | Enterprise billing: `read`                                                    | `read:enterprise`, `admin:enterprise`            | Enterprise administration: `read`                      | Enterprise Owner or Billing Manager                                  | Financial / licensing metadata         | Documented (not tested) |
| `copilot` _(Optional)_     | Copilot Business: `read` OR Organization administration: `read`               | `manage_billing:copilot`, `admin:org`            | Copilot Business: `read`                               | Org Owner or Copilot Admin                                           | Licensing / seat metadata              | Documented (not tested) |

---

## 4. Representative Difficult Permission Cases

### 1. Alternative Permission Combinations (`anyOf`)

In 24 documented endpoints, access is granted by _either_ a broad administrative permission _or_ a scoped feature permission.

- _Example_: `rest.copilot.get-copilot-organization-details` is satisfied by:
  - Branch 1: `Organization permissions for "GitHub Copilot Business" (read)`
  - Branch 2: `Organization permissions for "Administration" (read)`
- _Rule_: Discovery plans must evaluate alternative branches independently (`anyOf`) and never mandate that callers possess all branches (`allOf`).

### 2. Fine-Grained PAT Resource Owner Boundaries

Fine-grained PATs are bound to a single resource owner (either one organization or one user).

- When running an enterprise-scoped discovery (`--enterprise <slug>`), a single fine-grained PAT cannot authenticate across multiple member organizations.
- Enterprise scans using fine-grained tokens must explicitly disclose enumeration limits and require per-organization credential profiles or Enterprise-scoped credentials.

### 3. SAML SSO Authorization Requirements

In GitHub Enterprise Cloud organizations enforcing SAML Single Sign-On, classic PATs and SSH keys are blocked from accessing organization resources until authorized for SSO.

- An unauthorized token produces HTTP 403 with `X-GitHub-SSO: required; url=...`.
- Preflight checks must detect this header and report that SSO authorization is required, rather than assuming a permission denial or broadening scopes.
