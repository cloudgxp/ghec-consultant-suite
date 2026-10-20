---
name: consultant-style-docs
description: >-
  Use this skill when writing, editing, reviewing, or refactoring user-facing documentation, operational runbooks in docs/guides/, README files, or SpecKit quickstart.md guides to follow the plain-English (8th-grade reading level), task-oriented consultant documentation style.
---

# Consultant-Style Documentation (`consultant-style-docs`)

This skill provides the template, plain-English word swap guide, and checklist for writing friendly, task-oriented documentation modeled after Ansible's user guides at an **8th-grade reading level**.

## Writing Workflow

```text
Pick User Tasks ──► Explain Defaults ──► Write "To <do X>:" + Code Pairs ──► Swap Out Jargon (8th-Grade Level) ──► Move Tips to Note Boxes
```

---

## 1. Plain-English Reading Level Rules (8th-Grade Target)

User guides should read like helpful advice from a teammate, not an academic paper or engineering spec:

- **Short Sentences:** Aim for 15–20 words per sentence. Never write more than 3 sentences in a row before showing a code example.
- **Active, Direct Voice:** Speak directly to the reader using `"You can..."`, `"To create..."`, and `"By default, the tool saves..."`.
- **Everyday Words Over Engineering Jargon:** Always swap out stiff technical terms using the table below:

| ❌ Avoid This Jargon                            | ✅ Use Plain English Instead                                       |
| :---------------------------------------------- | :----------------------------------------------------------------- |
| _Safety Invariants / Architectural Constraints_ | _How it keeps your data safe_ or put directly in a `> [!NOTE]` box |
| _Idempotent / Idempotency_                      | _Safe to run more than once without creating duplicates_           |
| _Non-mutating dry-run simulation_               | _Preview what will happen without making changes_                  |
| _Provision / Rehydrate assets_                  | _Create / Set up / Restore items_                                  |
| _Execution topology / Orchestration_            | _How the migration runs_                                           |
| _Functional domain / Granular subset_           | _Category / Specific items_                                        |
| _Purge in reverse topological order_            | _Delete demo items cleanly in the right order_                     |
| _Ephemeral credentials / Diagnostic scrubbing_  | _Temporary tokens / Hiding tokens in logs_                         |
| _Discrepancy reconciliation_                    | _Checking for differences and fixing them_                         |

---

## 2. Section Template

Every section in a guide or README must follow this pattern:

````markdown
## <Action Heading> (e.g., Creating demo content from the command line)

<1–2 simple sentences explaining what the command does by default and where it saves files.>

To <do the most common task>:

```bash
<simple copy-pasteable command>
```

To <do the task with a common option, like previewing changes>:

```bash
<command with flag>
```

To <run the task for multiple items using a file>:

```json
<short config file example>
```

```bash
<command that uses the file>
```

> [!NOTE]
> <1–2 simple sentences explaining a helpful tip or what happens behind the scenes.>
````

---

## 3. Core Formatting Rules

1. **One Task Per Code Block:**
   - Never stack 4 or 5 commands inside one giant bash block separated by `# comments`. Give each task its own `"To <do X>:"` sentence and its own code block so the reader can copy and paste just what they need.
2. **Show Folder Trees When Files Matter:**
   - If a command creates or reads a folder of files, show a small folder tree right above the command:
     ```text
     scans/
     ├── discovery-bundle.json
     ├── migration-plan.json
     └── verification-report.json
     ```
3. **Connect Multi-Step Tasks:**
   - When one command creates files for a second command, end the section with: `"Once you have <created the files>, you can <run the next step>:"` followed by the command.

---

## 4. Reference & Golden Examples

For a complete before-and-after example written at an 8th-grade reading level, read:

- [golden-example.md](./references/golden-example.md)

---

## 5. Self-Check Before Finishing

- [ ] Could an 8th grader understand every heading and explanation without looking up words like _"invariant"_, _"idempotent"_, or _"topology"_?
- [ ] Are sentences short (15–20 words on average) and written in active voice (`"You can..."`)?
- [ ] Does every section start with 1–2 sentences explaining what happens by default?
- [ ] Does every code block have a short `"To <do X>:"` lead-in right above it?
- [ ] Are examples ordered from simplest default $\rightarrow$ common flag $\rightarrow$ config file $\rightarrow$ advanced/next step?
- [ ] Are tips and security warnings tucked into `> [!NOTE]` or `> [!WARNING]` boxes?
- [ ] Are Operator and Customer guides (`docs/guides/operators/**`, `docs/guides/customers-and-pms/**`) and the root `README.md` completely free of `npm` commands (using only the GitHub Web UI, Dashboard Web UI, and `gh` CLI for operators)?
- [ ] Does `npm run lint` pass cleanly?
