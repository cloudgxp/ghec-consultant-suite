# Task 011: Implement `repo-secrets` Metadata Rehydration Module

## Status

not-started

## Owner

Codex

## Objective

Build the `repo-secrets` migration module in `packages/migration/src/modules/repo-secrets/`. Handle repository Actions secret metadata discovery, diffing, placeholder creation at the target, and warning generation for secret values requiring population.

## Background

GitHub APIs are write-only for secret values: `GET /repos/{owner}/{repo}/actions/secrets` returns only secret names, visibility, and timestamps. While secret values cannot be read from the source via API, the migration module must re-create the secret inventory, detect name conflicts, and provide hooks for external secret population.

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
   - `displayName`: `'Repository Actions Secrets (Metadata Rehydration)'`
   - `scopeLevel`: `'repository'`
   - `dependencies`: `['gei-repo']`
2. `discover(ctx, cachedData?)`:
   - In cached mode: extracts `configuration-metadata` entities where `domain === 'actions'` and `configurationKind === 'secret'` for the repository.
   - In live mode: queries `GET /repos/{owner}/{repo}/actions/secrets` via `SourceReadClient`.
3. `plan(ctx, sourceData)`:
   - Queries `GET /repos/{owner}/{repo}/actions/secrets` on the target repository.
   - Compares secret names:
     - Target missing secret -> `create` operation (notes that value population is required).
     - Target already has secret with same name -> `noop` operation.
   - Emits a warning for each secret requiring out-of-band or vault-driven value injection.
4. `apply(ctx, plan)`:
   - **Default Behavior (Blank Secrets - DEC-004):** Obtains the target repository's public key (`GET /repos/{owner}/{repo}/actions/secrets/public-key`). Encrypts a blank string (`""`) using libsodium/`tweetnacl` box encryption and calls `PUT /repos/{owner}/{repo}/actions/secrets/{secret_name}`. This establishes secret names and repository visibility in the destination without requiring manual pre-creation.
   - **Client Vault Option:** If a vault provider is configured (e.g. HashiCorp Vault, Azure Key Vault, AWS Secrets Manager), fetches the real secret value from the client vault and encrypts it instead of the blank value.
   - Records created secret names in the migration report so customers/consultants know which secrets require post-migration value updates.
5. `verify(ctx, plan)`:
   - Queries target repository secrets list.
   - Asserts all planned secret names exist on the destination repository.

## Acceptance Criteria

- Unit tests verify secret names are discovered from cache and live endpoints.
- Target secrets are diffed accurately; existing secrets emit `noop`.
- Zero secret values are ever logged or printed.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/modules/repo-secrets.test.ts`

## Documentation

- Create `packages/migration/src/modules/repo-secrets/README.md` detailing the write-only limitation and vault injection strategy.
- Update `agent-communications/handoffs.md`.

## Risks / Notes

- **Zero Secret Leakage:** Never simulate secret values with plain text or log sensitive tokens.

## Completion Notes

_To be filled by Codex upon task completion._
