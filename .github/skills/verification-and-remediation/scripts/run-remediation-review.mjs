#!/usr/bin/env node

/**
 * run-remediation-review.mjs
 * Wraps ghec-consultant-cli agent-review with standard parameters and outputs.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node run-remediation-review.mjs --report <path-to-verification-report.json> [options]

Options:
  --report <file>            Path to verification report JSON (required)
  --output <file>            Path for remediation-plan.json (default: ./scans/remediation-plan.json)
  --output-markdown <file>   Path for remediation-plan.md (default: ./scans/remediation-plan.md)
  --spec <file>              Path to agent spec (default: docs/specs/verification-remediation-agent.md)
  --help, -h                 Display this help message
`);
  process.exit(0);
}

const rootDir = process.cwd();
const cliPath = resolve(rootDir, 'apps/cli/bin/ghec-consultant-cli.mjs');

let reportPath = '';
let outputPath = './scans/remediation-plan.json';
let outputMarkdownPath = './scans/remediation-plan.md';
let specPath = 'docs/specs/verification-remediation-agent.md';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--report' && args[i + 1]) {
    reportPath = args[++i];
  } else if (args[i] === '--output' && args[i + 1]) {
    outputPath = args[++i];
  } else if (args[i] === '--output-markdown' && args[i + 1]) {
    outputMarkdownPath = args[++i];
  } else if (args[i] === '--spec' && args[i + 1]) {
    specPath = args[++i];
  }
}

if (!reportPath) {
  console.error('Error: Missing required argument: --report <file>');
  process.exit(1);
}

if (!existsSync(resolve(rootDir, reportPath))) {
  console.error(`Error: Verification report not found: ${reportPath}`);
  process.exit(1);
}

console.log(`Starting Agentic Remediation Review...`);
console.log(`Report: ${reportPath}`);
console.log(`Spec  : ${specPath}`);
console.log(`Output: ${outputPath}`);

try {
  execFileSync(
    process.execPath,
    [
      cliPath,
      'agent-review',
      '--report',
      reportPath,
      '--spec',
      specPath,
      '--output',
      outputPath,
      '--output-markdown',
      outputMarkdownPath,
      '--append-step-summary',
    ],
    {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: 'inherit',
    },
  );
  console.log(`\n✅ Remediation review completed successfully.`);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n❌ Remediation review failed: ${message}`);
  process.exit(1);
}
