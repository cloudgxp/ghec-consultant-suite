# Task DASH-2: Web Worker Ingestion & Table Virtualization

## Objective

Offload bundle file parsing, contract validation, and analytical rule execution to a Web Worker, and implement table virtualization for large enterprise inventories (10,000+ rows).

---

## Business & Technical Rationale

- **UI Thread Blocking**: In enterprise environments, discovery JSON bundles range from 20MB to over 200MB and contain 50,000+ entities. Parsing and validating these bundles on the main JavaScript thread causes the browser to freeze for 5–15 seconds, prompting browser "unresponsive script" warnings.
- **DOM Rendering Bottlenecks**: Rendering more than 500 HTML table rows creates thousands of DOM nodes, causing severe lag when filtering, sorting, or scrolling on tabs like `RepositoriesTab` or `ActionsAndSecretsTab`.
- By offloading ingestion to a Web Worker and virtualizing the UI tables, the dashboard remains responsive (60 FPS) regardless of dataset size.

---

## Technical Specifications & Scope

### 1. Web Worker for Bundle Ingestion

Create `apps/dashboard/src/lib/importer.worker.ts`:

- Utilize Vite's native Web Worker support:
  ```typescript
  // In component:
  const worker = new Worker(
    new URL('../lib/importer.worker.ts', import.meta.url),
    { type: 'module' },
  );
  ```
- The worker executes:
  1. `JSON.parse(fileContent)`
  2. `@ghec/contracts` semantic validation (`validateBundle`)
  3. `@ghec/analysis` rule execution (`evaluateBundle`)
- The worker reports progress events back to the UI thread via `postMessage`:
  - `status: 'reading'` (0–25%)
  - `status: 'validating'` (25–70%)
  - `status: 'analyzing'` (70–95%)
  - `status: 'ready'` (100% with payload)
  - `status: 'error'` (with sanitized error description)

### 2. Interactive File Upload Progress UI

Update [apps/dashboard/src/components/FileUpload.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/components/FileUpload.tsx):

- Display an animated progress bar and human-readable stage messages during large file ingestion.
- Maintain responsive drag-and-drop and keyboard file picker.
- If validation fails, display a clean error alert with actionable diagnostic guidance without echoing raw file contents.

### 3. Virtualized Table Component

Integrate `@tanstack/react-virtual` in `apps/dashboard/package.json`:

- Create a reusable virtualized table wrapper component: `apps/dashboard/src/components/VirtualizedTable.tsx`.
- Virtualize the rows in:
  - [apps/dashboard/src/features/RepositoriesTab.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/features/RepositoriesTab.tsx)
  - [apps/dashboard/src/features/ActionsAndSecretsTab.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/features/ActionsAndSecretsTab.tsx)
  - [apps/dashboard/src/features/TeamsAndIdentitiesTab.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/features/TeamsAndIdentitiesTab.tsx)
  - [apps/dashboard/src/features/SecurityAndPoliciesTab.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/features/SecurityAndPoliciesTab.tsx)
- Requirements for virtualized tables:
  - Sticky table headers.
  - Full keyboard navigation and ARIA attributes (`aria-rowcount`, `aria-rowindex`).
  - Seamless integration with column sorting and search text filtering.

---

## Target Files

- [apps/dashboard/package.json](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/package.json)
- [apps/dashboard/src/lib/importer.worker.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/lib/) _(new file)_
- [apps/dashboard/src/lib/importer.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/lib/importer.ts)
- [apps/dashboard/src/components/FileUpload.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/components/FileUpload.tsx)
- [apps/dashboard/src/components/VirtualizedTable.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/components/) _(new file)_
- [apps/dashboard/src/features/RepositoriesTab.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/features/RepositoriesTab.tsx)

---

## Acceptance Criteria

1. Loading a 50MB+ bundle displays an interactive stage progress indicator without freezing UI animations.
2. Ingestion crashes or schema errors in the worker are cleanly reported to the user without crashing the React application.
3. Tables rendering 10,000+ items scroll smoothly at 60 FPS.
4. Sorting and filtering work instantaneously across the entire dataset.
5. All accessibility standards (ARIA roles, keyboard focus) remain compliant with `DASH-A11Y-001`.
