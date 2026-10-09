# @ghec/analysis — Deterministic Migration Readiness & Risk Heuristics

The `@ghec/analysis` package contains deterministic analysis algorithms, heuristic scoring, and risk classification engines for GitHub Enterprise Cloud (GHEC) migration assessments.

---

## Key Features

1. **Deterministic Readiness Scoring:**
   - Evaluates discovery bundles strictly offline without network dependencies.
   - Calculates numerical complexity scores and risk tiers (Green, Yellow, Red) based on repository characteristics, asset sizes, and security configurations.
2. **Platform Boundary & Blocker Detection:**
   - **Repository Size Limits:** Flags repositories exceeding GitHub Enterprise Importer (GEI) thresholds (>40 GiB repository git size, >2 GiB single commit size).
   - **Large Release Assets:** Flags releases with assets >10 GiB requiring specialized streaming migration strategies.
   - **Git LFS Assets:** Identifies Git LFS tracking requirements and post-transfer dual-remote stream requirements.
   - **Governance & Ruleset Bypass:** Detects missing or non-exempt ruleset bypass actors (DEC-012).
3. **Cross-Entity Dependency Mapping:**
   - Constructs dependency graphs across repositories, shared Actions workflows, organization variables, environment secrets, and outside collaborators.

---

## Usage

```ts
import { analyzeBundle, buildDependencyGraph } from '@ghec/analysis';
import type { DiscoveryBundle } from '@ghec/contracts';

// Analyze an immutable discovery bundle
const report = analyzeBundle(discoveryBundle);

console.log(`Overall Readiness Score: ${report.summary.readinessScore}`);
console.log(`Blocked Repositories: ${report.summary.blockedCount}`);
```

---

## Verification

```bash
# Run type checking
npm run typecheck -w @ghec/analysis

# Build package
npm run build -w @ghec/analysis
```
