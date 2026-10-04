# Deployment Environments Migration Module

`EnvironmentsMigrationModule` handles the discovery, planning, reconciliation, and post-GEI rehydration of repository deployment environments, protection rules, deployment branch policies, environment-scoped variables, and environment-scoped secrets.

## Module Metadata

- **ID**: `environments`
- **Display Name**: `Deployment Environments, Variables & Protection Rules`
- **Scope Level**: `repository`
- **Dependencies**: `['gei-repo']`

## Background

GitHub Enterprise Importer (GEI) migrates repository code, issues, and pull requests, but does **not** transfer deployment environments, their protection policies, or environment-scoped secrets and variables. Without this module, deployment workflows targeting environments such as `production`, `staging`, or `qa` fail upon target execution.

## Features

1. **Environment Definition & Protection Rules**:
   - Transfers environment names, wait timers (`wait_timer` in minutes), and self-review prevention (`prevent_self_review`).
   - Recreates deployment branch policies: `all` branches, `protected` branches, or `selected` (custom branch/tag rules).
2. **Reviewer Identity Translation**:
   - Integrates with [`IdentityMappingEngine`](../teams/identity-mapper.ts) to map reviewer user logins to EMU usernames (e.g., `octocat` -> `octocat_acme`).
   - Issues structured non-fatal warnings for unmapped users.
3. **Environment-Scoped Variables**:
   - Discovers variables in source environments.
   - Plans `create`, `update`, and `noop` operations based on destination state.
   - Applies mutations via GitHub REST API endpoints (`POST` / `PATCH`).
4. **Environment-Scoped Secrets (Zero Exposure per DEC-004)**:
   - Secret values are never exposed, logged, or serialized in migration plans.
   - Obtains target environment public keys (`GET /repos/{owner}/{repo}/environments/{environment_name}/secrets/public-key`).
   - Uses `libsodium-wrappers` sealed-box encryption (`crypto_box_seal`) to encrypt ephemeral vault-supplied secrets or placeholder blank values (`""`).
5. **Auditing & Verification**:
   - Verifies target environment existence, wait timer accuracy, variable values, and secret names post-migration.

## REST Endpoints Used

| Action                             | HTTP Method & Path                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| List environments                  | `GET /repos/{owner}/{repo}/environments`                                                |
| Create / update environment        | `PUT /repos/{owner}/{repo}/environments/{environment_name}`                             |
| List branch policies               | `GET /repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies`  |
| Create branch policy               | `POST /repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies` |
| List environment variables         | `GET /repos/{owner}/{repo}/environments/{environment_name}/variables`                   |
| Create environment variable        | `POST /repos/{owner}/{repo}/environments/{environment_name}/variables`                  |
| Update environment variable        | `PATCH /repos/{owner}/{repo}/environments/{environment_name}/variables/{name}`          |
| List environment secrets           | `GET /repos/{owner}/{repo}/environments/{environment_name}/secrets`                     |
| Get environment public key         | `GET /repos/{owner}/{repo}/environments/{environment_name}/secrets/public-key`          |
| Create / update environment secret | `PUT /repos/{owner}/{repo}/environments/{environment_name}/secrets/{secret_name}`       |
