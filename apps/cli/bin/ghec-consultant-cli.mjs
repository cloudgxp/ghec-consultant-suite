#!/usr/bin/env node
try {
  const { runCli } = await import('../dist/index.js');
  process.exitCode = await runCli();
} catch {
  console.error(
    'CLI build unavailable. Run npm run build from the repository root.',
  );
  process.exitCode = 1;
}
