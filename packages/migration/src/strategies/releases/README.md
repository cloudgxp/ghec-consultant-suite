# Large releases fallback

GitHub Enterprise Importer can exclude releases with `--skip-releases` when
release assets exceed 10 GiB or metadata approaches the 40 GiB limit.
`LargeReleasesMigrationStrategy` is the Stage 4 post-GEI fallback for that
case; it refuses to run unless its caller confirms the GEI invocation used the
flag.

The strategy lists source releases, orders them oldest to newest, preserves
release metadata (tag, target commit, draft/prerelease state, body, and latest
mode), and creates a missing target release only when its tag is absent.

## Streaming assets

`GitHubReleaseTransport` downloads each asset with an octet-stream response and
passes the same `ReadableStream` directly to the GitHub uploads endpoint. It
does not call `arrayBuffer()`, `text()`, or materialize asset bytes in memory.
The transport can use distinct source and destination API/upload bases for
data-residency environments.

GitHub REST uploads are limited to 2 GiB per asset. Assets above that threshold
are not uploaded; the result returns an explicit warning for an operator to
transfer the asset manually. At completion, the strategy verifies every source
tag and the count of all REST-eligible target assets, then records the
`releases-fallback` specialized strategy checkpoint.
