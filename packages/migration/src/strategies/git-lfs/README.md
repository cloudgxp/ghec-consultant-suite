# Git LFS migration strategy

GitHub Enterprise Importer preserves LFS pointer files but does not transfer
the corresponding LFS objects. `GitLfsMigrationStrategy` is the Stage 4,
post-GEI follow-up that mirrors every historical LFS object from source to
target.

## Preconditions

The strategy refuses to run until its caller confirms GEI has completed. It
then verifies all of the following before creating a mirror:

- The source `.gitattributes` has a `filter=lfs` tracking rule.
- `git lfs version` succeeds on the self-hosted runner.
- The target LFS service, storage quota, and bandwidth quota are enabled.
- When an expected size is available, remaining target storage is sufficient.

The quota check is supplied through `GitLfsQuotaChecker`, because enterprise
billing and LFS quota data may be exposed through different permitted client
integrations.

## Transfer behavior

The strategy creates an isolated mirror below
`./migrations/.staging-lfs/<repository>.git` by default, then performs:

```text
git clone --mirror <source>
git -C <mirror> lfs fetch --all origin
git -C <mirror> remote set-url origin <target>
git -C <mirror> lfs push --all origin
```

Fetch and push retry with bounded backoff. Git credentials are used only for
the process calls and are redacted from diagnostics; do not enable shell trace
logging on the runner. Successful transfers verify that the target repository
and LFS tracking rule are available, persist a completed `git-lfs` specialized
strategy checkpoint, and remove the local mirror. Failed runs preserve the
mirror for investigation or an operator-managed retry.

## Runner capacity

Use a persistent, self-hosted runner with scratch space for the largest
uncompressed LFS history in a cohort, plus the ordinary Git mirror. Avoid
sharing the staging root between concurrent migrations of the same target
repository.
