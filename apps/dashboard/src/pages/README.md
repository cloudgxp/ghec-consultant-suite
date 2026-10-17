# Rendering top-level dashboard pages

By default, `apps/dashboard/src/pages/` contains the top-level page views that connect uploaded discovery bundles to summary cards, tables, and export tools (`docs/specs/dashboard-architecture.md`).

```text
apps/dashboard/src/pages/
└── README.md
```

To start the local development server and preview page changes in your browser:

```bash
npm run dev -w @ghec/dashboard
```

To run end-to-end page navigation and accessibility checks:

```bash
npm run test:e2e -w @ghec/dashboard
```

> [!NOTE]
> See [`docs/specs/dashboard-architecture.md`](../../../../docs/specs/dashboard-architecture.md) for the full list of dashboard views and navigation routes.
