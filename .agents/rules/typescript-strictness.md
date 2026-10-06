---
trigger: always_on
description: 'Enforces strict TypeScript 6.x rules, explicit return types on module boundaries, ESM imports, and node: protocol prefixes.'
---

# Invariant: TypeScript Strictness & ESM Standards

## 1. Typing & Signatures

- **Prohibition of `any`:** Never use `any`. Use `unknown` with type narrowing, discriminated unions, or generic type constraints.
- **Explicit Return Types:** Exported functions, API boundaries, and module lifecycle methods must declare explicit return types.
- **Readonly Immature State:** Data transfer objects, schema outputs, and migration actions must use `readonly` properties or `ReadonlyArray<T>` where mutations are not intended.

## 2. ES Module & Import Syntax

- **`node:` Protocol Imports:** All Node.js built-ins must be imported with the `node:` protocol prefix (e.g. `import { readFileSync } from 'node:fs';`, `import { join } from 'node:path';`).
- **File Extensions in Relative Imports:** Internal relative imports must use the `.js` extension (e.g. `import { foo } from './foo.js';`) even in TypeScript source files to satisfy Node ESM resolution.
- **Type-Only Imports:** Use `import type { ... }` when importing interfaces or type aliases to prevent unused runtime dependencies.

## 3. Error Handling

- Never throw untyped strings or raw primitives. Always throw instances of `Error` with descriptive, sanitized messages.
- Catch clauses should type errors defensively:
  ```ts
  try {
    // action
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Contextual failure: ${sanitizeDiagnostics(message)}`);
  }
  ```
