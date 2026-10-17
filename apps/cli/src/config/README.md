# Loading CLI configuration and credentials

By default, the CLI reads your GitHub token from the `GHEC_TOKEN` environment variable or an approved operating-system credential store, and never accepts tokens as command-line arguments.

```text
apps/cli/src/config/
├── README.md
└── index.ts
```

To set your source GitHub token in your shell before running a CLI command:

```bash
export GHEC_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
```

To point the CLI at a GitHub Enterprise Server instance or local test proxy:

```bash
export GHEC_BASE_URL="https://github.example.com/api/v3"
```

> [!WARNING]
> Never pass personal access tokens on the command line where they can be saved in shell history or process lists.
