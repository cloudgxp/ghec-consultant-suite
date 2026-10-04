# Curated GitHub Platform & Migration Documentation Reference

This directory contains a focused, curated local snapshot of official GitHub documentation vendored directly from [`github/docs`](https://github.com/github/docs).

---

## 1. Purpose

The purpose of this documentation set is to provide coding agents (Antigravity, Codex, etc.) and human maintainers with an authoritative, offline, locally searchable reference for:
- GitHub Enterprise Importer (GEI) mechanics, limitations, and caveats.
- GitHub Enterprise Cloud (GHEC) and Enterprise Managed Users (EMU) identity, SCIM, SAML, and permissions models.
- GitHub REST and GraphQL API semantics, schemas, and pagination patterns.
- Authentication mechanisms (GitHub Apps, Installation Tokens, Fine-Grained & Classic PATs, SAML SSO).
- Governance and repository configuration (Rulesets, Branch Protections, Webhooks, Environments, Actions Variables, and Secrets).

Having these docs vendored directly inside the workspace eliminates hallucinated API endpoints, outdated schema assumptions, and ungrounded guesses regarding EMU and migration constraints.

---

## 2. Upstream Source & Snapshot Identity

- **Source Repository:** `https://github.com/github/docs`
- **Default Tracking Branch:** `main`
- **Current Snapshot Metadata:** Recorded in [`VERSION`](VERSION)

Each synchronization resolves `main` (or a specified `--ref`) to an exact, single commit SHA before copying any files. The local files strictly represent that immutable upstream state.

---

## 3. Included Documentation Areas

The curated corpus is strictly filtered to topics relevant to discovery, client boundaries, GEI orchestration, and API rehydration modules:

| Functional Area | Upstream Relative Path | Project Relevance |
| :--- | :--- | :--- |
| **Migrations & GEI** | `content/migrations/overview`<br>`content/migrations/using-github-enterprise-importer/`<br>`content/migrations/troubleshooting` | GEI CLI wrapper, migration source/target requirements, repo locking, mannequin reclaim, troubleshooting, and logs |
| **Enterprise Managed Users (EMU) & IAM** | `content/admin/concepts/identity-and-access-management`<br>`content/admin/managing-iam/`<br>`content/admin/managing-accounts-and-repositories/` | GHEC $\rightarrow$ GHEC-EMU lifecycle, SCIM provisioning, SAML SSO, IdP group sync, enterprise roles, and managed user constraints |
| **Enterprise Governance & Policies** | `content/admin/enforcing-policies/enforcing-policies-for-your-enterprise`<br>`content/admin/managing-github-apps-for-your-enterprise` | Enterprise-level policy enforcement, GitHub App management, and audit log controls |
| **Organizations & Teams** | `content/organizations/organizing-members-into-teams`<br>`content/organizations/managing-membership-in-your-organization`<br>`content/organizations/managing-organization-settings` | Team hierarchies, parent/child relationships, IdP group synchronization, roles, and org-level settings |
| **Repositories, Rulesets & Protection** | `content/repositories/.../managing-rulesets`<br>`content/repositories/.../managing-protected-branches`<br>`content/repositories/.../managing-repository-settings` | Ruleset schema/bypasses, branch protection rules, autolinks, custom properties, and Git LFS settings |
| **Actions, Secrets & Variables** | `content/actions/concepts/runners`<br>`content/actions/concepts/security`<br>`content/actions/concepts/workflows-and-actions`<br>`content/actions/how-tos/manage-runners/self-hosted-runners` | Actions variables, secrets metadata, deployment environments, self-hosted runner infrastructure, and reusable workflows |
| **Webhooks** | `content/webhooks/` | Repository, organization, and global webhook configuration, delivery payloads, and secret validation |
| **REST API Reference & Guides** | `content/rest/about-the-rest-api`<br>`content/rest/using-the-rest-api`<br>`content/rest/authentication`<br>`content/rest/actions`<br>`content/rest/orgs`<br>`content/rest/repos`<br>`content/rest/teams`<br>`content/rest/scim`<br>`content/rest/enterprise-admin`<br>`content/rest/rate-limit`<br>`content/rest/guides/encrypting-secrets-for-the-rest-api.md` | Endpoint parameters, permission requirements, rate limit handling, pagination patterns, and libsodium secret encryption |
| **GraphQL API Reference & Guides** | `content/graphql/overview`<br>`content/graphql/guides/`<br>`content/graphql/reference/` | Node IDs, pagination, GraphQL rate limit calculations, and entity reference documentation |
| **GitHub Apps & Auth Posture** | `content/apps/creating-github-apps/`<br>`content/authentication/keeping-your-account-and-data-secure/` | App manifests, JWT creation, installation tokens, token scopes, and SSO authorization |
| **Supporting Reusables & Variables** | `data/reusables/enterprise-migration-tool`<br>`data/variables/product.yml` | Granular GEI caveats (data not migrated, repo size limits, delta migration limits) and product terminology |

---

## 4. Intentionally Excluded Areas

To maintain a compact, high-signal reference corpus, all non-essential documentation is omitted:
- GitHub Education, Sponsors, Desktop, Mobile, and CLI user guides.
- General Git tutorials (commit, rebase, merge basics).
- Pull request beginner tutorials and GitHub Pages hosting guides.
- GitHub Marketplace publishing and billing guides.
- Codespaces user guides unrelated to enterprise policy.
- Community and social features (discussions, reactions, gists, profile customization).

---

## 5. Agent Usage Protocol

When developing or modifying discovery, migration, API adapters, or CLI commands:

1. **Consult Authoritative Documentation First:** Before making assumptions about endpoint payloads, parameter names, required scopes, rate limit response headers, or EMU behavior, search and read the corresponding document under `references/github-docs/`.
2. **Do Not Hallucinate Endpoints:** If an endpoint or feature is not documented in `references/github-docs/` or verified in Octokit types, verify against the live API or open an explicit question in `agents/agent-communications/decisions.md`.
3. **Record Consulted Documentation:** In task completion notes and PR summaries, cite the local documentation files consulted (e.g. `references/github-docs/content/rest/guides/encrypting-secrets-for-the-rest-api.md`).

---

## 6. Authority & Validation

The vendored documentation represents GitHub's documented platform contract. However:
- If a discrepancy arises between documentation and `@octokit/rest` / `@octokit/graphql` TypeScript types, Octokit types and actual HTTP responses take precedence.
- All code changes must still be verified with unit tests, schemas, and live or mock integration tests.

---

## 7. Synchronization & Maintenance

To update the local documentation snapshot to the latest `github/docs@main`:

```bash
# Using npm script:
npm run docs:sync

# Or invoking directly:
node scripts/sync-github-docs.mjs

# Or synchronizing against a specific branch, tag, or commit SHA:
node scripts/sync-github-docs.mjs --ref <commit-or-tag>

# Dry run mode (validates allowlist without writing changes):
node scripts/sync-github-docs.mjs --dry-run
```

The sync script automatically:
1. Performs a shallow fetch of the requested revision.
2. Resolves the exact commit SHA.
3. Enforces that all allowlisted paths exist upstream (failing non-zero if upstream reorganizes or removes paths).
4. Cleans up previously synchronized files to eliminate stale entries.
5. Updates `VERSION` and refreshes `LICENSES/`.
6. Cleans up temporary checkout directories.

---

## 8. Licensing and Attribution

The documentation in this directory is sourced from [github/docs](https://github.com/github/docs):
- Documentation text and media are licensed under the **Creative Commons Attribution 4.0 International License (CC-BY-4.0)**. Full license text is preserved in [`LICENSES/LICENSE-CC-BY-4.0.txt`](LICENSES/LICENSE-CC-BY-4.0.txt).
- Code samples and software scripts are licensed under the **MIT License**. Full license text is preserved in [`LICENSES/LICENSE-MIT.txt`](LICENSES/LICENSE-MIT.txt).
