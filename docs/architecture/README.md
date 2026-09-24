# System boundaries

```text
CLI commands → configuration/preflight → orchestration → collector modules
                                               ↓ injected read adapter
                                      Octokit GraphQL / REST (future)
collector evidence → allowlist/redaction → shared contract → atomic JSON (future)
local file (explicit import) → shared contract → pure analysis → React views
                                                          → CSV / jsPDF
```

`@ghec/contracts` is the public interface and has no Node-only dependencies. `@ghec/analysis` depends only on the contract and exports a rule interface; rules are not implemented. CLI placeholders and the static dashboard compile independently after the shared packages. Configurations are shared at the root rather than through an unnecessary workspace.

The read adapter interface is a design seam, not an implementation of rate limiting, authentication, read-only enforcement or provenance capture. Those are verified release gates. See the CLI/dashboard specifications and ADRs.
