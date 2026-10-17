# Checking Repositories for Migration Blockers (Preflight)

By default, the preflight checker inspects your source repositories and target organization before you start a migration. It catches oversized files, large commits, and missing ruleset bypass settings early so your migration does not fail halfway through.

| Check                         | GitHub Limit           | What Happens If Exceeded                                                     |
| :---------------------------- | :--------------------- | :--------------------------------------------------------------------------- |
| **Total Repository Git Data** | $\le 40\text{ GiB}$    | **Blocked** — You must shrink the repository before migrating.               |
| **Single Git Commit**         | $\le 2\text{ GiB}$     | **Blocked** — You must split the commit before migrating.                    |
| **Single File During Import** | $\le 400\text{ MiB}$   | **Blocked** — Move the file to Git LFS before migrating.                     |
| **Single File After Cutover** | $\le 100\text{ MiB}$   | **Warning** — Imports cleanly, but future Git pushes will fail without LFS.  |
| **Git Branch or Tag Name**    | $\le 255\text{ bytes}$ | **Blocked** — Shorten the branch or tag name before migrating.               |
| **Total Release Assets**      | $\le 10\text{ GiB}$    | **Special Strategy** — Uses `--skip-releases` and streams assets separately. |

## Running preflight checks before a migration

By default, the preflight command checks every repository in your scope and groups each one as `ready`, `ready-with-follow-up` (needs Git LFS copy), `requires-special-strategy` (large releases), or `blocked`.

To run preflight checks for a single repository:

```bash
npm run dev:cli -- preflight \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service"
```

To preview preflight checks during a dry-run migration without modifying GitHub, add `--dry-run`:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --dry-run
```

To check a full wave of repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "legacy-monolith"]
}
```

```bash
npm run dev:cli -- preflight \
  --scope ./scopes/wave-1.json
```

> [!WARNING]
> Every active ruleset on your target organization must include **Repository migrations** in its bypass list with the mode set to **Exempt**. Setting a ruleset to "Always allow" still evaluates every pushed commit and causes GEI imports to time out.

## Checking local repository sizes with `git-sizer`

By default, preflight reads repository sizes from the GitHub API, or you can feed it JSON output from `git-sizer` for deeper commit and blob checks.

To generate a JSON size report from a local Git clone using `git-sizer`:

```bash
git-sizer --no-progress -j > git-sizer-report.json
```

## Testing the preflight checker offline

By default, the preflight unit tests check size limits, credential scopes, and ruleset bypass warnings using local mock data.

To run the preflight unit tests offline:

```bash
node --import tsx --test packages/migration/tests/preflight/evaluator.test.ts packages/migration/tests/preflight/sizer.test.ts packages/migration/tests/preflight/credential-inspector.test.ts
```
