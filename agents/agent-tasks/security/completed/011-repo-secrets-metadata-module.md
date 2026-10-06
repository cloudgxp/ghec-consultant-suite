# Task 011: Implement `repo-secrets` Metadata Rehydration Module

## Status

complete

## Owner

Antigravity

## Objective

Build the `repo-secrets` migration module in `packages/migration/src/modules/repo-secrets/`. Handle repository secret metadata discovery, diffing, placeholder creation at the target, and warning generation for Actions secrets, Dependabot secrets, and Codespaces secrets (DEC-004).

## Background

GitHub APIs are write-only for secret values: `GET /repos/{owner}/{repo}/actions/secrets` returns only secret names, visibility, and timestamps. GEI does not migrate Actions secrets, Dependabot secrets, or Codespaces secrets. While secret values cannot be read from the source via API, the migration module must re-create the secret inventory, detect name conflicts, and provide hooks for external secret population across all three secret domains.

## GitHub Documentation References

- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md`
- `references/github-docs/data/reusables/enterprise-migration-tool/data-not-migrated.md`

## Dependencies

- Task 008: Implement `repo-variables` Migration Module

## Files / Areas Expected to Change

- `packages/migration/src/modules/repo-secrets/`
  - `module.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/modules/repo-secrets.test.ts`

## Requirements

1. Implement `RepoSecretsMigrationModule`:
   - `id`: `'repo-secrets'`
   - `displayName`: `'Repository Secrets (Actions, Dependabot, Codespaces)'`
   - `scopeLevel`: `'repository'`
   - `dependencies`: `['gei-repo']`
2. `discover(ctx, cachedData?)`:
   - Extracts secret metadata across three endpoints:
     - Actions: `GET /repos/{owner}/{repo}/actions/secrets`
     - Dependabot: `GET /repos/{owner}/{repo}/dependabot/secrets`
     - Codespaces: `GET /repos/{owner}/{repo}/codespaces/secrets`
3. `plan(ctx, sourceData)`:
   - Queries target repository secret lists for each domain.
   - Compares secret names per domain:
     - Target missing secret $\rightarrow$ `create` operation (notes domain and value population required).
     - Target already has secret $\rightarrow$ `noop` operation.
   - Emits a warning for each secret requiring out-of-band or vault-driven value injection.
4. `apply(ctx, plan)`:
   - **Default Behavior (Blank Secrets - DEC-004):** Obtains the target repository's public key for the specific domain (`actions/secrets/public-key`, `dependabot/secrets/public-key`, or `codespaces/secrets/public-key`). Encrypts a blank string (`""`) using libsodium/`tweetnacl` box encryption and calls `PUT` on the target secret endpoint. This establishes secret names in the destination without requiring manual pre-creation.
   - **Client Vault Option:** If a vault provider is configured (e.g. HashiCorp Vault, Azure Key Vault, AWS Secrets Manager), fetches the real secret value from the client vault and encrypts it instead of the blank value.
   - Records created secret names in the migration report so operators know which secrets require post-migration value updates.
5. `verify(ctx, plan)`:
   - Queries target repository secret lists across all three domains.
   - Asserts all planned secret names exist on the destination repository.

## Acceptance Criteria

- Unit tests verify secret names are discovered across Actions, Dependabot, and Codespaces domains.
- Target secrets are diffed accurately; existing secrets emit `noop`.
- Zero secret values are ever logged or printed.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/modules/repo-secrets.test.ts`

## Documentation

- Create `packages/migration/src/modules/repo-secrets/README.md` detailing the write-only limitation, vault injection strategy, and multi-domain secret endpoints.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- **Zero Secret Leakage:** Never simulate secret values with plain text or log sensitive tokens.

## Completion Notes

Completed on 2026-10-04 by Antigravity:

- Implemented `RepoSecretsMigrationModule` under `packages/migration/src/modules/repo-secrets/`.
- Multi-domain secret discovery and reconciliation across Actions, Dependabot, and Codespaces domains.
- Encrypts secrets using libsodium-wrappers sealed-box encryption using target public key.
- Supports optional external `SecretValueProvider` vault hook for live values, defaulting to blank secrets (DEC-004).
- Added unit test suite in `packages/migration/tests/modules/repo-secrets.test.ts` (9 tests).
