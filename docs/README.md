# Documentation Directory

Welcome to the **GHEC Consultant Suite** documentation! This folder contains plain-English user guides for running migrations, along with technical specifications and architecture records for contributors.

```text
docs/
├── guides/           # Step-by-step plain-English guides for common tasks
├── architecture/     # System design and Architectural Decisions (DEC-001+)
├── data-contracts/   # JSON schema rules for scopes, plans, and bundles
├── security/         # Token safety and secret protection rules
├── reports/          # Past migration audit reports and studies
└── specs/            # Formal engineering specifications and collector catalog
```

---

## Choosing which guide to read

By default, if you want to run a scan, test a migration, or use GitHub Actions, start in the [`guides/`](guides/README.md) folder.

To deploy the Customer Migration Release Kit and run migrations 100% via GitHub Actions, read:

- [Consultant Operator's Manual](guides/consultant-operators-manual.md)
- [Customer Migration Handbook](guides/customer-migration-handbook.md)
- [Generating and Validating Migration Scopes](guides/generating-migration-scopes.md)

To collect organization data and explore it offline in the web dashboard, read:

- [Offline Discovery & Assessment Guide](guides/offline-discovery-and-assessment.md)

To set up tokens and run a safe test migration to an Enterprise Managed Users (EMU) organization, read:

- [GHEC to EMU Test Migration Setup Guide](guides/ghec-to-emu-test-migration-setup.md)

To run a full weekend migration wave using parallel GitHub Actions runners, read:

- [GitHub Actions Migration Guide](guides/github-actions-migration.md)

To check your target organization after a migration and automatically generate a script to fix any missing items, read:

- [Verification & Remediation Guide](guides/verification-and-remediation.md)

To fill a test organization with 34 realistic sample items for a live demo, read:

- [Creating Sample Data for a Demo](guides/seed-demo-content.md)

---

## Checking documentation links and formatting

By default, all user guides in `docs/guides/` follow our **Consultant Documentation Style** ([`../.github/instructions/documentation-style.instructions.md`](../.github/instructions/documentation-style.instructions.md)), which pairs short, 8th-grade reading level explanations with copy-pasteable examples.

To format all Markdown files in `docs/` with Prettier:

```bash
npm run format
```

To verify that every documentation path referenced in the migration gap catalog exists on disk:

```bash
node --import tsx scripts/verify-doc-references.ts
```

> [!NOTE]
> Formal engineering contracts inside [`docs/specs/`](specs/README.md) and [`docs/architecture/decisions.md`](architecture/decisions.md) are technical reference documents and keep their RFC requirement structure.
