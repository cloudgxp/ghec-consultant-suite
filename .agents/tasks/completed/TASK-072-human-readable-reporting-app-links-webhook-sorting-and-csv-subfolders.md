---
id: TASK-072
title: 'Human-Readable Reporting, Smart GitHub App Links, Webhook Secret Sorting & Hierarchical CSV Exports'
status: completed
owner: antigravity
created_at: 2026-10-18
completed_at: 2026-10-18
dependencies: [TASK-071]
packages_affected:
  ['@ghec/migration', '@ghec/contracts', '@ghec/cli', '@ghec/dashboard']
---

# TASK-072: Human-Readable Reporting, Smart GitHub App Links, Webhook Secret Sorting & Hierarchical CSV Exports

## 1. Objective & Context

Refine migration reporting, post-care deliverables, and module advisories based on operator review of `demogxp-mig6/migration-audit-results`:

1. **Human-Readable Advisories (Zero `DEC-*` Jargon) & Target-Aware Mannequin Warnings:**
   - Remove internal `(DEC-XXX)` codes from all customer-facing Markdown reports, GitHub Actions step summaries, module display names, remediation scripts, dashboard views, and user guides.
   - Make `post-migration-mannequins` warnings target-aware (`ghec` vs `emu`) and emit a clear, actionable advisory when `0` mannequins are found explaining why it was skipped and how to verify attribution or link Git commits.
2. **GitHub Apps (`apps-inventory`) — Clean Up Raw Links & Match Strategy to App Type:**
   - Remove 1,200-character raw URLs (`Install URL: ... | Recreate URL: ...`) from `apps-inventory` operation notes.
   - Offer only the Marketplace/Install link for `third_party` apps, only the Custom Recreate link for `custom_private` apps, and both links for `custom_public` (org-owned public) apps.
3. **Webhooks (`webhooks` & `org-webhooks`) — Action-Required Sorting & Developer HMAC Guide:**
   - Distinguish webhooks that had a source secret (`inactive-webhook`, `high` priority) from webhooks that had no secret on the source and are already active (`active-no-secret`, `low` priority).
   - Sort post-care items so high-priority / action-required items always appear first and already-active / optional items appear last.
   - Add clear developer instructions in `POST-CARE-CHECKLIST.md` Section 3 explaining how to re-use an existing webhook secret from the receiving server or rotate a new secret.
4. **Format Remaining Raw URLs Across `.md` Reports:**
   - Wrap webhook payload URLs in inline code backticks (`https://...`) in `webhooks` module warnings and notes.
   - Format Team IdP Sync and SAML SSO URLs as compact `[Label ↗](https://...)` Markdown links.
5. **Hierarchical Post-Care CSV Exports with Subfolders:**
   - Keep `exports/post-care-items.csv` and category roll-ups (`exports/identity-and-access.csv`, `exports/governance-and-remediation.csv`) at the top of `exports/`, and generate focused task CSVs in `exports/identity-and-access/*.csv` and `exports/governance-and-remediation/*.csv`.

## 2. Dependencies & Prerequisites

- [x] `TASK-071` completed and merged to `main`

## 3. Scope of Changes

- `packages/migration/src/post-migration/mannequins/types.ts`
- `packages/migration/src/post-migration/mannequins/engine.ts`
- `packages/migration/src/modules/apps-inventory/module.ts`
- `packages/migration/src/modules/webhooks/module.ts`
- `packages/migration/src/modules/branch-protection/module.ts`
- `packages/migration/src/reporting/post-care-generator.ts`
- `packages/migration/src/reporting/results-generator.ts`
- `packages/migration/src/reporting/results-markdown-formatter.ts`
- `packages/migration/src/reporting/step-summary.ts`
- `packages/contracts/src/gap-ledger/*.ts`
- `apps/cli/src/commands/agent-review.ts`
- `apps/dashboard/src/features/LiveConsoleTab.tsx`
- `docs/guides/github-actions-migration.md`
- `docs/guides/seed-demo-content.md`

## 4. Implementation Checklist

- [x] Part 1: Strip `DEC-*` codes from user-facing outputs and make `post-migration-mannequins` warnings target-aware (`ghec` vs `emu`) with clear 0-mannequin skip guidance.
- [x] Part 2: Remove raw URLs from `apps-inventory` notes and tailor links by app classification (`third_party` vs `custom_private` vs `custom_public`).
- [x] Part 3: Distinguish `inactive-webhook` (`high` priority) vs `active-no-secret` (`low` priority), sort action-required items first and optional items last, and add developer HMAC guidance to `POST-CARE-CHECKLIST.md`.
- [x] Part 4: Format webhook payload URLs with inline code backticks and format IdP Sync / SSO URLs as Markdown links.
- [x] Part 5: Add `exports/identity-and-access.csv`, `exports/governance-and-remediation.csv`, and subfolder task CSVs (`exports/identity-and-access/*.csv` and `exports/governance-and-remediation/*.csv`).
- [x] Part 6: Update and add deterministic unit tests and pass `npm run check`.

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- Completed on `2026-10-18`.
- `npm run format && npm run check` passed cleanly across all packages (`786/786` unit tests passing across `133` suites, `0` lint/typecheck errors).
