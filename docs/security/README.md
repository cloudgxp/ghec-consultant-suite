# Reviewing security and privacy before shipping changes

By default, every collector, bundle writer, and dashboard export must pass the security rules in [security-and-privacy.md](../specs/security-and-privacy.md) so tokens and secret values never leak to disk or logs:

- **Live collectors**: Check that all requests are read-only, use the minimum required permissions, keep only approved fields, respect rate limits, and scrub tokens from errors.
- **Bundle writers**: Confirm files are written safely to temporary files first, never overwrite existing files, and reject secret values.
- **Dashboard imports and exports**: Check file size limits, schema validation, local-only browser memory, CSV formula escaping, and PDF data minimization.

To run the full repository check (including security and secret-redaction tests):

```bash
npm run check
```

To validate the fictional test bundles and make sure no prohibited fields are present:

```bash
npm run validate:fixtures
```

> [!WARNING]
> Never use real GitHub tokens (`ghp_*`, `github_pat_*`) or real customer data in tests, screenshots, documentation, or `fixtures/synthetic/`.
