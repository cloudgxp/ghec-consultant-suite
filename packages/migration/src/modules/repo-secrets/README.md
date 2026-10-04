# Repository Secrets Migration Module

`RepoSecretsMigrationModule` restores repository-level secret _names_ after a
GEI migration for Actions, Dependabot, and Codespaces. It intentionally cannot
discover or persist source secret values: GitHub's secret-list APIs are
write-only for values.

## Behavior

For each domain, discovery and verification use the corresponding repository
secret list endpoint. Planning creates a `create` operation for a missing name
and a `noop` for a name already present. Each planned creation warns operators
that the secret needs a value after migration.

When applying a missing secret, the module obtains the target domain's public
key, encrypts a value with a libsodium sealed box, and sends only
`encrypted_value` and `key_id` to GitHub. With no value provider, the encrypted
value is an empty string, creating a clearly nonfunctional placeholder without
leaking a source secret.

## Client vault injection

Callers can supply `MigrationContext.secretValueProvider`. The provider receives
only secret identity and migration scope, then returns a value directly to the
apply stage. The value is encrypted in memory and is never placed in discovery
output, a migration plan, structured logs, or an execution report. A provider
can bridge HashiCorp Vault, Azure Key Vault, AWS Secrets Manager, or a client
owned equivalent.

The provider should avoid embedding secret values in thrown error messages. The
module deliberately replaces apply-stage errors with a generic diagnostic to
prevent accidental value disclosure.

## Endpoints

For each of `actions`, `dependabot`, and `codespaces`, the module uses:

- `GET /repos/{owner}/{repo}/{domain}/secrets`
- `GET /repos/{owner}/{repo}/{domain}/secrets/public-key`
- `PUT /repos/{owner}/{repo}/{domain}/secrets/{secret_name}`

For Actions, `{domain}` is `actions`; the endpoint patterns otherwise match the
domain name directly.
