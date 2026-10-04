# Dashboard information design

This specification defines the purpose, hierarchy, actions, disclosure, and state model for every assessment view. The dashboard follows Material-inspired principles using the existing Tailwind and DaisyUI design system: tonal surfaces and dividers establish hierarchy, persistent content stays low-elevation, and stronger shadows are reserved for transient drawers and modals.

## Shared anatomy

Every view begins with a `PageHeader`: purpose, concise supporting text, at most one primary action, and restrained secondary actions. Decision-critical content follows, then a nearby `FilterToolbar`, primary results, supporting details, and finally provenance or metadata. Filters remain visible while their results are visible. Active filters appear as removable chips and include Clear all when two or more can be active.

Tables use compact density by default, sticky headers, horizontal scrolling inside their frame, and virtualization where volume warrants it. Required columns are never removed at small widths. Row detail that cannot scan cleanly belongs in a disclosure, drawer, or modal rather than another column.

Motion lasts roughly 150–250ms and communicates selection, disclosure, or overlay entry. Large result sets are never animated. Global reduced-motion rules suppress nonessential transitions.

## View anatomy

| View                  | Purpose / primary question                           | Primary action               | Initial hierarchy                                                              | Disclosed or supporting content                                 |
| --------------------- | ---------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Overview              | Can this scope migrate, and what should happen next? | Download executive PDF       | Readiness, critical blockers, collection completeness, recommended next action | Inventory, organization matrix, dimensions, caveats, provenance |
| Migration Readiness   | Which evidence-backed blockers need decisions?       | Export findings CSV          | Dimension summary, severity/dimension filters, findings                        | Evidence IDs, limitations, rule metadata                        |
| Repositories          | Which repositories create migration complexity?      | Export repositories CSV      | Search/filter toolbar, active filters, virtualized inventory                   | LFS, automation, security, and branch detail in rows            |
| Actions & Secrets     | What automation and configuration must move?         | Export workflows/secrets CSV | Workflows/secrets segment, search, virtualized results                         | Zero-secret-value disclosure and row metadata                   |
| Security & Governance | Which controls and integrations need recreation?     | Export security CSV          | Security/policy/integration segment and virtualized result                     | Integration export and per-record configuration                 |
| Teams & Access        | Which access relationships must be reconstructed?    | Export teams CSV             | Teams/identities segment and virtualized result                                | Identity export and redaction disclosure                        |
| Collector Health      | Can the evidence be trusted?                         | Export collector audit CSV   | Status filter, active filter, execution audit                                  | Warnings, errors, coverage reasons, timing                      |
| Remediation Tracker   | What improved or regressed between scans?            | Export remediation CSV       | Resolved/persistent/new metrics, filters, finding deltas                       | Entity delta inventory and PDF export                           |
| Export Center         | Which customer deliverable is needed?                | Download executive PDF       | PDF deliverables, security guarantee, report catalog                           | Per-export columns and row counts                               |
| Enterprise Matrix     | Which organization needs attention first?            | Select organization          | Sortable organization comparison                                               | Horizontally scrollable secondary measures                      |

## Complete state model

All views use the shared state components and plain language:

- **Initial/loading:** identify the operation, keep the offline context visible, show determinate progress when the worker reports it, and never block unrelated shell navigation.
- **No data:** explain that the selected scope contains no records of that kind and suggest checking collection coverage or scope.
- **No filter results:** show the active constraints and provide Clear filters.
- **Partial/incomplete:** retain available results, label the coverage limitation, link to Collector Health, and avoid treating unknown values as zero.
- **Error:** state what failed, preserve loaded data, and provide a retry, reset, or alternate export action when one exists.
- **Success:** export actions acknowledge that a local download was generated; settings communicate that findings recalculated in browser memory.

Per-view state language should name the relevant noun (“No repositories match these filters,” not “No results”). Empty tables preserve their caption and column context. Status color is always accompanied by an icon or text label.

## Surface and interaction rules

- Level 0 tonal backgrounds organize page regions; level 1 bordered surfaces identify primary content; level 2 shadow is reserved for menus, drawers, and modals.
- Selected rows and cards use a tonal background, border, and semantic state—not elevation alone.
- Filter chips are buttons with accessible removal labels. Clearing filters never changes organization scope unless the user explicitly clears that scope in the app bar.
- Successful downloads remain local and must not imply upload or persistence. Settings success means live in-memory recalculation, not server-side saving.
- Caveats and provenance remain accessible on Overview but are collapsed initially so they do not displace the decision summary.
