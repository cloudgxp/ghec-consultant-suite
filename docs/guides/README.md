# Operational User Guides

This folder contains plain-English, task-oriented guides for every stage of a GitHub Enterprise Cloud (GHEC) to Enterprise Managed Users (GHEC-EMU) migration. Each guide shows default behaviors first and pairs short explanations with copy-pasteable commands.

```text
docs/guides/
├── consultant-operators-manual.md
├── customer-migration-handbook.md
├── generating-migration-scopes.md
├── offline-discovery-and-assessment.md
├── ghec-to-emu-test-migration-setup.md
├── github-actions-migration.md
├── verification-and-remediation.md
├── seed-demo-content.md
└── jules-automation-setup.md
```

---

## Picking a guide by task

| What You Want to Do                                                                       | Guide                                                                          |
| :---------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| Deploy the Release Kit and run full or selective migrations 100% via GitHub Actions       | [Consultant Operator's Manual](consultant-operators-manual.md)                 |
| Share a plain-English overview, preparation checklist, and post-care guide with customers | [Customer Migration Handbook](customer-migration-handbook.md)                  |
| Generate, filter, consolidate, or validate migration scope files (`scopes/*.json`)        | [Generating and Validating Migration Scopes](generating-migration-scopes.md)   |
| Download organization data and inspect it on an offline computer                          | [Offline Discovery & Assessment](offline-discovery-and-assessment.md)          |
| Create sample teams, repos, rulesets, and secrets for a demo or rehearsal                 | [Creating Sample Data for a Demo](seed-demo-content.md)                        |
| Set up tokens, SSO, and test scopes for an EMU test migration                             | [GHEC to EMU Test Migration Setup](ghec-to-emu-test-migration-setup.md)        |
| Run parallel migration waves and weekend cutovers in GitHub Actions                       | [Running Migrations with GitHub Actions](github-actions-migration.md)          |
| Compare source and target organizations and fix missing items                             | [Verifying Migrations & Fixing Missing Items](verification-and-remediation.md) |
| Set up automated CI healing and daily code cleanup with Jules                             | [Setting Up Jules Automated Maintenance](jules-automation-setup.md)            |

---

## Running a quick end-to-end test from the command line

By default, you can test the entire migration workflow (`discover` $\rightarrow$ `preflight` $\rightarrow$ `plan` $\rightarrow$ `migrate --dry-run`) without making any changes to your target organization.

To collect data from your source organization and save it to `./scans`:

```bash
npm run dev:cli -- discover --organization "source-enterprise-org" --modules "all"
```

To check your tokens and preview a migration wave using a scope file:

```bash
npm run dev:cli -- preflight --scope ./scopes/test-org-wave.json
npm run dev:cli -- migrate --scope ./scopes/test-org-wave.json --dry-run
```

> [!WARNING]
> Always store your source and target GitHub tokens in environment variables (`GHEC_SOURCE_TOKEN` and `GHEC_TARGET_TOKEN`) or GitHub Actions secrets—never inside `scopes/*.json` files.
