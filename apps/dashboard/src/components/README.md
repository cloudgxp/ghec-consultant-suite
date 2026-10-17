# Building shared UI components

By default, `apps/dashboard/src/components/` stores reusable GitHub Primer React interface components shared across dashboard pages (`docs/specs/dashboard-architecture.md`).

```text
apps/dashboard/src/components/
├── README.md
└── ui/
    └── index.tsx
```

To verify that all shared UI components pass TypeScript checks:

```bash
npm run typecheck -w @ghec/dashboard
```

To check that components follow the Primer React styling rules:

```bash
npm run check:styles -w @ghec/dashboard
```

> [!NOTE]
> See [`docs/specs/dashboard-architecture.md`](../../../../docs/specs/dashboard-architecture.md) for full details on how shared UI components are organized.
