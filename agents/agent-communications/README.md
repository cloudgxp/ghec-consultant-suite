# Agent Communications & Decision Hub

This directory serves as the centralized decision record, execution log, and blocker tracking registry for **Antigravity** autonomous agent runs during the GHEC Consultant Suite development and migrations.

---

## Channels & Registries

| File                               | Purpose                                                               | When to Update                                                |
| :--------------------------------- | :-------------------------------------------------------------------- | :------------------------------------------------------------ |
| **[`changelog.md`](changelog.md)** | Chronological log of material completions, test evidence, and commits | Every time a task or substantial milestone is completed       |
| **[`decisions.md`](decisions.md)** | Register of technical and architectural decisions                     | When choosing an implementation strategy or interface pattern |
| **[`blockers.md`](blockers.md)**   | Active blockers and technical impediments                             | Immediately when an issue halts or slows down progress        |
| **[`handoffs.md`](handoffs.md)**   | Subagent task handoffs and interface contracts                        | When completing major subsystems or unblocking dependencies   |

---

## Operating Protocol

1. Before starting a new task, check **`blockers.md`** to confirm prerequisites.
2. When creating a new interface or package export, document its usage in a decision or handoff entry.
3. Keep entries concise, structured, and backed by test evidence (`npm run check`).
