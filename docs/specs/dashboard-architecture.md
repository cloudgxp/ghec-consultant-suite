# Dashboard architecture

Status: Vite/React/TypeScript/Tailwind/DaisyUI static shell only. All capabilities below are specified and deferred. jsPDF will be added when PDF reporting is implemented.

## Import boundary

**DASH-INGEST-001.** A file picker and keyboard-accessible equivalent to drag/drop accept one explicit local JSON file. Check byte limit before parsing; parse as untrusted data; validate schema version before analysis, then shape and relationships via `@ghec/contracts`. Use a worker when needed to preserve responsiveness. AC: valid synthetic bundle loads; malformed JSON, oversize files, invalid schema and unsupported versions produce distinct actionable messages with no raw data echo; failed import leaves the previous valid bundle intact.

**DASH-COMPAT-001.** Use registered readers for supported versions. Never silently reinterpret incompatible data. Show the supported version range, producer version, collection time, synthetic label and limitations. Older registered compatible versions remain readable through explicit normalization, with no rewrite of the original. AC: compatibility fixtures pass the registered matrix and unknown major/minor versions are rejected clearly.

**DASH-STATE-001.** Model empty, validating, ready, partial, incompatible and invalid import states. Within views distinguish observed facts, calculated findings, unknown/unavailable fields and advisory recommendations. Collector failures and scope limits must be visible on overview and drill-down. AC: the enterprise fixture cannot render a green “fully assessed” conclusion; unknown LFS bytes never become 0.

## Feature areas

| View                              | Evidence and interaction                                    | Acceptance criteria                                                        |
| --------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| Executive overview                | Observed counts, scan age, coverage and priority advisories | Enterprise totals disclose enumeration limits; links reach evidence.       |
| Migration readiness               | Dimensions from MIG rules; prerequisites and blockers       | Missing evidence shows unknown, not ready; no unsupported composite score. |
| Security posture                  | Accessible settings and alert metadata                      | Inaccessible alerts cannot be labeled absent; no vulnerable code snippets. |
| Organization/repository inventory | Scoped tables, visibility, archive and branch state         | Org filter constrains rows and totals; stable IDs survive duplicate names. |
| Teams/access                      | Hierarchies, counts and repository mappings                 | Pseudonymized identities remain useful without personal details.           |
| Actions                           | Workflow/runner/configuration metadata                      | Only approved names/statuses; no secret or variable values.                |
| LFS/storage                       | Measurements, units, coverage and estimates                 | Unknown storage is marked unknown; estimates are labeled separately.       |
| Collector health/data quality     | Per-module terminal states, provenance, warnings and errors | Filters expose failures and partial evidence; source timestamps visible.   |

**DASH-NAV-001.** Each area supports applicable filtering, stable sorting with explicit unknown ordering, and organization/entity drill-down. Filters compose and have a clear reset. AC: keyboard users can follow overview → repository → evidence and return with filters preserved; sorting never mixes scope IDs.

**DASH-EXPORT-001.** CSV export operates on the selected view/filter and includes explicit unknown markers; neutralize spreadsheet formula injection (`=`, `+`, `-`, `@`, tabs/control prefixes), quote delimiters/newlines and test common spreadsheet readers. PDF reports use bundled jsPDF with local fonts/assets, pagination, headings, tables, coverage caveats and rule versions. AC: no network fetch occurs; long text and large tables paginate without clipping; scope/filters/time appear on reports. Exports inherit redaction and never rehydrate omitted PII. Accessible HTML remains primary; do not claim tagged PDF conformance without testing.

**DASH-LOCAL-001.** Keep parsed data in memory, do not store it in localStorage, IndexedDB, service worker caches or URL parameters. Explicit reset drops application references; do not promise secure memory erasure. AC: storage/network inspection finds no customer data persistence or outgoing requests after static assets load.

**DASH-A11Y-001.** Semantic headings/tables, labels, focus management, visible keyboard focus, contrast, non-color status cues, live announcements and responsive layouts are required. AC: automated accessibility checks and manual keyboard/screen-reader tests cover actual workflows at 320px and desktop widths and 200% zoom. Virtualized tables need an accessible alternative.

Use feature folders for domain views, shared components for accessible primitives, `lib` for file/export boundaries, and `packages/analysis` for deterministic calculations. There is no API client or credential interface in the dashboard.
