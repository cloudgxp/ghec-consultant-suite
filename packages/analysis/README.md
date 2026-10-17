# @ghec/analysis — Migration Readiness & Risk Scoring

`@ghec/analysis` calculates migration readiness scores, finds size blockers, and maps dependencies across repositories, workflows, secrets, and teams.

---

## Scoring migration readiness and finding blockers

By default, `@ghec/analysis` inspects a `DiscoveryBundle` completely offline without making any network calls and groups repositories into Green, Yellow, and Red risk tiers:

- **Repository size limits**: Flags repositories that exceed GitHub Enterprise Importer (GEI) limits (over 40 GiB total git size or over 2 GiB in a single commit).
- **Large release files**: Flags releases with files over 10 GiB that need the large-release streaming helper.
- **Git LFS files**: Identifies repositories that use Git LFS and require a follow-up LFS push after transfer.
- **Ruleset bypass rules**: Flags rulesets that are missing the required migration bypass setting (`DEC-012`).
- **Dependency mapping**: Connects repositories, shared Actions workflows, organization variables, environment secrets, and outside collaborators.

To score a discovery bundle and check how many repositories are blocked:

```ts
import { analyzeBundle } from '@ghec/analysis';
import type { DiscoveryBundle } from '@ghec/contracts';

const report = analyzeBundle(discoveryBundle);

console.log(`Overall Readiness Score: ${report.summary.readinessScore}`);
console.log(`Blocked Repositories: ${report.summary.blockedCount}`);
```

To build a cross-repository dependency graph from a discovery bundle:

```ts
import { buildDependencyGraph } from '@ghec/analysis';

const graph = buildDependencyGraph(discoveryBundle);
```

> [!NOTE]
> All scoring functions are pure and run in memory, so you can call them in both the CLI and the offline browser dashboard.

---

## Building and testing the analysis package

By default, building `@ghec/analysis` compiles the readiness rules and TypeScript declarations for the CLI and dashboard.

To check TypeScript types in `@ghec/analysis`:

```bash
npm run typecheck -w @ghec/analysis
```

To compile the `@ghec/analysis` package:

```bash
npm run build -w @ghec/analysis
```
