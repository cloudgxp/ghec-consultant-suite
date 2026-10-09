---
trigger: always_on
description: 'Instructs agents to consult the local references/github-docs directory for accurate GitHub documentation and API information.'
---

# Invariant: Local GitHub Documentation Usage

## 1. Local Documentation Source of Truth

- The workspace contains a local copy of GitHub's official documentation in the `references/github-docs/` directory.
- When making architectural choices, writing GitHub REST or GraphQL API integrations, or addressing Enterprise Managed Users (EMU) constraints, **agents must consult `references/github-docs/`** to ensure accuracy.

## 2. Ensuring Accuracy

- Do not guess or rely on prior knowledge for GitHub API shapes, rate limit mechanics, or enterprise feature details.
- Always use file search or view the contents of `references/github-docs/content/` to read the relevant markdown files and verify the precise documentation locally before implementing solutions.
