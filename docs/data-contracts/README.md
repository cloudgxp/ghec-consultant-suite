# Public contract

The executable source is `packages/contracts/src/index.ts`; the field semantics are specified in [data-contract.md](../specs/data-contract.md). Supported reader/writer schema: `1.0.0` only. Both organization and enterprise fixtures are in `fixtures/synthetic/` and validate with `npm run validate:fixtures`.

Use `validateBundle(unknown)` at trust boundaries. It returns either a typed bundle or a safe incompatible/invalid result, without reflecting untrusted input. Direct schema consumers must not print Zod errors containing customer input. Structural validation is not a sensitive-string detector.

No independently maintained JSON Schema file or migration tool is shipped in this phase. See [versioning ADR](../adr/0002-contract-versioning.md) before changing fields or compatibility behavior.
