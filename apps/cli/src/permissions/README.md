# Checking required GitHub token permissions

By default, the CLI tracks required token scopes and organization roles for each module using the [permissions matrix](../../../../docs/specs/permissions-matrix.md).

```text
apps/cli/src/permissions/
├── README.md
└── index.ts
```

To preview which modules will run and check whether a token is set without making network calls:

```bash
npm run dev:cli -- discover --modules all --organization "fictional-north" --dry-run
```

> [!NOTE]
> Always check [`docs/specs/permissions-matrix.md`](../../../../docs/specs/permissions-matrix.md) for the minimum fine-grained and classic token permissions required by each module.
