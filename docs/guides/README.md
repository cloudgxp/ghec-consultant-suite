# User Guides by Role

This folder organizes all **GHEC Consultant Suite** guides into three distinct folders by role so **Project Managers & Customers**, **Migration Operators**, and **Software Developers** only see the tools and instructions meant for them.

```text
docs/guides/
├── customers-and-pms/                  # Non-technical guides for Leaders, PMs & Clients
│   ├── pm-engagement-playbook.md
│   └── customer-migration-handbook.md
├── operators/                          # Operator guides (GitHub Web UI, Dashboard Web UI & gh CLI only)
│   ├── consultant-operators-manual.md
│   ├── generating-migration-scopes.md
│   ├── discovery-and-dashboard-webui.md
│   ├── verification-and-remediation.md
│   └── sandbox-and-demo-setup.md
└── developers/                         # Engineering guides (npm workspaces, local CLI & module SDK)
    ├── local-development-and-cli.md
    ├── building-the-release-kit.md
    └── adding-migration-modules.md
```

---

## 1. Guides for Project Managers, Leaders & Customers

Plain-English guides with zero technical commands needed:

| What You Want to Do                                                                           | Guide                                                                                     |
| :-------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------- |
| Plan migration waves, track client prerequisites, estimate timelines, and sign off on results | [Project Manager & Engagement Lead Playbook](customers-and-pms/pm-engagement-playbook.md) |
| Share a plain-English overview, token/SSO checklist, and Day-1 post-care guide with customers | [Customer Migration Handbook](customers-and-pms/customer-migration-handbook.md)           |

---

## 2. Guides for Migration Operators (Delivery Consultants)

All operator guides use **only the GitHub Web UI, the Assessment & Operations Web UI, and the `gh` CLI**—you never need to run `npm` or compile source code:

| What You Want to Do                                                                                    | Guide                                                                                    |
| :----------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------- |
| Install the Release Kit and run full or selective migrations via the GitHub Actions Web UI or `gh` CLI | [Consultant Operator's Manual](operators/consultant-operators-manual.md)                 |
| Generate, filter, consolidate, or validate migration scope files (`scopes/*.json`)                     | [Generating and Validating Migration Scopes](operators/generating-migration-scopes.md)   |
| Run read-only discovery scans and explore readiness scores in the Assessment Web UI                    | [Discovery Scans & Assessment Web UI](operators/discovery-and-dashboard-webui.md)        |
| Review the `migration-audit-results` repository, run self-healing fixes, and execute cutover           | [Verifying Migrations & Fixing Missing Items](operators/verification-and-remediation.md) |
| Populate a test organization with 34 sample items and run a safe sandbox rehearsal                     | [Setting Up a Sandbox Rehearsal or Live Demo](operators/sandbox-and-demo-setup.md)       |

---

## 3. Guides for Platform Developers & Engineers

Technical guides for engineers working in the TypeScript monorepo with `npm`:

| What You Want to Do                                                                         | Guide                                                                                      |
| :------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------- |
| Set up `npm` workspaces, run `npm run dev:cli` and `npm run dev`, and execute offline tests | [Local Development & Running the CLI with npm](developers/local-development-and-cli.md)    |
| Bundle and publish the zero-source `ghec-migration-kit` archive for client engagements      | [Building and Publishing the Customer Release Kit](developers/building-the-release-kit.md) |
| Scaffold, implement, and test a new 4-stage migration module in `@ghec/migration`           | [Adding and Testing Migration Modules](developers/adding-migration-modules.md)             |
