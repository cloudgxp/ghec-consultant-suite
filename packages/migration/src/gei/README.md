# GEI process wrapper

This package wraps GitHub Enterprise Importer (`gh gei`) as a typed,
testable process boundary. It never puts source or target PATs in command
arguments: `GeiProcessExecutor` supplies them only as `GH_SOURCE_PAT` and
`GH_PAT` environment variables, and sanitizes process output before it is
returned or forwarded to a logger.

## Prerequisites

Install the GitHub CLI and the GEI extension on the self-hosted runner:

```shell
gh extension install github/gh-gei
```

Call `checkGeiPreflight()` before starting a cutover. It reports independent
diagnostics for the `gh` binary and the GEI extension, including the matching
installation command when either is absent.

## Starting and monitoring a migration

```ts
const executor = new GeiProcessExecutor();
const result = await executor.execute({
  sourceOrg: 'source-org',
  sourceRepo: 'application',
  targetOrg: 'target-org',
  targetRepo: 'application',
  sourceToken: process.env.GHEC_SOURCE_TOKEN,
  targetToken: process.env.GHEC_TARGET_TOKEN,
  targetRepoVisibility: 'internal',
});

if (result.migrationId) {
  await pollGeiMigrationStatus(result.migrationId, targetClient, signal, {
    targetOrg: 'target-org',
  });
}
```

The executor adds `--skip-releases` when requested explicitly, when releases
exceed 10 GiB, or when repository metadata exceeds 40 GiB. It supports source
and target API endpoint flags for data-residency tenants, cancellation through
`AbortSignal`, and a timeout. On cancellation, call `abortGeiMigration()` with
the same API endpoint options.

## Migration logs

Call `downloadMigrationLogs()` as soon as GEI completes. GitHub makes these
logs available for only 24 hours. The function writes
`<target-repo>-migration.log` below the supplied output directory and returns
the warnings detected in it, including metadata-size and missing-comment
messages.

All child-process calls use argument arrays with no shell, and the injectable
`GeiCommandRunner` seam makes command construction testable without a live GEI
installation.
