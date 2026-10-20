# Documentation Directory

Welcome to the **GHEC Consultant Suite** documentation! This folder contains role-specific guides for **Project Managers & Customers**, **Migration Operators**, and **Software Developers**, along with formal engineering specifications and architecture records.

```text
docs/
├── guides/
│   ├── customers-and-pms/  # Playbooks & handbooks for PMs, Leaders, and Customers
│   ├── operators/          # Step-by-step Operator guides (GitHub Web UI, Dashboard Web UI & gh CLI)
│   └── developers/         # Developer guides (npm workspaces, local CLI & module SDK)
├── architecture/           # System design and Architectural Decisions (DEC-001+)
├── data-contracts/         # JSON schema rules for scopes, plans, and bundles
├── security/               # Token safety and secret protection rules
└── specs/                  # Formal engineering specifications and collector catalog
```

---

## Choosing which guide to read by role

By default, start in [`guides/`](guides/README.md) and pick the folder that matches your role:

### For Project Managers, Leaders & Customers

- [Project Manager & Engagement Lead Playbook](guides/customers-and-pms/pm-engagement-playbook.md)
- [Customer Migration Handbook](guides/customers-and-pms/customer-migration-handbook.md)

### For Migration Operators (GitHub Web UI, Dashboard Web UI & `gh` CLI Only)

- [Consultant Operator's Manual](guides/operators/consultant-operators-manual.md)
- [Generating and Validating Migration Scopes](guides/operators/generating-migration-scopes.md)
- [Running Discovery Scans & Using the Assessment Web UI](guides/operators/discovery-and-dashboard-webui.md)
- [Verifying Migrations, Fixing Missing Items & Running Cutover](guides/operators/verification-and-remediation.md)
- [Setting Up a Sandbox Rehearsal or Live Demo](guides/operators/sandbox-and-demo-setup.md)

### For Platform Developers (`npm` Workspaces & Engineering Specs)

- [Local Development & Running the CLI with npm](guides/developers/local-development-and-cli.md)
- [Building and Publishing the Customer Release Kit](guides/developers/building-the-release-kit.md)
- [Adding and Testing Migration Modules](guides/developers/adding-migration-modules.md)
- [Architectural Decisions (`DEC-001`–`DEC-020+`)](architecture/decisions.md)
- [Enterprise GitHub App Deployment Guide](architecture/github-app-enterprise-deployment.md)
- [Engineering Specifications Index](specs/README.md)
- [Data Contracts Reference](data-contracts/README.md)
- [Security & Privacy Review Guide](security/README.md)
