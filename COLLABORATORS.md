# Collaborators & Team Roles

This guide explains who maintains the **GHEC Consultant Suite**, how team permissions work, and how collaborators work together on code changes and customer migrations.

---

## Understanding project roles

By default, everyone working in this repository fits into one of four roles. Each role has specific permissions to keep customer migration tools safe and reliable.

| Role                      |  GitHub Permission   | What They Do                                                                                                        |
| :------------------------ | :------------------: | :------------------------------------------------------------------------------------------------------------------ |
| **Core Maintainers**      | `Admin` / `Maintain` | Approve pull requests, manage GitHub Actions secrets, approve production migration gates, and publish releases.     |
| **Migration Consultants** |       `Write`        | Create wave scope files (`scopes/*.json`), run discovery scans, review verification reports, and improve modules.   |
| **External Contributors** |  `Read` / `Triage`   | Report bugs, propose new collectors or migration modules via pull requests, and improve user guides.                |
| **Automated Assistants**  |     Bot / Scoped     | Run automated code checks, assist with verification and security audits via GitHub Copilot, and verify test suites. |

---

## Working together on a migration wave

By default, migration consultants collaborate on customer cutovers by generating scope artifacts in GitHub Actions or committing scope files to the `scopes/` folder and reviewing the automated plan in a Pull Request before moving any data.

```text
scopes/
├── test-org-wave.json
├── test-repo-wave.json
└── test-all-wave.json
```

To propose a new migration wave for your team to review, generate a plan from your scope file:

```bash
npm run dev:cli -- plan --scope ./scopes/wave-1.json
```

To open a Pull Request so another collaborator can review the planned changes before you run the migration:

```bash
git checkout -b wave/acme-corp-cutover
git add scopes/wave-1.json
git commit -m "docs(scope): add acme-corp wave-1 scope"
git push -u origin wave/acme-corp-cutover
gh pr create --fill
```

To approve a colleague's migration scope Pull Request from the command line:

```bash
gh pr review --approve --body "Reviewed planned repository counts and ruleset settings."
```

> [!WARNING]
> Never paste customer Personal Access Tokens (`ghp_*`, `github_pat_*`) into pull request comments, issues, or scope files. Always store tokens in GitHub Actions secrets (`GHEC_SOURCE_TOKEN` and `GHEC_TARGET_TOKEN`).

---

## Adding or reviewing repository collaborators

By default, repository administrators manage access through GitHub teams or direct collaborator invitations.

To list all current collaborators and their permission levels using the GitHub CLI:

```bash
gh api repos/{owner}/{repo}/collaborators --jq '.[] | "\(.login): \(.role_name)"'
```

To invite a new consultant to the repository with `push` (`Write`) access:

```bash
gh api --method PUT repos/{owner}/{repo}/collaborators/NEW_USERNAME \
  -f permission="push"
```

To check if a specific user already has access to the repository:

```bash
gh api repos/{owner}/{repo}/collaborators/USERNAME/permission --jq '.permission'
```

---

## Using GitHub Copilot custom agents and skills

By default, this repository includes custom GitHub Copilot instructions (`.github/copilot-instructions.md`), path-scoped instructions (`.github/instructions/`), reusable skills (`.github/skills/`), and specialized custom agents (`.github/agents/`):

- **`@migration-verifier`** (`.github/agents/migration-verifier.agent.md`): Reviews `verification-report.json` files and generates idempotent remediation plans (`remediation-plan.json` and `remediation.sh`).
- **`@security-auditor`** (`.github/agents/security-auditor.agent.md`): Audits code changes and logs to ensure zero plaintext secrets (`DEC-004`) or unsanitized tokens ever reach disk.

To combine all passing Dependabot pull requests into a single maintenance branch:

```bash
gh workflow run combine-dependabot-prs.yml
```
