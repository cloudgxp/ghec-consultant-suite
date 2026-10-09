#!/usr/bin/env node

/**
 * scripts/new-task.mjs
 * Scaffolds a new task file in .agents/tasks/backlog/ using the canonical template.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const tasksDir = join(repoRoot, '.agents', 'tasks');
const templatePath = join(tasksDir, 'templates', 'task-template.md');
const backlogDir = join(tasksDir, 'backlog');

function printUsage() {
  console.log(`Usage: node scripts/new-task.mjs "<Task Title>" [options]

Options:
  --id=<num>          Explicit task number (e.g. --id=044). Defaults to next available.
  --owner=<owner>     Owner name (default: "agent")
  --packages=<pkgs>   Comma-separated affected packages (e.g. --packages="@ghec/migration,@ghec/contracts")
  --help, -h          Show this help message
`);
}

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(0);
}

const title = args.find((a) => !a.startsWith('--'));
if (!title) {
  console.error('Error: Task title is required.');
  printUsage();
  process.exit(1);
}

function getNextTaskId() {
  const folders = ['backlog', 'in-progress', 'completed'];
  let maxId = 0;

  for (const folder of folders) {
    const dirPath = join(tasksDir, folder);
    try {
      const files = readdirSync(dirPath);
      for (const file of files) {
        const match = file.match(/^TASK-(\d+)/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxId) {
            maxId = num;
          }
        }
      }
    } catch {
      // directory might not exist yet
    }
  }

  return maxId + 1;
}

const idArg = args.find((a) => a.startsWith('--id='));
const explicitId = idArg ? parseInt(idArg.split('=')[1], 10) : null;
const taskIdNum = explicitId ?? getNextTaskId();
const taskIdStr = `TASK-${String(taskIdNum).padStart(3, '0')}`;

const ownerArg = args.find((a) => a.startsWith('--owner='));
const owner = ownerArg ? ownerArg.split('=')[1] : 'agent';

const packagesArg = args.find((a) => a.startsWith('--packages='));
const packages = packagesArg
  ? packagesArg
      .split('=')[1]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
  : [];

const slug = title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const fileName = `${taskIdStr}-${slug}.md`;
const targetPath = join(backlogDir, fileName);

const today = new Date().toISOString().split('T')[0];

const template = readFileSync(templatePath, 'utf8');

const packagesYaml =
  packages.length > 0
    ? '\n' + packages.map((pkg) => `  - "${pkg}"`).join('\n')
    : ' []';

const content = template
  .replace(/id: TASK-000/, `id: ${taskIdStr}`)
  .replace(/title: "<Task Title>"/, `title: "${title}"`)
  .replace(/status: backlog.*$/m, 'status: backlog')
  .replace(/owner: unassigned.*$/m, `owner: ${owner}`)
  .replace(/created_at: YYYY-MM-DD/, `created_at: ${today}`)
  .replace(/packages_affected: \[\]/, `packages_affected:${packagesYaml}`)
  .replace(/# TASK-000: <Task Title>/, `# ${taskIdStr}: ${title}`);

writeFileSync(targetPath, content, 'utf8');
console.log(`Created new task: .agents/tasks/backlog/${fileName}`);
