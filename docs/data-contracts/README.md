# Validating data contracts and synthetic bundles

By default, all discovery and migration JSON files use schema version `1.0.0` defined in `packages/contracts/src/index.ts` and documented in [data-contract.md](../specs/data-contract.md).

```text
fixtures/synthetic/
├── enterprise-v1.json
├── organization-v1.json
├── partial-denied-v1.json
└── specialized-v1.json
```

To validate all synthetic discovery bundles in `fixtures/synthetic/` against the contract schema:

```bash
npm run validate:fixtures
```

To validate an untrusted bundle in TypeScript before loading it into the CLI or dashboard:

```ts
import { validateBundle } from '@ghec/contracts';

const result = validateBundle(untrustedInput);
```

> [!WARNING]
> Always call `validateBundle(unknown)` when reading external files, and never print raw Zod error messages that might contain customer data. Review the [versioning ADR](../adr/0002-contract-versioning.md) before changing any contract fields.
