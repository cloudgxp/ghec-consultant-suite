---
applyTo: 'docs/guides/**,**/README.md,specs/**/quickstart.md'
---

# Rule: Task-Oriented Documentation Style (`consultant-style-docs`)

When writing or updating user-facing documentation (`docs/guides/**/*.md`, `README.md`, `apps/*/README.md`, `packages/*/README.md`, and SpecKit `quickstart.md` files), follow the **Consultant Documentation Style** modeled on Ansible's user guides.

> **Scope Boundary:** Formal engineering specifications (`docs/specs/**`), architectural decisions (`docs/adr/**`, `docs/architecture/decisions.md`), and schema contracts (`docs/data-contracts/**`) remain technical RFC documents and are exempt from this style.

## 1. Plain English at an 8th-Grade Reading Level

- Write for a busy human operator, not an academic textbook. Keep sentences short (aim for 15–20 words) and use direct, active voice (`"You can..."`, `"By default, the tool creates..."`).
- Replace stiff engineering jargon with everyday words:
  - Instead of _"invariants"_ or _"constraints"_ $\rightarrow$ use _"rules"_ or _"how it works"_
  - Instead of _"idempotent"_ $\rightarrow$ say _"safe to run more than once"_
  - Instead of _"non-mutating dry-run simulation"_ $\rightarrow$ say _"preview changes without modifying your organization"_
  - Instead of _"provision"_ or _"rehydrate"_ $\rightarrow$ say _"create"_, _"set up"_, or _"restore"_
  - Instead of _"execution topology"_ or _"orchestration"_ $\rightarrow$ say _"how the workflow runs"_
  - Instead of _"functional domain"_ or _"cohort"_ $\rightarrow$ say _"category"_ or _"group of repositories"_

## 2. Task-Oriented Headings (What You Want to Do)

- Name headings after **what the reader wants to do** using action words (e.g., `Downloading data for offline use`, `Creating demo content from the command line`, `Resuming a paused migration`).
- Never name user-guide headings after internal code classes or abstract concepts (avoid `ScopeMatrixSlicer Architecture`, `Safety Invariants`, or `CLI Options Overview`).

## 3. State Default Behavior Upfront

- Start every task section with **1–2 simple sentences** stating what the command does by default without extra flags (such as where it saves files or what items it creates).

## 4. The `"To [goal], [action]:"` Pattern

- Present every common task as a short **Explanation $\rightarrow$ Example** pair:
  1. Write **1–2 plain-English sentences** explaining the goal (`To test the command without making any changes to GitHub, add the --dry-run option:`).
  2. Immediately show a **self-contained, copy-pasteable code block** (`bash`, `json`, `yaml`).
- Never write more than 3 sentences in a row before showing a concrete example.

## 5. Order Examples from Simple to Advanced

- Order examples in each section starting with what most people need 80% of the time:
  1. **Simplest command using defaults** (one org or repo).
  2. **Common single flag** (like `--dry-run` or picking a category).
  3. **Using a config file for multiple items** (like `--scope ./scopes/wave-1.json`).
  4. **Custom folders or next steps** (like changing `--output-dir` and running the follow-up command).

## 6. Show Folder Trees and Keep Notes Separate

- When a command reads or creates a folder structure, show a small ASCII folder tree (`├──`, `└──`) right above the command.
- Keep the main steps clean. Put helpful tips, edge cases, or security reminders inside `> [!NOTE]` or `> [!WARNING]` boxes right below the code block.
- Read `.github/skills/consultant-style-docs/SKILL.md` for templates and examples whenever writing or editing documentation.

## 7. Strict Audience Separation (Leaders/PMs, Operators, and Developers)

- **Root `README.md` (High-Level Executive Overview):** Written for non-technical leaders, project managers, and first-time visitors. Focus on how the platform supports GHEC and GHEC-EMU migration contracts, the 4-stage lifecycle (**Discover $\rightarrow$ Plan $\rightarrow$ Migrate $\rightarrow$ Validate**), a high-level **Capabilities Table**, and role-based links. Never put `npm` build commands in the root `README.md`.
- **Operator & Customer Guides (`docs/guides/operators/**`, `docs/guides/customers-and-pms/**`):** Strictly show **GitHub Web UI** (`Actions` tab, Settings, `migration-audit-results`), **Assessment & Operations Web UI**, and **GitHub CLI (`gh`)** instructions. **Never include `npm`, `npx`, `tsx`, or source-compilation commands in Operator or Customer guides.**
- **Developer Guides (`docs/guides/developers/**`, `CONTRIBUTING.md`, `apps/*/README.md`, `packages/*/README.md`):** Use for `npm` workspace setup (`npm ci`, `npm run build`, `npm run check`, `npm run dev`, `npm run dev:cli`), Release Kit bundling (`npm run build:release-kit`), and module engineering details.

