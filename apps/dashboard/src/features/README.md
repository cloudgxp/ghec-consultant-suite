# Organizing dashboard feature modules

By default, `apps/dashboard/src/features/` groups domain-specific views, filters, and state logic by feature area (`docs/specs/dashboard-architecture.md`).

```text
apps/dashboard/src/features/
└── README.md
```

To check TypeScript types after adding or updating a feature module:

```bash
npm run typecheck -w @ghec/dashboard
```

To run browser interaction tests across dashboard features:

```bash
npm run test:e2e -w @ghec/dashboard
```

> [!NOTE]
> See [`docs/specs/dashboard-architecture.md`](../../../../docs/specs/dashboard-architecture.md) for the dashboard feature layout and data-flow design.
