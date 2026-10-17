# @ghec/discovery

`@ghec/discovery` runs the 11 discovery collectors, checks permissions, saves progress checkpoints, and writes validated discovery bundles for `ghec-consultant-cli discover` and `@ghec/migration`.

---

## Running discovery collectors in code

By default, `@ghec/discovery` receives its settings (`DiscoveryConfig`) and module list (`DiscoveryPlan`) from the caller without reading environment variables or command-line flags directly.

| Area         | Exported symbols                                                                                                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orchestrator | `DiscoveryOrchestrator`, `DiscoveryPlan`, `DiscoveryConfig`, `DiscoveryResult`, preflight and enumeration GraphQL query constants                                                                                             |
| Collectors   | `collectors` (ordered list of the 11 baseline collectors), `Collector`, `CollectorContext`, `CollectorResult`, `DiscoveredState`, `DiscoveredPolicyItem`, and each collector by name (`orgsCollector`, `reposCollector`, ...) |
| Aggregators  | `OrgMetadataAggregator`, `RepositoryDeepDiscoveryAggregator`, `TeamHierarchyAndAccessAggregator`                                                                                                                              |
| Checkpoints  | `CheckpointManager`, `writeAtomicJson`, `CheckpointManifest`                                                                                                                                                                  |
| Permissions  | `PermissionChecker`, `PreflightPermissionError`, module permission matrix helpers                                                                                                                                             |
| Output       | `publishBundle`, `generateBundleFilename`, pseudonymization and secret-redaction helpers                                                                                                                                      |

To run a discovery scan in code with a `DiscoveryPlan` and `DiscoveryConfig`:

```ts
import { DiscoveryOrchestrator, type DiscoveryPlan } from '@ghec/discovery';

const orchestrator = new DiscoveryOrchestrator(plan, config);
const result = await orchestrator.run(signal);
```

> [!NOTE]
> `@ghec/discovery` uses `@ghec/contracts` to validate output bundles and `@ghec/github-client` to make read-only GitHub API calls.

---

## Building and testing the discovery package

By default, building `@ghec/discovery` compiles all collectors, aggregators, and bundle helpers.

To compile `@ghec/discovery`:

```bash
npm run build -w @ghec/discovery
```

To check TypeScript types in `@ghec/discovery`:

```bash
npm run typecheck -w @ghec/discovery
```

> [!NOTE]
> Tests for `@ghec/discovery` run offline with the CLI test suite (`apps/cli/tests`) using compatibility exports in `apps/cli/src` (see `DEC-017`).
