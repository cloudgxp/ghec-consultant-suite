# ADR 0003: Controlled Use of Primer React Experimental APIs

Status: accepted for Primer migration spike (DASH-16). Date: 2026-09-25.

## Context

Task DASH-16 introduces `@primer/react` as the design system foundation for `@ghec/dashboard`. The task requirements and component mapping in `docs/specs/primer-react-migration-plan.md` mandate support for:

1. `Blankslate` (empty/error state display)
2. `DataTable` / `Table` (ordinary tabular presentation)

In current `@primer/react` (v38.x), GitHub publishes `Blankslate`, `DataTable`, and `Table` through the public experimental entry point `@primer/react/experimental`. The migration rules dictate:

- Public `@primer/react` imports are preferred and permitted.
- Private / internal subpaths (`@primer/react/lib-esm/*` or `@primer/react/dist/*`) are strictly prohibited.
- Experimental imports (`@primer/react/experimental`) require an ADR with defined scope and exit path.

## Decision

Authorize explicit, bounded imports from `@primer/react/experimental` exclusively for:

1. `Blankslate` (`Blankslate.Visual`, `Blankslate.Heading`, `Blankslate.Description`, `Blankslate.PrimaryAction`)
2. `Table` / `DataTable` (for non-virtualized small-to-medium ordinary tables)

Internal subpaths remain strictly prohibited and will be checked by automated guardrail scripts.

## Exit Path

1. **Promotion**: When GitHub promotes `DataTable` or `Blankslate` to `@primer/react` root exports in future minor/major releases, update imports to the root package.
2. **Fallback**: If breaking changes occur in experimental APIs prior to promotion, ordinary tables can fall back to standard HTML table markup styled with Primer CSS primitive tokens (`--borderWidth-thin`, `--borderColor-default`, etc.), and empty states can fall back to `Banner` or simple card layouts with Octicons.
3. **Large Inventories**: 10,000+ row datasets will continue to use `@tanstack/react-virtual` styled with Primer primitive tokens, as established in DASH-2.

## Consequences

- Dashboard views can use authentic GitHub-styled empty states and data tables without recreating bespoke CSS.
- Automated guardrails will verify that only approved experimental symbols are imported.
