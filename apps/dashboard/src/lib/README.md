# Using shared dashboard helper utilities

By default, `apps/dashboard/src/lib/` holds pure helper functions for loading discovery bundles, formatting numbers, and generating PDF and CSV exports (`docs/specs/dashboard-architecture.md`).

```text
apps/dashboard/src/lib/
└── README.md
```

To check TypeScript types across all dashboard helper utilities:

```bash
npm run typecheck -w @ghec/dashboard
```

To build the dashboard and verify that all helper imports bundle cleanly:

```bash
npm run build -w @ghec/dashboard
```

> [!NOTE]
> Helpers in this folder run strictly in the browser without calling external servers. See [`docs/specs/dashboard-architecture.md`](../../../../docs/specs/dashboard-architecture.md) for more details.
