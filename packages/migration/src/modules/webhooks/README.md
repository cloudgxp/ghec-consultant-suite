# Webhooks Reconciliation Module

`WebhooksMigrationModule` reconciles organization and repository webhooks after
GEI. It matches source and destination hooks by payload URL and event set.
When GEI transferred an active source hook in its disabled state, the module
uses `PATCH` on the existing target hook rather than `POST`, preventing duplicate
deliveries.

An optional client-owned `WebhookSecretProvider` supplies replacement tokens at
apply time. Tokens are not stored in discovery data or migration plans. If a
source hook reports a configured secret but no provider exists, planning emits a
warning instead of inventing a token.
