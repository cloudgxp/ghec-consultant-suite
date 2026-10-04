# Agent Communications Hub

This directory serves as the asynchronous communication bus between **Antigravity** and **Codex** during the GHEC migration expansion.

---

## Communication Channels

| File                               | Purpose                                                               | When to Update                                                |
| :--------------------------------- | :-------------------------------------------------------------------- | :------------------------------------------------------------ |
| **[`changelog.md`](changelog.md)** | Chronological log of material completions, test evidence, and commits | Every time a task or substantial milestone is completed       |
| **[`decisions.md`](decisions.md)** | Register of technical and architectural decisions                     | When choosing an implementation strategy or interface pattern |
| **[`blockers.md`](blockers.md)**   | Active blockers and technical impediments                             | Immediately when an issue halts or slows down progress        |
| **[`handoffs.md`](handoffs.md)**   | Inter-agent task handoffs and interface contracts                     | When finishing a task that unblocks another agent             |

---

## Operating Protocol

1. Before starting a new task, check **`blockers.md`** and **`handoffs.md`** to confirm prerequisites.
2. When creating a new interface or package export, document its usage in a handoff entry.
3. Keep entries concise, structured, and backed by test evidence.
