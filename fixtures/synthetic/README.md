# Fictional discovery bundles

`enterprise-v1.json` contains two fictional organizations, a partial enterprise enumeration, unknown LFS metrics, a failed security collector, and an advisory finding. `organization-v1.json` shows the same contract for one fictional organization.

`specialized-v1.json` provides complete positive coverage for specialized and newly emitted entity kinds: Actions self-hosted and hosted runners, runner groups, native workflows, run summaries, workflow policies, caches, artifacts, environments, configuration metadata, configuration coverage, repository portfolios, CODEOWNERS posture, projects, dependency nodes/edges, and package versions/releases.

`partial-denied-v1.json` exercises permission-denied / HTTP 403 partial collection scenarios. It demonstrates denied configuration coverage, partial collector execution with `permission_denied` error codes, and unknown metric preservation without coercing unobserved values to zero.

All names, timestamps, counts, IDs, and outcomes are invented; no API response or customer data was used.

Run `npm run validate:fixtures`. These fixtures exercise the contract, not live collectors or permission guarantees. Secret **names** are fictional metadata; there are no secret values. Coverage observed/expected counts represent enumerated target resources, not entity counts.
