#!/usr/bin/env node
try {
  await import('../dist/index.js');
} catch {
  console.error(
    'CLI build unavailable. Run npm run build from the repository root.',
  );
  process.exitCode = 1;
}
