# @ghec/discovery

Headless discovery engine extracted from `apps/cli`. It runs the collectors,
permission preflight, checkpointing, and bundle publishing without any CLI
concerns, so both `ghec-consultant-cli discover` and the future
`@ghec/migration` package can reuse it.

Dependencies: `@ghec/contracts` (schemas) and `@ghec/github-client`
(transport). The package never reads environment variables or argv; the host
app resolves credentials into a `DiscoveryConfig` and flags into a
`DiscoveryPlan`.

## Public exports

| Area         | Exports                                                                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orchestrator | `DiscoveryOrchestrator`, `DiscoveryPlan`, `DiscoveryConfig`, `DiscoveryResult`, preflight/enumeration GraphQL query constants                                                                                                 |
| Collectors   | `collectors` (ordered list of the 11 baseline collectors), `Collector`, `CollectorContext`, `CollectorResult`, `DiscoveredState`, `DiscoveredPolicyItem`, and each collector by name (`orgsCollector`, `reposCollector`, ...) |
| Aggregators  | `OrgMetadataAggregator`, `RepositoryDeepDiscoveryAggregator`, `TeamHierarchyAndAccessAggregator`                                                                                                                              |
| Checkpoints  | `CheckpointManager`, `writeAtomicJson`, `CheckpointManifest`                                                                                                                                                                  |
| Permissions  | `PermissionChecker`, `PreflightPermissionError`, module permission matrix helpers                                                                                                                                             |
| Output       | `publishBundle`, `generateBundleFilename`, pseudonymization and secret-redaction helpers                                                                                                                                      |

## Usage

```ts
import { DiscoveryOrchestrator, type DiscoveryPlan } from '@ghec/discovery';

const orchestrator = new DiscoveryOrchestrator(plan, config);
const result = await orchestrator.run(signal);
```

## Development

```bash
npm run build -w @ghec/discovery
npm run typecheck -w @ghec/discovery
```

Tests currently live with the CLI suite (`apps/cli/tests`) and import through
compatibility shims in `apps/cli/src` (see DEC-017).
