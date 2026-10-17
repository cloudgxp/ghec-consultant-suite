## What does this Pull Request do?

<!-- Write 1-3 plain-English sentences explaining what problem this solves or what feature it adds. -->

## How to test this change

To verify this change locally, run:

```bash
npm run check
```

<!-- If there is a specific unit test file or CLI command to test, add it below: -->

```bash
# Optional: targeted test or CLI command
```

## Checklist before merging

- [ ] `npm run check` passes cleanly (lint, Prettier format, TypeScript check, build, and offline unit tests).
- [ ] All new unit tests run 100% offline using fake test data from `fixtures/synthetic/` or in-memory mocks.
- [ ] No real tokens (`ghp_*`, `github_pat_*`), secrets, or customer scan bundles are included.
- [ ] Any updated user guides or READMEs follow `.agents/rules/documentation-style.md` (`consultant-style-docs` at an 8th-grade reading level with `"To <do X>:"` + code examples).
